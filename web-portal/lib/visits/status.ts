import type { Visit } from '@/lib/api/hooks';

export type NormalizedVisitStatus =
  | 'pending'
  | 'processing'
  | 'transcribing'
  | 'summarizing'
  | 'finalizing'
  | 'completed'
  | 'failed';

export function isVisitSummaryReady(visit: Visit | null | undefined) {
  if (!visit) return false;
  if (!visit.summary) return false;
  if (typeof visit.summary !== 'string') return false;
  return visit.summary.trim().length > 0;
}

export function normalizeVisitStatus(visit: Visit): NormalizedVisitStatus {
  const processingStatus =
    (visit.processingStatus as NormalizedVisitStatus | undefined) ??
    (visit.status as NormalizedVisitStatus | undefined);

  if (!processingStatus) return 'pending';

  if (processingStatus === 'completed' && !isVisitSummaryReady(visit)) {
    return 'finalizing';
  }

  if (
    [
      'pending',
      'processing',
      'transcribing',
      'summarizing',
      'finalizing',
      'completed',
      'failed',
    ].includes(processingStatus)
  ) {
    return processingStatus;
  }

  return 'pending';
}

export type VisitStatusMetaVariant = "soft" | "solid" | "outline"
export type VisitStatusMetaTone = "brand" | "neutral" | "success" | "warning" | "danger"

export const VISIT_STATUS_META: Record<
  NormalizedVisitStatus,
  { label: string; tone: VisitStatusMetaTone; variant?: VisitStatusMetaVariant }
> = {
  completed: {
    label: 'Ready',
    tone: 'success',
    variant: 'soft',
  },
  finalizing: {
    label: 'Finalizing',
    tone: 'warning',
    variant: 'soft',
  },
  processing: {
    label: 'Processing',
    tone: 'warning',
    variant: 'soft',
  },
  transcribing: {
    label: 'Transcribing',
    tone: 'warning',
    variant: 'soft',
  },
  summarizing: {
    label: 'Summarizing',
    tone: 'warning',
    variant: 'soft',
  },
  pending: {
    label: 'Pending',
    tone: 'neutral',
    variant: 'soft',
  },
  failed: {
    label: 'Needs attention',
    tone: 'danger',
    variant: 'soft',
  },
};

