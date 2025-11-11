import { Badge } from '@/components/ui/badge';
import {
  NormalizedVisitStatus,
  VISIT_STATUS_META,
} from '@/lib/visits/status';

export function VisitStatusBadge({ status }: { status: NormalizedVisitStatus }) {
  const meta = VISIT_STATUS_META[status] ?? VISIT_STATUS_META.pending;

  return (
    <Badge tone={meta.tone} variant={meta.variant} size="sm">
      {meta.label}
    </Badge>
  );
}

