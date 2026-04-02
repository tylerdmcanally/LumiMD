/**
 * Firestore Care Flow Repository
 *
 * Data access layer for careFlows collection.
 * Indexes needed:
 *   - careFlows composite: status + nextTouchpointAt ASC
 *   - careFlows composite: userId + condition + status
 */

import * as admin from 'firebase-admin';
import { CareFlow, CareFlowCondition, CareFlowStatus } from '../../../types/careFlows';

const COLLECTION = 'careFlows';

function mapDoc(
    doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>,
): CareFlow | null {
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() } as CareFlow;
}

export class FirestoreCareFlowRepository {
    constructor(private readonly db: FirebaseFirestore.Firestore) {}

    /**
     * Create a new care flow document.
     */
    async create(data: Omit<CareFlow, 'id'>): Promise<string> {
        const ref = this.db.collection(COLLECTION).doc();
        await ref.set(data);
        return ref.id;
    }

    /**
     * Get a care flow by ID.
     */
    async getById(id: string): Promise<CareFlow | null> {
        const doc = await this.db.collection(COLLECTION).doc(id).get();
        return mapDoc(doc);
    }

    /**
     * Update a care flow document (partial update).
     */
    async update(id: string, data: Partial<CareFlow>): Promise<void> {
        await this.db.collection(COLLECTION).doc(id).update({
            ...data,
            updatedAt: admin.firestore.Timestamp.now(),
        });
    }

    /**
     * Query active flows that are due for processing.
     * Uses composite index: status + nextTouchpointAt ASC.
     */
    async listDueActiveFlows(
        beforeTimestamp: FirebaseFirestore.Timestamp,
        limit = 100,
    ): Promise<CareFlow[]> {
        const snapshot = await this.db
            .collection(COLLECTION)
            .where('status', '==', 'active')
            .where('nextTouchpointAt', '<=', beforeTimestamp)
            .orderBy('nextTouchpointAt', 'asc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as CareFlow);
    }

    /**
     * Find an active care flow for a user + condition.
     * Used for dedup: only one active flow per user × condition.
     */
    async findActiveByUserAndCondition(
        userId: string,
        condition: CareFlowCondition,
    ): Promise<CareFlow | null> {
        const snapshot = await this.db
            .collection(COLLECTION)
            .where('userId', '==', userId)
            .where('condition', '==', condition)
            .where('status', '==', 'active')
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as CareFlow;
    }

    /**
     * Find a care flow by nudgeId (look through touchpoints).
     * Since touchpoints is an array on the document, we load the flow by careFlowId
     * stored on the nudge, not by querying touchpoints.
     */
    async findByNudgeId(_nudgeId: string): Promise<CareFlow | null> {
        // This is called from the response handler which already has careFlowId.
        // Keeping this method as a fallback; primary path uses getById.
        return null;
    }

    /**
     * List all care flows for a user.
     */
    async listByUser(
        userId: string,
        statuses?: CareFlowStatus[],
    ): Promise<CareFlow[]> {
        let query: FirebaseFirestore.Query = this.db
            .collection(COLLECTION)
            .where('userId', '==', userId);

        if (statuses && statuses.length > 0) {
            query = query.where('status', 'in', statuses);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').limit(50).get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as CareFlow);
    }
}
