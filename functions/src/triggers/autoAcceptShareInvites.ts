/**
 * Auto-accept share invites when a user signs up
 * Checks for pending invites matching the new user's email
 * 
 * Note: Invites can have email stored as either 'inviteeEmail' (old) or 'caregiverEmail' (new)
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

export const autoAcceptShareInvites = functions.auth.user().onCreate(async (user: functions.auth.UserRecord) => {
  try {
    const userEmail = user.email?.toLowerCase().trim();
    if (!userEmail) {
      functions.logger.info(
        `[autoAcceptShareInvites] User ${user.uid} has no email, skipping invite check`,
      );
      return;
    }

    const db = admin.firestore();

    // Find pending invites for this email - check both field names
    // Old invites use 'inviteeEmail', new invites use 'caregiverEmail'
    const [invitesSnapshot1, invitesSnapshot2] = await Promise.all([
      db.collection('shareInvites')
        .where('inviteeEmail', '==', userEmail)
        .where('status', '==', 'pending')
        .get(),
      db.collection('shareInvites')
        .where('caregiverEmail', '==', userEmail)
        .where('status', '==', 'pending')
        .get(),
    ]);

    // Combine and deduplicate by document ID
    const inviteDocsMap = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    invitesSnapshot1.docs.forEach(doc => inviteDocsMap.set(doc.id, doc));
    invitesSnapshot2.docs.forEach(doc => inviteDocsMap.set(doc.id, doc));
    const inviteDocs = Array.from(inviteDocsMap.values());

    if (inviteDocs.length === 0) {
      functions.logger.info(
        `[autoAcceptShareInvites] No pending invites found for ${userEmail}`,
      );
      return;
    }

    functions.logger.info(
      `[autoAcceptShareInvites] Found ${inviteDocs.length} pending invite(s) for ${userEmail}`,
    );

    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    let processedCount = 0;

    for (const inviteDoc of inviteDocs) {
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
        functions.logger.info(
          `[autoAcceptShareInvites] Invite ${inviteDoc.id} expired, marking as expired`,
        );
        continue;
      }

      // Create the share document
      const shareId = `${invite.ownerId}_${user.uid}`;
      const shareRef = db.collection('shares').doc(shareId);

      // Get the caregiver email from whichever field it's stored in
      const caregiverEmail = invite.caregiverEmail || invite.inviteeEmail || userEmail;

      batch.set(shareRef, {
        ownerId: invite.ownerId,
        ownerName: invite.ownerName || null,
        ownerEmail: invite.ownerEmail || null,
        caregiverUserId: user.uid,
        caregiverEmail,
        role: invite.role || 'viewer',
        status: 'accepted',
        message: invite.message || null,
        createdAt: now,
        updatedAt: now,
        acceptedAt: now,
      });

      // Mark invite as accepted and set caregiverUserId
      batch.update(inviteDoc.ref, {
        status: 'accepted',
        caregiverUserId: user.uid,
        acceptedAt: now,
        updatedAt: now,
      });

      // Ensure user has caregiver role
      const userRef = db.collection('users').doc(user.uid);
      batch.set(userRef, {
        roles: admin.firestore.FieldValue.arrayUnion('caregiver'),
        updatedAt: now,
      }, { merge: true });

      functions.logger.info(
        `[autoAcceptShareInvites] Auto-accepted invite ${inviteDoc.id} for user ${user.uid} from owner ${invite.ownerId}`,
      );
      processedCount++;
    }

    await batch.commit();

    functions.logger.info(
      `[autoAcceptShareInvites] Successfully processed ${processedCount} invite(s) for user ${user.uid} (${userEmail})`,
    );
  } catch (error) {
    functions.logger.error(
      `[autoAcceptShareInvites] Error processing invites for user ${user.uid}:`,
      error,
    );
    // Don't throw - we don't want to block user creation if invite processing fails
  }
});

