import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Visit } from '@/lib/api/hooks';
import { NormalizedVisitStatus } from '@/lib/visits/status';
import { cn } from '@/lib/utils';
import { CalendarDays, MapPin } from 'lucide-react';

type VisitDetailHeaderProps = {
  visit: Visit;
  status: NormalizedVisitStatus;
  summaryReady: boolean;
  onEditMetadata: () => void;
  onManageTags: () => void;
  onDeleteVisit: () => void;
  isDeleting?: boolean;
};

export function VisitDetailHeader({
  visit,
  status,
  summaryReady,
  onEditMetadata,
  onManageTags,
  onDeleteVisit,
  isDeleting,
}: VisitDetailHeaderProps) {
  const visitDate =
    (visit.createdAt && new Date(visit.createdAt)) ||
    (visit.processedAt && new Date(visit.processedAt)) ||
    null;
  const summaryState: 'ready' | 'processing' | 'failed' = summaryReady
    ? 'ready'
    : status === 'failed'
      ? 'failed'
      : 'processing';

  const summaryStyles: Record<
    typeof summaryState,
    { label: string; className: string }
  > = {
    ready: {
      label: 'Summary ready',
      className:
        'border border-success/20 bg-success/10 text-success-dark',
    },
    processing: {
      label: 'Summary processing',
      className:
        'border border-warning/25 bg-warning/10 text-warning-dark',
    },
    failed: {
      label: 'Summary failed',
      className: 'border border-error/25 bg-error/10 text-error-dark',
    },
  };

  return (
    <Card className="border border-border bg-card shadow-card">
      <CardContent className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {visit.provider || 'Untitled visit'}
            </h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                summaryStyles[summaryState].className,
              )}
            >
              {summaryStyles[summaryState].label}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            {visit.specialty ? (
              <span className="rounded-full bg-primary/5 px-3 py-1 text-primary-dark">
                {visit.specialty}
              </span>
            ) : null}
            {visit.location ? (
              <span className="inline-flex items-center gap-2">
                <MapPin className="h-4 w-4 opacity-70" />
                {visit.location}
              </span>
            ) : null}
            {visitDate ? (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="h-4 w-4 opacity-70" />
                {visitDate.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.isArray(visit.tags) &&
              visit.tags.map((tagValue) => (
                <span
                  key={`tag-${tagValue}`}
                  className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary-dark"
                >
                  #{tagValue}
                </span>
              ))}
            {Array.isArray(visit.folders) &&
              visit.folders.map((folder) => (
                <span
                  key={`folder-${folder}`}
                  className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {folder}
                </span>
              ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <Button
            variant="outline"
            onClick={onManageTags}
            className="w-full justify-center sm:w-auto"
          >
            Organize
          </Button>
          <Button
            variant="secondary"
            onClick={onEditMetadata}
            className="w-full justify-center sm:w-auto"
          >
            Edit details
          </Button>
          <Button
            variant="ghost"
            onClick={onDeleteVisit}
            disabled={isDeleting}
            className={cn(
              'w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto',
              isDeleting && 'opacity-60',
            )}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

