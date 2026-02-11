import type { Nudge } from '@lumimd/sdk';

function resolveNudgeDueTime(nudge: Nudge): number {
  if (nudge.status === 'snoozed' && nudge.snoozedUntil) {
    return Date.parse(nudge.snoozedUntil);
  }
  return nudge.scheduledFor ? Date.parse(nudge.scheduledFor) : 0;
}

export function filterDueNudges(
  nudges: Nudge[],
  nowMs: number = Date.now(),
): Nudge[] {
  return nudges
    .filter((nudge) => {
      if (nudge.status === 'pending' || nudge.status === 'active') {
        const scheduledTime = nudge.scheduledFor ? Date.parse(nudge.scheduledFor) : 0;
        return scheduledTime <= nowMs;
      }

      if (nudge.status === 'snoozed') {
        const snoozedUntil = nudge.snoozedUntil ? Date.parse(nudge.snoozedUntil) : NaN;
        return Number.isFinite(snoozedUntil) && snoozedUntil <= nowMs;
      }

      return false;
    })
    .sort((a, b) => resolveNudgeDueTime(a) - resolveNudgeDueTime(b))
    .slice(0, 10);
}

