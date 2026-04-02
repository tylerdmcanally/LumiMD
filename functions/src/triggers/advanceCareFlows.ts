/**
 * Advance Care Flows — Scheduled Cloud Function
 *
 * Runs every 15 minutes. Queries active care flows with
 * nextTouchpointAt <= now and advances them through the flow engine.
 *
 * Replaces multiple condition-specific schedulers with a single
 * unified function.
 *
 * Firestore index required:
 *   careFlows composite: status == 'active' + nextTouchpointAt ASC
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as functions from 'firebase-functions';
import { advanceCareFlows } from '../services/careFlowEngine';

export const processAdvanceCareFlows = onSchedule(
    {
        region: 'us-central1',
        schedule: 'every 15 minutes',
        timeZone: 'Etc/UTC',
        memory: '512MiB',
        timeoutSeconds: 120,
        maxInstances: 1,
    },
    async () => {
        functions.logger.info('[AdvanceCareFlows] Starting care flow advancement');

        const result = await advanceCareFlows();

        functions.logger.info('[AdvanceCareFlows] Complete', result);
    },
);
