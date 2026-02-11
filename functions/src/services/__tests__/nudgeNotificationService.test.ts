import { sortNudgesByPriority } from '../nudgeNotificationService';

describe('sortNudgesByPriority', () => {
  it('prioritizes followup over medication and condition nudges', () => {
    const sorted = sortNudgesByPriority([
      {
        id: 'cond',
        userId: 'u1',
        title: 'Condition check',
        message: 'How are you feeling?',
        type: 'condition_tracking',
      },
      {
        id: 'med',
        userId: 'u1',
        title: 'Medication check',
        message: 'Did you take your dose?',
        type: 'medication_checkin',
      },
      {
        id: 'follow',
        userId: 'u1',
        title: 'Follow-up',
        message: 'Quick follow-up',
        type: 'followup',
      },
    ]);

    expect(sorted.map((nudge) => nudge.id)).toEqual(['follow', 'med', 'cond']);
  });

  it('treats legacy follow_up key with the same highest priority', () => {
    const sorted = sortNudgesByPriority([
      {
        id: 'med',
        userId: 'u1',
        title: 'Medication check',
        message: 'Did you take your dose?',
        type: 'medication_checkin',
      },
      {
        id: 'legacy-follow',
        userId: 'u1',
        title: 'Legacy follow-up',
        message: 'Legacy format follow-up',
        type: 'follow_up',
      },
      {
        id: 'follow',
        userId: 'u1',
        title: 'Follow-up',
        message: 'Current format follow-up',
        type: 'followup',
      },
    ]);

    expect(sorted[0].id).toBe('legacy-follow');
    expect(sorted[1].id).toBe('follow');
    expect(sorted[2].id).toBe('med');
  });
});

