/**
 * LumiBot AI Service Tests
 */

import { LumiBotAIService } from '../lumibotAI';

describe('LumiBotAIService', () => {
    it('returns neutral interpretation for empty responses', async () => {
        const service = new LumiBotAIService('test-key', 'gpt-4o');

        const result = await service.interpretUserResponse({
            nudgeContext: {
                nudgeType: 'condition_tracking',
                originalMessage: 'How are you feeling?',
            },
            userResponse: ' ',
        });

        expect(result.sentiment).toBe('neutral');
        expect(result.followUpNeeded).toBe(false);
        expect(result.summary).toBe('No response provided.');
    });
});
