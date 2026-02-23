'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileClock,
  Filter,
  Loader2,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useOperatorRestoreAudit,
  useUpdateRestoreAuditTriage,
  type RestoreAuditResourceType,
  type RestoreAuditTriageStatus,
} from '@/lib/api/hooks';
import { useOperatorAccess } from '@/lib/hooks/useOperatorAccess';

const PAGE_SIZE = 25;

const RESOURCE_OPTIONS: Array<{ value: '' | RestoreAuditResourceType; label: string }> = [
  { value: '', label: 'All Resources' },
  { value: 'action', label: 'Actions' },
  { value: 'visit', label: 'Visits' },
  { value: 'medication', label: 'Medications' },
  { value: 'health_log', label: 'Health Logs' },
  { value: 'medication_reminder', label: 'Medication Reminders' },
  { value: 'care_task', label: 'Care Tasks' },
];

const TRIAGE_STATUS_OPTIONS: Array<{ value: '' | RestoreAuditTriageStatus; label: string }> = [
  { value: '', label: 'All Triage States' },
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'in_review', label: 'In Review' },
  { value: 'resolved', label: 'Resolved' },
];

const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) return 'N/A';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
};

const formatResourceType = (value: string | null | undefined): string => {
  if (!value) return 'Unknown';
  return value
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
};

const formatTriageStatus = (value: RestoreAuditTriageStatus | null | undefined): string => {
  if (!value) return 'Unreviewed';
  return value
    .split('_')
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
};

const toCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '""';
  if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return `"${String(value)}"`;
  return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
};

type RestoreFilters = {
  resourceType: '' | RestoreAuditResourceType;
  ownerUserId: string;
  actorUserId: string;
  triageStatus: '' | RestoreAuditTriageStatus;
};

type RestoreTriageDraft = {
  triageStatus: RestoreAuditTriageStatus;
  triageNote: string;
};

