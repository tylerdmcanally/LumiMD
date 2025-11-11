'use client';

import { format } from 'date-fns';
import { CalendarDays, ExternalLink, MapPin } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Medication, Visit } from '@/lib/api/hooks';
import { normalizeVisitStatus, VISIT_STATUS_META } from '@/lib/visits/status';

type MedicationDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication: Medication | null;
  relatedVisits: Visit[];
  onVisitSelect: (visitId: string) => void;
};

export function MedicationDetailDialog({
  open,
  onOpenChange,
  medication,
  relatedVisits,
  onVisitSelect,
}: MedicationDetailDialogProps) {
  if (!medication) {
    return null;
  }

  const status = deriveStatus(medication);
  const source =
    typeof medication.source === 'string'
      ? medication.source
      : medication.visitId
        ? 'visit'
        : 'manual';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-3 text-2xl font-semibold text-foreground">
            {medication.name}
            <StatusBadge status={status} />
          </DialogTitle>
          <DialogDescription>
            Detailed history and visit mentions for this medication.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-2 rounded-3xl border border-border bg-card/60 p-5">
            <DetailRow label="Dose" value={medication.dose as string} />
            <DetailRow
              label="Frequency"
              value={medication.frequency as string}
            />
            <DetailRow
              label="Started"
              value={formatDate(medication.startedAt)}
            />
            <DetailRow
              label="Stopped"
              value={formatDate(medication.stoppedAt)}
            />
            <DetailRow label="Source" value={source} />
            <DetailRow
              label="Last updated"
              value={formatDateTime(medication.updatedAt)}
            />
          </section>

          <section className="space-y-3 rounded-3xl border border-border bg-card/60 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </h3>
            <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              {medication.notes && String(medication.notes).trim().length
                ? String(medication.notes)
                : 'No notes added yet.'}
            </p>
          </section>
        </div>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Visit mentions
            </h3>
            <p className="text-sm text-muted-foreground">
              LumiMD found this medication in the following visits.
            </p>
          </div>
          {relatedVisits.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {relatedVisits.map((visit) => {
                const visitStatus = normalizeVisitStatus(visit);
                const meta = VISIT_STATUS_META[visitStatus];
                const visitDate = formatDateTime(
                  visit.visitDate ?? visit.createdAt ?? visit.processedAt,
                );

                return (
                  <article
                    key={visit.id}
                    className="flex flex-col gap-3 rounded-3xl border border-border bg-card/70 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-foreground">
                          {visit.provider || 'Untitled visit'}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {visit.specialty || 'General'}
                        </p>
                      </div>
                      <Badge tone={meta.tone} variant={meta.variant} size="sm">
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {visitDate ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" />
                          {visitDate}
                        </span>
                      ) : null}
                      {visit.location ? (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {visit.location}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => onVisitSelect(visit.id)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open visit
                    </Button>
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              No visit mentions recorded yet.
            </p>
          )}
        </section>
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value || '—'}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: 'active' | 'stopped' }) {
  return (
    <Badge
      tone={status === 'active' ? 'success' : 'neutral'}
      variant={status === 'active' ? 'soft' : 'outline'}
      size="sm"
      className="uppercase tracking-wide"
    >
      {status === 'active' ? 'Active' : 'Stopped'}
    </Badge>
  );
}

function deriveStatus(medication: Medication): 'active' | 'stopped' {
  if (typeof medication.status === 'string') {
    return medication.status.toLowerCase() === 'stopped' ? 'stopped' : 'active';
  }
  if (typeof medication.active === 'boolean') {
    return medication.active ? 'active' : 'stopped';
  }
  if (medication.stoppedAt) {
    return 'stopped';
  }
  return 'active';
}

function formatDate(dateLike: unknown) {
  if (!dateLike || typeof dateLike !== 'string') return '—';
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return '—';
  return format(parsed, 'MMM d, yyyy');
}

function formatDateTime(dateLike: unknown) {
  if (!dateLike || typeof dateLike !== 'string') return '—';
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return '—';
  return format(parsed, 'MMM d, yyyy · h:mm a');
}

