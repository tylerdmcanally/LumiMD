'use client';

import { format } from 'date-fns';
import { PencilLine, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Medication } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

type MedicationTableProps = {
  medications: Medication[];
  isLoading?: boolean;
  onEdit: (medication: Medication) => void;
  onDelete: (medication: Medication) => void;
  onInspect?: (medication: Medication) => void;
};

export function MedicationTable({
  medications,
  isLoading,
  onEdit,
  onDelete,
  onInspect,
}: MedicationTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-[32px] border border-border/70 bg-card/95 p-6 shadow-soft">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full animate-soft-pulse rounded-2xl" />
          <Skeleton className="h-12 w-full animate-soft-pulse rounded-2xl" />
          <Skeleton className="h-12 w-2/3 animate-soft-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!medications.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-[32px] border border-dashed border-border/70 bg-card/95 px-12 py-16 text-center shadow-soft">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-2xl text-primary">
          💊
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">No medications yet</p>
          <p className="text-sm text-muted-foreground">
            Manual entries and summarized medications from visit notes will appear here. Use the button above to add a new medication.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[32px] border border-border/70 bg-card/95 shadow-soft transition-glide hover:shadow-floating">
      <Table>
        <TableHeader className="bg-surface/60">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Dose</TableHead>
            <TableHead>Frequency</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-[140px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {medications.map((medication) => {
            const status = deriveStatus(medication);
            const started = formatDate(medication.startedAt);
            const updated = formatDate(medication.updatedAt);
            const sourceLabel =
              typeof medication.source === 'string'
                ? medication.source
                : medication.visitId
                  ? 'visit'
                  : 'manual';

            return (
              <TableRow
                key={medication.id}
                className="transition-glide hover:bg-primary/5"
              >
                <TableCell>
                  <div className="flex flex-col">
                    {onInspect ? (
                      <button
                        type="button"
                        onClick={() => onInspect(medication)}
                        className="text-left text-base font-semibold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        {medication.name}
                      </button>
                    ) : (
                      <span className="font-semibold text-foreground">
                        {medication.name}
                      </span>
                    )}
                    {medication.notes ? (
                      <span className="text-xs text-muted-foreground">
                        {medication.notes}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {medication.dose || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {medication.frequency || '—'}
                </TableCell>
                <TableCell>
                  <StatusBadge status={status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {started || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {updated || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    tone={sourceLabel === 'manual' ? 'brand' : 'neutral'}
                    variant={sourceLabel === 'manual' ? 'soft' : 'outline'}
                    size="sm"
                    className="capitalize"
                  >
                    {sourceLabel}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => onEdit(medication)}
                    >
                      <PencilLine className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(medication)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function deriveStatus(medication: Medication) {
  if (typeof medication.status === 'string') {
    return medication.status.toLowerCase();
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
  if (!dateLike || typeof dateLike !== 'string') return '';
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'MMM d, yyyy');
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status === 'stopped' ? 'stopped' : 'active';
  const label = normalized === 'active' ? 'Active' : 'Stopped';

  return (
    <Badge
      tone={normalized === 'active' ? 'success' : 'neutral'}
      variant={normalized === 'active' ? 'soft' : 'outline'}
      size="sm"
      className="uppercase tracking-wide font-semibold"
    >
      {label}
    </Badge>
  );
}

