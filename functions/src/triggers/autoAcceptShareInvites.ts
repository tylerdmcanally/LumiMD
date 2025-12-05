/**
 * Auto-accept share invites when a user signs up
 * Checks for pending invites matching the new user's email
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

export const autoAcceptShareInvites = functions.auth.user().onCreate(async (user: functions.auth.UserRecord) => {
  try {
    const userEmail = user.email?.toLowerCase();
    if (!userEmail) {
      functions.logger.info(
        `[autoAcceptShareInvites] User ${user.uid} has no email, skipping invite check`,
      );
      return;
    }

    const db = admin.firestore();

    // Find pending invites for this email
    const invitesSnapshot = await db
      .collection('shareInvites')
      .where('inviteeEmail', '==', userEmail)
      .where('status', '==', 'pending')
      .get();

    if (invitesSnapshot.empty) {
      functions.logger.info(
        `[autoAcceptShareInvites] No pending invites found for ${userEmail}`,
      );
      return;
    }

    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();

    for (const inviteDoc of invitesSnapshot.docs) {
      const invite = inviteDoc.data();

      // Check if expired
      const expiresAt = invite.expiresAt?.toMillis() || 0;
      const currentTime = Date.now();
      if (currentTime > expiresAt) {
        // Mark as expired
        batch.update(inviteDoc.ref, {
          status: 'expired',
          updatedAt: now,
        });
        continue;
      }

      // Create the share
      const shareId = `${invite.ownerId}_${user.uid}`;
      const shareRef = db.collection('shares').doc(shareId);

      batch.set(shareRef, {
        ownerId: invite.ownerId,
        caregiverUserId: user.uid,
        caregiverEmail: invite.inviteeEmail,
        role: invite.role,
        status: 'accepted',
        message: invite.message || null,
        createdAt: now,
        updatedAt: now,
        acceptedAt: now,
      });

      // Mark invite as accepted
      batch.update(inviteDoc.ref, {
        status: 'accepted',
        acceptedAt: now,
        updatedAt: now,
      });

      functions.logger.info(
        `[autoAcceptShareInvites] Auto-accepted invite ${inviteDoc.id} for user ${user.uid} from owner ${invite.ownerId}`,
      );
    }

    await batch.commit();

    functions.logger.info(
      `[autoAcceptShareInvites] Processed ${invitesSnapshot.size} invite(s) for user ${user.uid}`,
    );
  } catch (error) {
    functions.logger.error(
      `[autoAcceptShareInvites] Error processing invites for user ${user.uid}:`,
      error,
    );
    // Don't throw - we don't want to block user creation if invite processing fails
  }
});

