import { getPrimaryInsight } from '../trendAnalyzer';

type TrendRecord = Parameters<typeof getPrimaryInsight>[0][number];

const atUtc = (day: number, hour = 9): Date =>
    new Date(Date.UTC(2026, 1, day, hour, 0, 0));

function makeLog(
    type: TrendRecord['type'],
    value: TrendRecord['value'],
    createdAt: Date
): TrendRecord {
    return { type, value, createdAt };
}

describe('getPrimaryInsight', () => {
    it('detects sudden weight jump as a concern insight', () => {
        const insight = getPrimaryInsight([
            makeLog('weight', { weight: 180, unit: 'lbs' }, atUtc(1)),
            makeLog('weight', { weight: 180.2, unit: 'lbs' }, atUtc(2)),
            makeLog('weight', { weight: 182.0, unit: 'lbs' }, atUtc(3)),
        ]);

        expect(insight?.type).toBe('weight');
        expect(insight?.pattern).toBe('sudden_jump');
        expect(insight?.severity).toBe('concern');
    });

    it('detects post-meal glucose spikes when fasting vs post-meal gap is high', () => {
        const insight = getPrimaryInsight([
            makeLog('glucose', { reading: 110, timing: 'fasting' }, atUtc(1, 7)),
            makeLog('glucose', { reading: 116, timing: 'fasting' }, atUtc(2, 7)),
            makeLog('glucose', { reading: 190, timing: 'after_meal' }, atUtc(1, 13)),
            makeLog('glucose', { reading: 205, timing: 'after_meal' }, atUtc(2, 13)),
        ]);

        expect(insight?.type).toBe('glucose');
        expect(insight?.pattern).toBe('post_meal_spikes');
        expect(insight?.severity).toBe('attention');
    });

    it('prioritizes actionable insights over positive-only signals', () => {
        const insight = getPrimaryInsight([
            makeLog('weight', { weight: 180.0, unit: 'lbs' }, atUtc(1)),
            makeLog('weight', { weight: 180.1, unit: 'lbs' }, atUtc(2)),
            makeLog('weight', { weight: 179.9, unit: 'lbs' }, atUtc(3)),
            makeLog('weight', { weight: 180.0, unit: 'lbs' }, atUtc(4)),
            makeLog('weight', { weight: 180.1, unit: 'lbs' }, atUtc(5)),
            makeLog('glucose', { reading: 112, timing: 'fasting' }, atUtc(1, 7)),
            makeLog('glucose', { reading: 118, timing: 'fasting' }, atUtc(2, 7)),
            makeLog('glucose', { reading: 194, timing: 'after_meal' }, atUtc(1, 13)),
            makeLog('glucose', { reading: 204, timing: 'after_meal' }, atUtc(2, 13)),
        ]);

        expect(insight?.type).toBe('glucose');
        expect(insight?.pattern).toBe('post_meal_spikes');
    });

    it('returns null when there is not enough trend data', () => {
        const insight = getPrimaryInsight([
            makeLog('bp', { systolic: 128, diastolic: 80 }, atUtc(1)),
            makeLog('bp', { systolic: 129, diastolic: 81 }, atUtc(2)),
        ]);

        expect(insight).toBeNull();
    });
});
