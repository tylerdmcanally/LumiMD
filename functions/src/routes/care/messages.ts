/**
 * Caregiver → Patient Messaging Routes
 *
 * One-way messaging from caregiver to patient.
 * Messages arrive as push notifications on the patient's device.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AuthRequest, requireAuth } from '../../middlewares/auth';
import { ensureCaregiverAccessOrReject } from '../../middlewares/caregiverAccess';
import { sanitizePlainText } from '../../utils/inputSanitization';
import { getNotificationService } from '../../services/notifications';
import { createDomainServiceContainer } from '../../services/domain/serviceContainer';

const MESSAGE_MAX_LENGTH = 500;
const DAILY_MESSAGE_LIMIT = 10;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

type RegisterCareMessagesRoutesOptions = {
    getDb: () => FirebaseFirestore.Firestore;
};

export function registerCareMessagesRoutes(
    router: Router,
    options: RegisterCareMessagesRoutesOptions,
): void {
    const { getDb } = options;

    const toISOStringSafe = (value: unknown): string | null => {
        if (!value) return null;
        try {
            if (
                typeof value === 'object' &&
                value !== null &&
                typeof (value as { toDate?: unknown }).toDate === 'function'
            ) {
                return (value as { toDate: () => Date }).toDate().toISOString();
            }
            const date = new Date(value as string | number | Date);
            if (Number.isNaN(date.getTime())) return null;
            return date.toISOString();
        } catch {
            return null;
        }
    };

    // =========================================================================
    // POST /v1/care/:patientId/messages — Send a message to patient
    // =========================================================================
    router.post('/:patientId/messages', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const db = getDb();

            // Verify caregiver access
            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            // Validate message body
            const rawMessage = req.body?.message;
            if (typeof rawMessage !== 'string' || rawMessage.trim().length === 0) {
                res.status(400).json({
                    code: 'validation_failed',
                    message: 'Message text is required',
                });
                return;
            }

            const sanitizedMessage = sanitizePlainText(rawMessage, MESSAGE_MAX_LENGTH);
            if (sanitizedMessage.length === 0) {
                res.status(400).json({
                    code: 'validation_failed',
                    message: 'Message text is required',
                });
                return;
            }

            // Rate limit: 10 messages per day per caregiver-patient pair
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayStartTs = admin.firestore.Timestamp.fromDate(todayStart);

            const dailyCountSnapshot = await db
                .collection('caregiverMessages')
                .where('senderId', '==', caregiverId)
                .where('recipientId', '==', patientId)
                .where('createdAt', '>=', todayStartTs)
                .limit(DAILY_MESSAGE_LIMIT)
                .get();

            if (dailyCountSnapshot.size >= DAILY_MESSAGE_LIMIT) {
                res.status(429).json({
                    code: 'rate_limit',
                    message: `Daily message limit of ${DAILY_MESSAGE_LIMIT} reached for this patient`,
                });
                return;
            }

            // Resolve caregiver display name from share record, profile, or auth
            let senderName: string = 'Your caregiver';
            try {
                // 1. Check the share record for caregiverName (patient-chosen label)
                const shareSnap = await db
                    .collection('shares')
                    .where('caregiverUserId', '==', caregiverId)
                    .where('ownerId', '==', patientId)
                    .where('status', '==', 'accepted')
                    .limit(1)
                    .get();

                if (!shareSnap.empty) {
                    const shareData = shareSnap.docs[0].data();
                    if (typeof shareData.caregiverName === 'string' && shareData.caregiverName.trim()) {
                        senderName = shareData.caregiverName.trim();
                    }
                }

                // 2. If no name from share, try user profile
                if (senderName === 'Your caregiver') {
                    const { userService } = createDomainServiceContainer({ db });
                    const caregiverUser = await userService.getById(caregiverId);
                    const profileName =
                        caregiverUser?.preferredName ||
                        caregiverUser?.firstName ||
                        caregiverUser?.displayName;
                    if (typeof profileName === 'string' && profileName.trim()) {
                        senderName = profileName.trim();
                    } else if (typeof caregiverUser?.email === 'string' && caregiverUser.email.trim()) {
                        senderName = caregiverUser.email.trim();
                    }
                }

                // 3. If still generic, try Firebase Auth displayName
                if (senderName === 'Your caregiver') {
                    const authUser = await admin.auth().getUser(caregiverId);
                    if (authUser.displayName && authUser.displayName.trim()) {
                        senderName = authUser.displayName.trim();
                    } else if (authUser.email) {
                        senderName = authUser.email;
                    }
                }
            } catch (nameError) {
                functions.logger.warn('[care][messages] Failed to resolve caregiver name:', nameError);
            }

            // Create the message document
            const now = admin.firestore.Timestamp.now();
            const messageDoc = {
                senderId: caregiverId,
                senderName,
                recipientId: patientId,
                message: sanitizedMessage,
                readAt: null,
                createdAt: now,
                deletedAt: null,
            };

            const docRef = await db.collection('caregiverMessages').add(messageDoc);

            functions.logger.info(
                `[care][messages] Caregiver ${caregiverId} sent message to patient ${patientId}`,
                { messageId: docRef.id },
            );

            // Send push notification to patient
            try {
                const notificationService = getNotificationService();
                const tokens = await notificationService.getUserPushTokens(patientId);

                if (tokens.length > 0) {
                    const truncatedBody =
                        sanitizedMessage.length > 100
                            ? sanitizedMessage.substring(0, 97) + '...'
                            : sanitizedMessage;

                    const payloads = tokens.map((t) => ({
                        to: t.token,
                        title: `${senderName} sent you a message`,
                        body: truncatedBody,
                        data: {
                            type: 'caregiver_message',
                            messageId: docRef.id,
                        },
                        sound: 'default' as const,
                        priority: 'high' as const,
                    }));

                    const results = await notificationService.sendNotifications(payloads);

                    // Clean up invalid tokens
                    for (let i = 0; i < results.length; i++) {
                        if (results[i].details?.error === 'DeviceNotRegistered') {
                            await notificationService.removeInvalidToken(patientId, tokens[i].token);
                        }
                    }
                }
            } catch (pushError) {
                functions.logger.error(
                    '[care][messages] Failed to send push notification:',
                    pushError,
                );
                // Don't fail the request — message was saved
            }

            // Calculate remaining messages today
            const remainingToday = DAILY_MESSAGE_LIMIT - dailyCountSnapshot.size - 1;

            res.status(201).json({
                id: docRef.id,
                senderId: caregiverId,
                message: sanitizedMessage,
                senderName,
                createdAt: now.toDate().toISOString(),
                readAt: null,
                remainingToday: Math.max(0, remainingToday),
            });
        } catch (error) {
            functions.logger.error('[care][messages] Error sending message:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to send message',
            });
        }
    });

    // =========================================================================
    // GET /v1/care/:patientId/messages — List sent messages (caregiver view)
    // =========================================================================
    router.get('/:patientId/messages', requireAuth, async (req: AuthRequest, res) => {
        try {
            const caregiverId = req.user!.uid;
            const patientId = req.params.patientId;
            const db = getDb();

            if (!(await ensureCaregiverAccessOrReject(caregiverId, patientId, res))) {
                return;
            }

            const rawLimit = req.query.limit;
            const cursor = typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
                ? req.query.cursor.trim()
                : null;

            let limit = PAGE_SIZE_DEFAULT;
            if (rawLimit !== undefined) {
                const parsed = parseInt(String(rawLimit), 10);
                if (Number.isFinite(parsed) && parsed > 0) {
                    limit = Math.min(parsed, PAGE_SIZE_MAX);
                }
            }

            let query = db
                .collection('caregiverMessages')
                .where('senderId', '==', caregiverId)
                .where('recipientId', '==', patientId)
                .where('deletedAt', '==', null)
                .orderBy('createdAt', 'desc')
                .limit(limit + 1); // Fetch one extra to determine hasMore

            if (cursor) {
                try {
                    const cursorDoc = await db.collection('caregiverMessages').doc(cursor).get();
                    if (cursorDoc.exists) {
                        query = query.startAfter(cursorDoc);
                    }
                } catch {
                    // Ignore bad cursor
                }
            }

            const snapshot = await query.get();
            const docs = snapshot.docs;
            const hasMore = docs.length > limit;
            const resultDocs = hasMore ? docs.slice(0, limit) : docs;
            const nextCursor = hasMore ? resultDocs[resultDocs.length - 1].id : null;

            const messages = resultDocs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    message: data.message,
                    senderName: data.senderName,
                    readAt: toISOStringSafe(data.readAt),
                    createdAt: toISOStringSafe(data.createdAt),
                };
            });

            res.set('X-Has-More', hasMore ? 'true' : 'false');
            res.set('X-Next-Cursor', nextCursor || '');
            res.set('Cache-Control', 'private, no-cache');
            res.json(messages);
        } catch (error) {
            functions.logger.error('[care][messages] Error listing messages:', error);
            res.status(500).json({
                code: 'server_error',
                message: 'Failed to fetch messages',
            });
        }
    });
}