export default function OperatorRestoreAuditPage() {
  const { isOperator, isLoading: operatorAccessLoading } = useOperatorAccess();
  const [cursorStack, setCursorStack] = React.useState<Array<string | null>>([null]);
  const [draftFilters, setDraftFilters] = React.useState<RestoreFilters>({
    resourceType: '',
    ownerUserId: '',
    actorUserId: '',
    triageStatus: '',
  });
  const [appliedFilters, setAppliedFilters] = React.useState<RestoreFilters>({
    resourceType: '',
    ownerUserId: '',
    actorUserId: '',
    triageStatus: '',
  });
  const [triageDrafts, setTriageDrafts] = React.useState<Record<string, RestoreTriageDraft>>({});
  const [savingEventId, setSavingEventId] = React.useState<string | null>(null);

  const cursor = cursorStack[cursorStack.length - 1] ?? null;
  const updateTriageMutation = useUpdateRestoreAuditTriage();

  const auditQuery = useOperatorRestoreAudit({
    limit: PAGE_SIZE,
    cursor,
    resourceType: appliedFilters.resourceType || null,
    ownerUserId: appliedFilters.ownerUserId || null,
    actorUserId: appliedFilters.actorUserId || null,
    triageStatus: appliedFilters.triageStatus || null,
    enabled: !operatorAccessLoading && isOperator,
    refetchIntervalMs: 30_000,
  });

  const events = auditQuery.data?.events ?? [];
  const hasMore = auditQuery.data?.hasMore ?? false;
  const nextCursor = auditQuery.data?.nextCursor ?? null;
  const hasPrev = cursorStack.length > 1;

  React.useEffect(() => {
    if (events.length === 0) {
      return;
    }

    setTriageDrafts((previous) => {
      const next = { ...previous };
      events.forEach((event) => {
        if (!next[event.id]) {
          next[event.id] = {
            triageStatus: event.triageStatus ?? 'unreviewed',
            triageNote: event.triageNote ?? '',
          };
        }
      });
      return next;
    });
  }, [events]);

  const summary = React.useMemo(() => {
    return events.reduce(
      (acc, event) => {
        acc.total += 1;
        if (event.actorCategory === 'operator') {
          acc.operator += 1;
        } else if (event.actorCategory === 'owner') {
          acc.owner += 1;
        } else {
          acc.delegate += 1;
        }
        return acc;
      },
      { total: 0, operator: 0, owner: 0, delegate: 0 },
    );
  }, [events]);

  const handleExportCsv = React.useCallback(() => {
    if (events.length === 0) {
      return;
    }

    const header = [
      'eventId',
      'createdAt',
      'resourceType',
      'resourceId',
      'ownerUserId',
      'actorUserId',
      'actorCategory',
      'reason',
      'triageStatus',
      'triageNote',
      'triageUpdatedAt',
      'triageUpdatedBy',
      'metadata',
    ];

    const rows = events.map((event) => [
      event.id,
      event.createdAt,
      event.resourceType,
      event.resourceId,
      event.ownerUserId,
      event.actorUserId,
      event.actorCategory,
      event.reason,
      event.triageStatus,
      event.triageNote,
      event.triageUpdatedAt,
      event.triageUpdatedBy,
      event.metadata,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => toCsvCell(cell)).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `restore-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  }, [events]);

  const applyFilters = () => {
    setAppliedFilters(draftFilters);
    setCursorStack([null]);
  };

  const clearFilters = () => {
    const empty = {
      resourceType: '' as const,
      ownerUserId: '',
      actorUserId: '',
      triageStatus: '' as const,
    };
    setDraftFilters(empty);
    setAppliedFilters(empty);
    setCursorStack([null]);
  };

  const handleSaveTriage = async (eventId: string) => {
    const draft = triageDrafts[eventId];
    if (!draft) {
      return;
    }

    setSavingEventId(eventId);
    try {
      const normalizedNote = draft.triageNote.trim();
      await updateTriageMutation.mutateAsync({
        eventId,
        triageStatus: draft.triageStatus,
        triageNote: normalizedNote.length > 0 ? normalizedNote : undefined,
        clearTriageNote: normalizedNote.length === 0,
      });
    } finally {
      setSavingEventId(null);
    }
  };

  return (
    <PageContainer maxWidth="2xl" className="space-y-8">
      <PageHeader
        title="Restore Audit Trail"
        subtitle="Operator view of soft-delete restoration activity across resource types."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/escalations">View Escalations</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/ops/medication-reminders">Reminder Backfill</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-4 w-4" />}
              onClick={handleExportCsv}
              disabled={events.length === 0}
            >
              Export CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<RefreshCcw className="h-4 w-4" />}
              onClick={() => {
                void auditQuery.refetch();
              }}
              loading={auditQuery.isFetching}
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
                Restore audit visibility is restricted to operator/admin/support roles.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card padding="sm">
        <CardHeader>
          <CardTitle as="h2" className="flex items-center gap-2 text-base">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
          <CardDescription>
            Narrow restore audit events by resource and actor/owner identifiers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Resource
              </span>
              <select
                className="w-full rounded-lg border border-border-light bg-surface px-3 py-2 text-sm"
                value={draftFilters.resourceType}
                onChange={(event) => {
                  setDraftFilters((prev) => ({
                    ...prev,
                    resourceType: event.target.value as '' | RestoreAuditResourceType,
                  }));
                }}
              >
                {RESOURCE_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Owner User ID
              </span>
              <input
                type="text"
                value={draftFilters.ownerUserId}
                onChange={(event) => {
                  setDraftFilters((prev) => ({ ...prev, ownerUserId: event.target.value }));
                }}
                className="w-full rounded-lg border border-border-light bg-surface px-3 py-2 text-sm"
                placeholder="owner uid"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Actor User ID
              </span>
              <input
                type="text"
                value={draftFilters.actorUserId}
                onChange={(event) => {
                  setDraftFilters((prev) => ({ ...prev, actorUserId: event.target.value }));
                }}
                className="w-full rounded-lg border border-border-light bg-surface px-3 py-2 text-sm"
                placeholder="actor uid"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                Triage Status
              </span>
              <select
                className="w-full rounded-lg border border-border-light bg-surface px-3 py-2 text-sm"
                value={draftFilters.triageStatus}
                onChange={(event) => {
                  setDraftFilters((prev) => ({
                    ...prev,
                    triageStatus: event.target.value as '' | RestoreAuditTriageStatus,
                  }));
                }}
              >
                {TRIAGE_STATUS_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={applyFilters}>
              Apply Filters
            </Button>
            <Button variant="outline" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Loaded</p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{summary.total}</p>
          </CardContent>
        </Card>
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Operator</p>
            <p className="mt-2 text-2xl font-bold text-brand-primary">{summary.operator}</p>
          </CardContent>
        </Card>
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Owner</p>
            <p className="mt-2 text-2xl font-bold text-success-dark">{summary.owner}</p>
          </CardContent>
        </Card>
        <Card padding="sm">
          <CardContent>
            <p className="text-xs uppercase tracking-wide text-text-tertiary">Delegate</p>
            <p className="mt-2 text-2xl font-bold text-text-primary">{summary.delegate}</p>
          </CardContent>
        </Card>
      </div>

      {auditQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
            <span className="text-sm text-text-secondary">Loading restore audit events...</span>
          </CardContent>
        </Card>
      )}

      {auditQuery.isError && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-error" />
            <span className="text-sm text-error">
              {auditQuery.error instanceof Error
                ? auditQuery.error.message
                : 'Failed to load restore audit events'}
            </span>
          </CardContent>
        </Card>
      )}

      {!auditQuery.isLoading && !auditQuery.isError && events.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-success-dark" />
            <span className="text-sm text-text-secondary">No restore audit events found.</span>
          </CardContent>
        </Card>
      )}

      {events.length > 0 && (
        <div className="space-y-4">
          {events.map((event) => {
            const eventTriageStatus = event.triageStatus ?? 'unreviewed';
            const eventTriageNote = event.triageNote ?? '';
            const triageDraft = triageDrafts[event.id] ?? {
              triageStatus: eventTriageStatus,
              triageNote: eventTriageNote,
            };
            const hasTriageChanges =
              triageDraft.triageStatus !== eventTriageStatus ||
              triageDraft.triageNote.trim() !== eventTriageNote;
            const isSaving = savingEventId === event.id && updateTriageMutation.isPending;

            return (
              <Card key={event.id} padding="sm">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle as="h2" className="text-base">
                      {formatResourceType(event.resourceType)} {event.resourceId ?? 'unknown'}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-background-subtle px-2.5 py-1 text-xs font-semibold text-text-secondary">
                        {event.actorCategory ?? 'unknown'}
                      </span>
                      <span className="inline-flex items-center rounded-full bg-background-subtle px-2.5 py-1 text-xs font-semibold text-text-secondary">
                        {formatTriageStatus(eventTriageStatus)}
                      </span>
                    </div>
                  </div>
                  <CardDescription>{formatTimestamp(event.createdAt)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <p className="text-text-secondary">
                      <span className="font-semibold text-text-primary">Owner:</span>{' '}
                      {event.ownerUserId ?? 'N/A'}
                    </p>
                    <p className="text-text-secondary">
                      <span className="font-semibold text-text-primary">Actor:</span>{' '}
                      {event.actorUserId ?? 'N/A'}
                    </p>
                  </div>
                  <p className="text-text-secondary">
                    <span className="font-semibold text-text-primary">Reason:</span>{' '}
                    {event.reason || 'No reason captured'}
                  </p>
                  <p className="text-text-secondary">
                    <span className="font-semibold text-text-primary">Triage updated:</span>{' '}
                    {event.triageUpdatedAt ? formatTimestamp(event.triageUpdatedAt) : 'Not yet triaged'}
                    {event.triageUpdatedBy ? ` by ${event.triageUpdatedBy}` : ''}
                  </p>
                  <div className="space-y-2 rounded-lg border border-border-light p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                      Triage Review
                    </p>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <label className="space-y-1 text-xs md:col-span-1">
                        <span className="font-semibold uppercase tracking-wide text-text-tertiary">
                          Status
                        </span>
                        <select
                          className="w-full rounded-lg border border-border-light bg-surface px-2 py-1.5 text-sm"
                          value={triageDraft.triageStatus}
                          onChange={(changeEvent) => {
                            const status = changeEvent.target.value as RestoreAuditTriageStatus;
                            setTriageDrafts((previous) => ({
                              ...previous,
                              [event.id]: {
                                triageStatus: status,
                                triageNote: triageDraft.triageNote,
                              },
                            }));
                          }}
                        >
                          {TRIAGE_STATUS_OPTIONS.filter((option) => option.value !== '').map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1 text-xs md:col-span-2">
                        <span className="font-semibold uppercase tracking-wide text-text-tertiary">
                          Triage Note
                        </span>
                        <textarea
                          className="min-h-[72px] w-full rounded-lg border border-border-light bg-surface px-2 py-1.5 text-sm"
                          placeholder="Persist triage rationale, assignee context, or resolution notes..."
                          value={triageDraft.triageNote}
                          onChange={(changeEvent) => {
                            const nextNote = changeEvent.target.value;
                            setTriageDrafts((previous) => ({
                              ...previous,
                              [event.id]: {
                                triageStatus: triageDraft.triageStatus,
                                triageNote: nextNote,
                              },
                            }));
                          }}
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          void handleSaveTriage(event.id);
                        }}
                        loading={isSaving}
                        disabled={!hasTriageChanges || isSaving}
                      >
                        Save Triage
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSaving || !hasTriageChanges}
                        onClick={() => {
                          setTriageDrafts((previous) => ({
                            ...previous,
                            [event.id]: {
                              triageStatus: eventTriageStatus,
                              triageNote: eventTriageNote,
                            },
                          }));
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                  {event.resourceType === 'visit' && event.resourceId && (
                    <p>
                      <Link
                        href={`/ops/escalations?visitId=${encodeURIComponent(event.resourceId)}`}
                        className="text-xs font-semibold text-brand-primary underline-offset-2 hover:underline"
                      >
                        Open escalation workflow for this visit
                      </Link>
                    </p>
                  )}
                  {event.metadata && (
                    <div>
                      <p className="mb-1 font-semibold text-text-primary">Metadata</p>
                      <pre className="max-h-40 overflow-auto rounded-lg bg-background-subtle p-3 text-xs text-text-secondary">
                        {JSON.stringify(event.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-text-tertiary">
          Page {cursorStack.length} | Scanned {auditQuery.data?.scanned ?? 0}
          {hasMore ? ' (more available)' : ''}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev || auditQuery.isFetching}
            onClick={() => {
              setCursorStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || !nextCursor || auditQuery.isFetching}
            onClick={() => {
              if (!nextCursor) return;
              setCursorStack((prev) => [...prev, nextCursor]);
            }}
          >
            Next
          </Button>
        </div>
      </div>

      <Card variant="outline" padding="sm">
        <CardContent className="flex items-start gap-2 text-xs text-text-tertiary">
          <FileClock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Restore audit results reflect backend-captured events for restore endpoints and are
            refreshed every 30 seconds.
          </span>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
