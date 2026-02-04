/**
 * Condition Protocol Tests
 */

import { matchDiagnosesToProtocols, getProtocolById } from '../conditionProtocols';

describe('Condition Protocols', () => {
    it('matches asthma diagnoses to the asthma protocol', () => {
        const matches = matchDiagnosesToProtocols([
            'Asthma',
            'exercise-induced asthma',
            'reactive airway disease',
        ]);

        const hasAsthma = matches.some((protocol) => protocol.id === 'asthma');
        expect(hasAsthma).toBe(true);
    });

    it('asthma protocol defines tracking and schedule', () => {
        const protocol = getProtocolById('asthma');
        expect(protocol).toBeDefined();
        expect(protocol?.tracking.length).toBeGreaterThan(0);
        expect(protocol?.nudgeSchedule.length).toBeGreaterThan(0);
    });
});
