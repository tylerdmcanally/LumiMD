import { HealthLogType } from '../types/lumibot';

export type HealthLogDedupAction = 'update_existing' | 'return_existing';

interface ResolveHealthLogDedupActionInput {
    incomingType: HealthLogType;
    incomingValue: unknown;
    existingValue: unknown;
}

function readStepCount(value: unknown): number {
    if (!value || typeof value !== 'object') {
        return 0;
    }

    const count = (value as { count?: unknown }).count;
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) {
        return count;
    }

    return 0;
}

export function resolveHealthLogDedupAction({
    incomingType,
    incomingValue,
    existingValue,
}: ResolveHealthLogDedupActionInput): HealthLogDedupAction {
    if (incomingType !== 'steps') {
        return 'return_existing';
    }

    const newCount = readStepCount(incomingValue);
    const oldCount = readStepCount(existingValue);

    return newCount > oldCount ? 'update_existing' : 'return_existing';
}
