'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { Textarea } from '@/components/ui/textarea';
import {
  useAcknowledgePostCommitEscalation,
  useOperatorPostCommitEscalations,
  useReopenPostCommitEscalation,
  useResolvePostCommitEscalation,
  type OperatorPostCommitEscalation,
} from '@/lib/api/hooks';
import { useOperatorAccess } from '@/lib/hooks/useOperatorAccess';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

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

const formatOperations = (operations: string[]): string =>
  operations.length > 0 ? operations.join(', ') : 'None';

function EscalationStateBadge({ escalation }: { escalation: OperatorPostCommitEscalation }) {
  const isResolved = Boolean(escalation.postCommitEscalationResolvedAt);
  const isAcknowledged = Boolean(escalation.postCommitEscalationAcknowledgedAt);

  if (isResolved) {
    return (
      <span className="inline-flex items-center rounded-full bg-success-light px-3 py-1 text-xs font-semibold text-success-dark">
        Resolved
      </span>
    );
  }
  if (isAcknowledged) {
    return (
      <span className="inline-flex items-center rounded-full bg-brand-primary-pale px-3 py-1 text-xs font-semibold text-brand-primary">
        Acknowledged
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-error-light px-3 py-1 text-xs font-semibold text-error">
      Unacknowledged
    </span>
  );
}

export default function OperatorEscalationsPage() {
  const searchParams = useSearchParams();
  const { isOperator, isLoading: operatorAccessLoading } = useOperatorAccess();
  const [cursorStack, setCursorStack] = React.useState<Array<string | null>>([null]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});

  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const escalationQuery = useOperatorPostCommitEscalations({
    limit: PAGE_SIZE,
    cursor,
    enabled: !operatorAccessLoading,
    refetchIntervalMs: 30_000,
  });

  const acknowledgeMutation = useAcknowledgePostCommitEscalation();
  const resolveMutation = useResolvePostCommitEscalation();
  const reopenMutation = useReopenPostCommitEscalation();

  const escalations = escalationQuery.data?.escalations ?? [];
  const visitIdFilter = (searchParams.get('visitId') ?? '').trim();
  const filteredEscalations = React.useMemo(() => {
    if (!visitIdFilter) {
      return escalations;
    }
    return escalations.filter((escalation) => escalation.id === visitIdFilter);
  }, [escalations, visitIdFilter]);
  const hasMore = escalationQuery.data?.hasMore ?? false;
  const nextCursor = escalationQuery.data?.nextCursor ?? null;
  const hasPrev = cursorStack.length > 1;

  const summary = React.useMemo(() => {
    return filteredEscalations.reduce(
      (acc, escalation) => {
        const isResolved = Boolean(escalation.postCommitEscalationResolvedAt);
        const isAcknowledged = Boolean(escalation.postCommitEscalationAcknowledgedAt);
        if (isResolved) {
          acc.resolved += 1;
          return acc;
        }
        if (isAcknowledged) {
          acc.acknowledged += 1;
          return acc;
        }
        acc.unacknowledged += 1;
        return acc;
      },
      {
        total: filteredEscalations.length,
        unacknowledged: 0,
        acknowledged: 0,
        resolved: 0,
      },
    );
  }, [filteredEscalations]);

  const isMutating =
    acknowledgeMutation.isPending || resolveMutation.isPending || reopenMutation.isPending;

  const updateNote = (visitId: string, value: string) => {
    setNotes((prev) => ({ ...prev, [visitId]: value }));
  };

  const currentNote = (visitId: string, fallback: string | null) => {
    const draft = notes[visitId];
    if (typeof draft === 'string') {
      return draft;
    }
    return fallback ?? '';
  };

  const handleAcknowledge = async (visitId: string) => {
    const note = notes[visitId]?.trim();
    try {
      await acknowledgeMutation.mutateAsync({
        visitId,
        note: note && note.length > 0 ? note : undefined,
      });
    } catch {
      // Errors are surfaced via mutation onError toast handlers.
    }
  };

  const handleResolve = async (visitId: string) => {
    const note = notes[visitId]?.trim();
    try {
      await resolveMutation.mutateAsync({
        visitId,
        note: note && note.length > 0 ? note : undefined,
      });
    } catch {
      // Errors are surfaced via mutation onError toast handlers.
    }
  };

  const handleReopen = async (visitId: string) => {
    try {
      await reopenMutation.mutateAsync({ visitId });
    } catch {
      // Errors are surfaced via mutation onError toast handlers.
    }
  };

  return (
    <PageContainer maxWidth="2xl" className="space-y-8">
      <PageHeader
        title="Post-Commit Escalations"
        subtitle="Operator workflow for escalated visit post-commit failures."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/restore-audit">Restore Audit</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/medication-reminders">Reminder Backfill</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCcw className="h-4 w-4" />}
              onClick={() => {
                void escalationQuery.refetch();
              }}
              loading={escalationQuery.isFetching}
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
                Visibility is granted through auth claims or the operator allowlist.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {visitIdFilter && (
        <Card variant="outline" padding="sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              Filtering escalations to visit <span className="font-semibold text-text-primary">{visitIdFilter}</span>
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/escalations">Clear Filter</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Loaded</p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{summary.total}</p>
          </CardContent>
        </Card>
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Unacknowledged</p>
            <p className="mt-2 text-2xl font-bold text-error">{summary.unacknowledged}</p>
          </CardContent>
        </Card>
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Acknowledged</p>
            <p className="mt-2 text-2xl font-bold text-brand-primary">{summary.acknowledged}</p>
          </CardContent>
        </Card>
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Resolved</p>
            <p className="mt-2 text-2xl font-bold text-success-dark">{summary.resolved}</p>
          </CardContent>
        </Card>
      </div>

      {escalationQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
            <span className="text-sm text-text-secondary">Loading escalations...</span>
          </CardContent>
        </Card>
      )}

      {escalationQuery.isError && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-error" />
            <span className="text-sm text-error">
              {escalationQuery.error instanceof Error
                ? escalationQuery.error.message
                : 'Failed to load escalations'}
            </span>
          </CardContent>
        </Card>
      )}

      {!escalationQuery.isLoading && !escalationQuery.isError && filteredEscalations.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success-dark" />
            <span className="text-sm text-text-secondary">
              {visitIdFilter
                ? 'No escalations found for this visit on the current page.'
                : 'No escalations found for the current page.'}
            </span>
          </CardContent>
        </Card>
      )}

      {filteredEscalations.length > 0 && (
        <div className="space-y-4">
          {filteredEscalations.map((escalation) => {
            const isResolved = Boolean(escalation.postCommitEscalationResolvedAt);
            const isAcknowledged = Boolean(escalation.postCommitEscalationAcknowledgedAt);
            const noteValue = currentNote(
              escalation.id,
              escalation.postCommitEscalationResolutionNote ??
                escalation.postCommitEscalationNote ??
                null,
            );

            return (
              <Card key={escalation.id} padding="sm">
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle as="h2" className="text-lg">
                      Visit {escalation.id}
                    </CardTitle>
                    <EscalationStateBadge escalation={escalation} />
                  </div>
                  <CardDescription>
                    Escalated at {formatTimestamp(escalation.postCommitEscalatedAt)} | Last attempt{' '}
                    {formatTimestamp(escalation.postCommitLastAttemptAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="font-semibold text-text-primary">Patient/User</p>
                      <p className="text-text-secondary">{escalation.userId ?? 'N/A'}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Failed Operations</p>
                      <p className="text-text-secondary">
                        {formatOperations(escalation.postCommitFailedOperations)}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Completed Operations</p>
                      <p className="text-text-secondary">
                        {formatOperations(escalation.postCommitCompletedOperations)}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Acknowledged</p>
                      <p className="text-text-secondary">
                        {isAcknowledged
                          ? `${formatTimestamp(escalation.postCommitEscalationAcknowledgedAt)} by ${
                            escalation.postCommitEscalationAcknowledgedBy ?? 'unknown'
                          }`
                          : 'No'}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Resolved</p>
                      <p className="text-text-secondary">
                        {isResolved
                          ? `${formatTimestamp(escalation.postCommitEscalationResolvedAt)} by ${
                            escalation.postCommitEscalationResolvedBy ?? 'unknown'
                          }`
                          : 'No'}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Retry Eligible</p>
                      <p className="text-text-secondary">
                        {escalation.postCommitRetryEligible ? 'Yes' : 'No'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor={`escalation-note-${escalation.id}`}
                      className="text-xs font-semibold uppercase tracking-wide text-text-tertiary"
                    >
                      Operator note
                    </label>
                    <Textarea
                      id={`escalation-note-${escalation.id}`}
                      value={noteValue}
                      onChange={(event) => updateNote(escalation.id, event.target.value)}
                      placeholder="Add triage context, ownership, or resolution details..."
                      className="min-h-[88px]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isResolved || isAcknowledged || isMutating}
                      onClick={() => {
                        void handleAcknowledge(escalation.id);
                      }}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      variant="success"
                      size="sm"
                      disabled={isResolved || isMutating}
                      onClick={() => {
                        void handleResolve(escalation.id);
                      }}
                    >
                      Resolve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!isResolved || isMutating}
                      leftIcon={<Clock3 className="h-4 w-4" />}
                      onClick={() => {
                        void handleReopen(escalation.id);
                      }}
                    >
                      Reopen
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-tertiary">
          Page {cursorStack.length}
          {hasMore ? ' (more available)' : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev || escalationQuery.isFetching}
            onClick={() => {
              setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || !nextCursor || escalationQuery.isFetching}
            className={cn(!nextCursor && 'opacity-50')}
            onClick={() => {
              if (!nextCursor) return;
              setCursorStack((prev) => [...prev, nextCursor]);
            }}
          >
            Next
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
