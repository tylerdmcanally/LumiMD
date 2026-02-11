import { resolveHealthLogDedupAction } from '../healthLogDedupService';

describe('resolveHealthLogDedupAction', () => {
    it('returns update_existing when incoming steps count is higher', () => {
        const action = resolveHealthLogDedupAction({
            incomingType: 'steps',
            incomingValue: { count: 1450, date: '2026-02-10' },
            existingValue: { count: 900, date: '2026-02-10' },
        });

        expect(action).toBe('update_existing');
    });

    it('returns return_existing when steps count does not increase', () => {
        const action = resolveHealthLogDedupAction({
            incomingType: 'steps',
            incomingValue: { count: 900, date: '2026-02-10' },
            existingValue: { count: 900, date: '2026-02-10' },
        });

        expect(action).toBe('return_existing');
    });

    it('returns return_existing for non-step duplicate records', () => {
        const action = resolveHealthLogDedupAction({
            incomingType: 'bp',
            incomingValue: { systolic: 130, diastolic: 82 },
            existingValue: { systolic: 130, diastolic: 82 },
        });

        expect(action).toBe('return_existing');
    });

    it('handles malformed values safely by returning return_existing', () => {
        const action = resolveHealthLogDedupAction({
            incomingType: 'steps',
            incomingValue: { count: Number.NaN },
            existingValue: { count: 2000 },
        });

        expect(action).toBe('return_existing');
    });
});
