'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useOperatorReminderTimingBackfillStatus } from '@/lib/api/hooks';
import { useOperatorAccess } from '@/lib/hooks/useOperatorAccess';

const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) {
    return 'N/A';
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
};

const formatRunStatus = (value: 'idle' | 'running' | 'success' | 'error'): string => {
  switch (value) {
    case 'running':
      return 'Running';
    case 'success':
      return 'Success';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
};

const runStatusTone = (value: 'idle' | 'running' | 'success' | 'error'): string => {
  switch (value) {
    case 'running':
      return 'text-brand-primary';
    case 'success':
      return 'text-success-dark';
    case 'error':
      return 'text-error';
    default:
      return 'text-text-secondary';
  }
};

export default function OperatorReminderBackfillPage() {
  const { isOperator, isLoading: operatorAccessLoading } = useOperatorAccess();

  const statusQuery = useOperatorReminderTimingBackfillStatus({
    enabled: !operatorAccessLoading && isOperator,
    refetchIntervalMs: 30_000,
  });

  const status = statusQuery.data;

  return (
    <PageContainer maxWidth="2xl" className="space-y-8">
      <PageHeader
        title="Reminder Timing Backfill"
        subtitle="Operator visibility into legacy reminder timing-policy migration health."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/escalations">Escalations</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/restore-audit">Restore Audit</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCcw className="h-4 w-4" />}
              onClick={() => {
                void statusQuery.refetch();
              }}
              loading={statusQuery.isFetching}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {!isOperator && (
        <Card variant="outline" padding="sm">
          <CardContent className="flex items-start gap-3">
            <ShieldAlert className="mt-1 h-5 w-5 text-brand-primary" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-primary">
                Access requires operator privileges
              </p>
              <p className="text-sm text-text-secondary">
                Reminder backfill operational telemetry is restricted to operator/admin/support roles.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {statusQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
            <span className="text-sm text-text-secondary">Loading reminder backfill status...</span>
          </CardContent>
        </Card>
      )}

      {statusQuery.isError && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-error" />
            <span className="text-sm text-error">
              {statusQuery.error instanceof Error
                ? statusQuery.error.message
                : 'Failed to load reminder backfill status'}
            </span>
          </CardContent>
        </Card>
      )}

      {status && !statusQuery.isError && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card padding="sm">
              <CardContent>
                <p className="text-xs uppercase tracking-wide text-text-tertiary">Run Status</p>
                <p className={`mt-2 text-2xl font-bold ${runStatusTone(status.lastRunStatus)}`}>
                  {formatRunStatus(status.lastRunStatus)}
                </p>
              </CardContent>
            </Card>

            <Card padding="sm">
              <CardContent>
                <p className="text-xs uppercase tracking-wide text-text-tertiary">Needs Attention</p>
                <p
                  className={`mt-2 text-2xl font-bold ${
                    status.needsAttention ? 'text-error' : 'text-success-dark'
                  }`}
                >
                  {status.needsAttention ? 'Yes' : 'No'}
                </p>
              </CardContent>
            </Card>

            <Card padding="sm">
              <CardContent>
                <p className="text-xs uppercase tracking-wide text-text-tertiary">Has More</p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  {status.hasMore ? 'Yes' : 'No'}
                </p>
              </CardContent>
            </Card>

            <Card padding="sm">
              <CardContent>
                <p className="text-xs uppercase tracking-wide text-text-tertiary">Last Updated Docs</p>
                <p className="mt-2 text-2xl font-bold text-text-primary">
                  {status.lastUpdatedCount ?? 0}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle as="h2" className="flex items-center gap-2 text-base">
                <Clock3 className="h-4 w-4" />
                Backfill State Details
              </CardTitle>
              <CardDescription>
                Persisted scheduler state for the medication reminder timing backfill job.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <p className="font-semibold text-text-primary">Cursor Document ID</p>
                  <p className="break-all text-text-secondary">{status.cursorDocId ?? 'None'}</p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Last Run Started</p>
                  <p className="text-text-secondary">{formatTimestamp(status.lastRunStartedAt)}</p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Last Run Finished</p>
                  <p className="text-text-secondary">{formatTimestamp(status.lastRunFinishedAt)}</p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Last Processed At</p>
                  <p className="text-text-secondary">{formatTimestamp(status.lastProcessedAt)}</p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Last Processed Count</p>
                  <p className="text-text-secondary">{status.lastProcessedCount ?? 0}</p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Completed At</p>
                  <p className="text-text-secondary">{formatTimestamp(status.completedAt)}</p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Stale</p>
                  <p className={status.stale ? 'text-error' : 'text-text-secondary'}>
                    {status.stale ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-text-primary">Last Error At</p>
                  <p className="text-text-secondary">{formatTimestamp(status.lastRunErrorAt)}</p>
                </div>
              </div>

              {status.lastRunErrorMessage && (
                <div className="rounded-lg border border-error/20 bg-error-light px-3 py-2 text-sm text-error">
                  <p className="font-semibold">Last Error</p>
                  <p className="mt-1 whitespace-pre-wrap break-words">{status.lastRunErrorMessage}</p>
                </div>
              )}

              {!status.needsAttention && (
                <div className="flex items-center gap-2 rounded-lg border border-success-dark/20 bg-success-light px-3 py-2 text-sm text-success-dark">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Backfill state is healthy.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
