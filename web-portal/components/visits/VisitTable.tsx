'use client';

import { format } from 'date-fns';

import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { VisitStatusBadge } from '@/components/visits/VisitStatusBadge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Visit } from '@/lib/api/hooks';
import { isVisitSummaryReady, normalizeVisitStatus } from '@/lib/visits/status';
import { cn } from '@/lib/utils';

type VisitTableProps = {
  visits: Visit[];
  isLoading?: boolean;
  onSelect?: (visit: Visit) => void;
};

export function VisitTable({ visits, isLoading, onSelect }: VisitTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-[32px] border border-border/70 bg-card/95 p-6 shadow-soft">
        <div className="space-y-4">
          <Skeleton className="h-12 w-full animate-soft-pulse rounded-2xl" />
          <Skeleton className="h-12 w-full animate-soft-pulse rounded-2xl" />
          <Skeleton className="h-12 w-3/4 animate-soft-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!visits.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-[32px] border border-dashed border-border/70 bg-card/95 px-10 py-16 text-center shadow-soft">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-2xl text-primary">
          📋
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">No visits yet</p>
          <p className="text-sm text-muted-foreground">
            Record a visit from the LumiMD mobile app or upload one to see it appear here instantly.
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
            <TableHead className="w-[160px]">Date</TableHead>
            <TableHead>Provider</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Specialty</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Folders</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visits.map((visit) => {
            const status = normalizeVisitStatus(visit);
            const visitDate =
              (visit.processedAt && Date.parse(visit.processedAt)) ||
              (visit.createdAt && Date.parse(visit.createdAt));
            const formattedDate = visitDate
              ? format(visitDate, "MMM d, yyyy")
              : "—";
            const tags = Array.isArray(visit.tags) ? visit.tags : [];
            const folders = Array.isArray(visit.folders) ? visit.folders : [];
            const summaryReady = isVisitSummaryReady(visit);

            return (
              <TableRow
                key={visit.id}
                className={cn(
                  "cursor-pointer transition-glide hover:bg-primary/5 focus-visible:bg-primary/10",
                  summaryReady ? "" : "opacity-95",
                )}
                onClick={() => onSelect?.(visit)}
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                onKeyDown={(event) => {
                  if (!onSelect) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(visit);
                  }
                }}
              >
                <TableCell className="font-medium">{formattedDate}</TableCell>
                <TableCell className="text-sm text-foreground">
                  {visit.provider || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {visit.location || "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {visit.specialty || "—"}
                </TableCell>
                <TableCell>
                  <VisitStatusBadge status={status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <TagList items={tags} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <TagList items={folders} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items?.length) {
    return <span className="text-muted-foreground/70">—</span>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} tone="brand" variant="outline" size="sm">
          {item}
        </Badge>
      ))}
    </div>
  );
}

