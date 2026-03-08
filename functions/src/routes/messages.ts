/**
 * Patient Messages Routes
 *
 * Patient-side inbox for reading messages from caregivers.
 * Messages are created by caregivers via /v1/care/:patientId/messages.
 */

import { Router } from 'express';
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { AuthRequest, requireAuth } from '../middlewares/auth';

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

export const messagesRouter = Router();

const getDb = () => admin.firestore();

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
// GET /v1/messages — Patient inbox (list messages from caregivers)
// =========================================================================
messagesRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const db = getDb();

        const rawLimit = req.query.limit;
        const cursor =
            typeof req.query.cursor === 'string' && req.query.cursor.trim().length > 0
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
            .where('recipientId', '==', userId)
            .where('deletedAt', '==', null)
            .orderBy('createdAt', 'desc')
            .limit(limit + 1);

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
                senderId: data.senderId,
                senderName: data.senderName,
                message: data.message,
                readAt: toISOStringSafe(data.readAt),
                createdAt: toISOStringSafe(data.createdAt),
            };
        });

        // Auto-mark unread messages as read when fetched
        const unreadDocs = resultDocs.filter((doc) => {
            const data = doc.data();
            return !data.readAt;
        });

        if (unreadDocs.length > 0) {
            const batch = db.batch();
            const now = admin.firestore.Timestamp.now();
            unreadDocs.forEach((doc) => {
                batch.update(doc.ref, { readAt: now });
            });

            try {
                await batch.commit();
                // Update the response to reflect the read status
                const nowISO = now.toDate().toISOString();
                messages.forEach((msg) => {
                    if (!msg.readAt) {
                        msg.readAt = nowISO;
                    }
                });
            } catch (batchError) {
                functions.logger.warn(
                    '[messages] Failed to batch-mark messages as read:',
                    batchError,
                );
                // Don't fail the request — messages were still fetched
            }
        }

        res.set('X-Has-More', hasMore ? 'true' : 'false');
        res.set('X-Next-Cursor', nextCursor || '');
        res.set('Cache-Control', 'private, no-cache');
        res.json(messages);
    } catch (error) {
        functions.logger.error('[messages] Error listing patient messages:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to fetch messages',
        });
    }
});

// =========================================================================
// PATCH /v1/messages/:id/read — Mark a single message as read
// =========================================================================
messagesRouter.patch('/:id/read', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const messageId = req.params.id;
        const db = getDb();

        const docRef = db.collection('caregiverMessages').doc(messageId);
        const doc = await docRef.get();

        if (!doc.exists) {
            res.status(404).json({
                code: 'not_found',
                message: 'Message not found',
            });
            return;
        }

        const data = doc.data()!;

        // Verify this message belongs to the requesting user
        if (data.recipientId !== userId) {
            res.status(403).json({
                code: 'forbidden',
                message: 'You do not have access to this message',
            });
            return;
        }

        // Only set readAt if not already set
        if (!data.readAt) {
            const now = admin.firestore.Timestamp.now();
            await docRef.update({ readAt: now });

            res.json({
                id: messageId,
                senderId: data.senderId,
                senderName: data.senderName,
                message: data.message,
                readAt: now.toDate().toISOString(),
                createdAt: toISOStringSafe(data.createdAt),
            });
        } else {
            // Already read
            res.json({
                id: messageId,
                senderId: data.senderId,
                senderName: data.senderName,
                message: data.message,
                readAt: toISOStringSafe(data.readAt),
                createdAt: toISOStringSafe(data.createdAt),
            });
        }
    } catch (error) {
        functions.logger.error('[messages] Error marking message as read:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to mark message as read',
        });
    }
});

// =========================================================================
// GET /v1/messages/unread-count — Get count of unread messages
// =========================================================================
messagesRouter.get('/unread-count', requireAuth, async (req: AuthRequest, res) => {
    try {
        const userId = req.user!.uid;
        const db = getDb();

        const snapshot = await db
            .collection('caregiverMessages')
            .where('recipientId', '==', userId)
            .where('deletedAt', '==', null)
            .where('readAt', '==', null)
            .limit(100) // Cap for performance
            .get();

        res.set('Cache-Control', 'private, no-cache');
        res.json({ count: snapshot.size });
    } catch (error) {
        functions.logger.error('[messages] Error getting unread count:', error);
        res.status(500).json({
            code: 'server_error',
            message: 'Failed to get unread count',
        });
    }
});
