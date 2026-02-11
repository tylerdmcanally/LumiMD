import type { Nudge } from '@lumimd/sdk';
import { filterDueNudges } from '../lib/api/nudgeFilters';

const NOW = Date.parse('2026-02-10T18:00:00.000Z');

function makeNudge(id: string, overrides: Partial<Nudge>): Nudge {
  return {
    id,
    userId: 'user-1',
    visitId: 'visit-1',
    type: 'condition_tracking',
    title: `Nudge ${id}`,
    message: 'message',
    actionType: 'symptom_check',
    scheduledFor: '2026-02-10T17:00:00.000Z',
    sequenceDay: 1,
    status: 'pending',
    createdAt: '2026-02-10T16:00:00.000Z',
    ...overrides,
  };
}

describe('filterDueNudges', () => {
  it('includes due pending/active nudges and excludes future pending nudges', () => {
    const result = filterDueNudges(
      [
        makeNudge('pending-due', {
          status: 'pending',
          scheduledFor: '2026-02-10T17:00:00.000Z',
        }),
        makeNudge('active-due', {
          status: 'active',
          scheduledFor: '2026-02-10T17:30:00.000Z',
        }),
        makeNudge('pending-future', {
          status: 'pending',
          scheduledFor: '2026-02-10T19:00:00.000Z',
        }),
      ],
      NOW,
    );

    expect(result.map((nudge) => nudge.id)).toEqual(['pending-due', 'active-due']);
  });

  it('reactivates snoozed nudges only after snoozedUntil has passed', () => {
    const result = filterDueNudges(
      [
        makeNudge('snoozed-due', {
          status: 'snoozed',
          snoozedUntil: '2026-02-10T17:55:00.000Z',
        }),
        makeNudge('snoozed-future', {
          status: 'snoozed',
          snoozedUntil: '2026-02-10T18:05:00.000Z',
        }),
      ],
      NOW,
    );

    expect(result.map((nudge) => nudge.id)).toEqual(['snoozed-due']);
  });

  it('sorts by due time ascending and limits to 10 items', () => {
    const nudges = Array.from({ length: 12 }, (_, index) =>
      makeNudge(`n-${index}`, {
        status: 'pending',
        scheduledFor: `2026-02-10T17:${String(59 - index).padStart(2, '0')}:00.000Z`,
      }),
    );

    const result = filterDueNudges(nudges, NOW);

    expect(result).toHaveLength(10);
    expect(result[0].id).toBe('n-11');
    expect(result[9].id).toBe('n-2');
  });
});

