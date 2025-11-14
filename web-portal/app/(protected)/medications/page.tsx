'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pill as PillIcon, Trash2, Info, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useMedications, queryKeys } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { api } from '@/lib/api/client';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type GroupedMedications = {
  active: any[];
  stopped: any[];
};

export default function MedicationsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editingMedication, setEditingMedication] = React.useState<any | null>(null);
  const [medToDelete, setMedToDelete] = React.useState<any | null>(null);
  const [viewMedication, setViewMedication] = React.useState<any | null>(null);

  const { data: medications = [], isLoading } = useMedications(user?.uid);

  const createMedication = useMutation({
    mutationFn: async (values: {
      name: string;
      dose?: string;
      frequency?: string;
      notes?: string;
    }) => {
      const payload = {
        name: values.name.trim(),
        dose: sanitizeOptionalString(values.dose),
        frequency: sanitizeOptionalString(values.frequency),
        notes: sanitizeOptionalString(values.notes),
        active: true,
      };
      if (!payload.name) {
        throw new Error('Medication name is required.');
      }
      return api.medications.create(payload);
    },
    onSuccess: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.medications(user.uid),
        });
      }
      toast.success('Medication added');
      setCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Unable to add medication. Please try again.');
    },
  });

  const updateMedication = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: { name: string; dose?: string; frequency?: string; notes?: string };
    }) => {
      const payload = {
        name: values.name.trim(),
        dose: sanitizeOptionalString(values.dose),
        frequency: sanitizeOptionalString(values.frequency),
        notes: sanitizeOptionalString(values.notes),
      };
      if (!payload.name) {
        throw new Error('Medication name is required.');
      }
      return api.medications.update(id, payload);
    },
    onSuccess: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.medications(user.uid),
        });
      }
      toast.success('Medication updated');
      setEditingMedication(null);
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Unable to update medication. Please try again.');
    },
  });

  // Group & filter medications
  const { active: activeMeds, stopped: stoppedMeds }: GroupedMedications = React.useMemo(() => {
    const grouped = medications.reduce(
      (acc: GroupedMedications, med: any) => {
        const isActive = med.active !== false && !med.stoppedAt;
        if (isActive) {
          acc.active.push(med);
    } else {
          acc.stopped.push(med);
    }
        return acc;
      },
      { active: [], stopped: [] },
    );

    return grouped;
  }, [medications]);

  // Stats
  const stats = React.useMemo(() => {
    const active = medications.filter(
      (med: any) => med.active !== false && !med.stoppedAt,
    ).length;
    return {
      active,
    };
  }, [medications]);

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-8 animate-fade-in-up">
        <PageHeader
          title="Medications"
          subtitle="Manage your prescriptions and medication history"
        />

        {/* Stats Card */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <StatCard label="Active medications" value={stats.active} />
        </div>

        {/* Add Medication */}
        <Card variant="elevated" padding="lg">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
              <h3 className="text-lg font-semibold text-text-primary">Add a medication</h3>
              <p className="text-sm text-text-secondary">
                Keep your list current by adding new prescriptions as you receive them.
            </p>
          </div>
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Plus className="h-5 w-5" />}
              onClick={() => setCreateDialogOpen(true)}
              className="w-full justify-center sm:w-auto sm:justify-start sm:px-6 sm:whitespace-nowrap"
            >
            Add medication
          </Button>
        </div>
        </Card>

        {/* Active Medications */}
        <MedicationGroup
          title="Active medications"
          description="Your current prescriptions in plain language."
          emptyMessage="No active medications recorded."
          medications={activeMeds}
          isLoading={isLoading}
          onView={(med) => setViewMedication(med)}
          onEdit={(med) => setEditingMedication(med)}
          onDelete={setMedToDelete}
        />

        {/* Stopped Medications */}
        <MedicationGroup
          title="Discontinued medications"
          description="Previously prescribed medications for quick reference."
          emptyMessage="No discontinued medications recorded."
          medications={stoppedMeds}
          isLoading={isLoading}
          onView={(med) => setViewMedication(med)}
          onEdit={(med) => setEditingMedication(med)}
          onDelete={setMedToDelete}
        />

        <DeleteMedicationDialog
          medication={medToDelete}
          onClose={() => setMedToDelete(null)}
        />

        <AddMedicationDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          onSubmit={(values) => createMedication.mutate(values)}
          isSaving={createMedication.isPending}
          mode="create"
        />
        <AddMedicationDialog
          open={Boolean(editingMedication)}
          onOpenChange={(open) => {
            if (!open) setEditingMedication(null);
          }}
          initialValues={
            editingMedication
              ? {
                  name: editingMedication.name || '',
                  dose: editingMedication.dose || '',
                  frequency: editingMedication.frequency || '',
                  notes: editingMedication.notes || '',
                }
              : undefined
          }
          onSubmit={(values) => {
            if (!editingMedication) return;
            updateMedication.mutate({ id: editingMedication.id, values });
          }}
          isSaving={updateMedication.isPending}
          mode="edit"
          />

        <MedicationInsightDialog
          medication={viewMedication}
          onOpenChange={(open) => {
            if (!open) setViewMedication(null);
          }}
          />
        </div>
    </PageContainer>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card variant="flat" padding="md" className="border-l-4 border-l-brand-primary">
        <div>
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <p className="mt-2 text-3xl font-bold text-text-primary">{value}</p>
      </div>
    </Card>
  );
}

type MedicationGroupProps = {
  title: string;
  description: string;
  emptyMessage: string;
  medications: any[];
  isLoading: boolean;
  onView: (medication: any) => void;
  onEdit: (med: any) => void;
  onDelete: (med: any) => void;
};

function MedicationGroup({
  title,
  description,
  emptyMessage,
  medications,
  isLoading,
  onView,
  onEdit,
  onDelete,
}: MedicationGroupProps) {
  return (
    <Card variant="elevated" padding="none">
      <div className="flex flex-col gap-2 px-5 pt-6 sm:px-6">
        <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      {isLoading ? (
        <div className="p-10 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
          <p className="mt-4 text-text-secondary">Loading medications...</p>
        </div>
      ) : medications.length === 0 ? (
        <div className="p-10 text-center">
          <PillIcon className="mx-auto h-12 w-12 text-text-tertiary" />
          <p className="mt-4 text-sm text-text-secondary">{emptyMessage}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 hidden md:block">
            <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1fr)_96px] lg:grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_160px] items-center gap-4 border-b border-border-light bg-background-subtle px-6 py-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <div>Medication & Details</div>
              <div>Dose</div>
              <div>Frequency</div>
              <div className="hidden lg:block">Status</div>
              <div className="text-right">Actions</div>
            </div>
            <div className="divide-y divide-border-light">
              {medications.map((medication: any) => (
                <MedicationRow
                  key={medication.id}
                  medication={medication}
                  onView={() => onView(medication)}
                  onEdit={() => onEdit(medication)}
                  onDelete={() => onDelete(medication)}
                />
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-3 px-5 pb-6 md:hidden">
            {medications.map((medication: any) => (
              <MedicationCard
                key={medication.id}
                medication={medication}
                onView={() => onView(medication)}
                onEdit={() => onEdit(medication)}
                onDelete={() => onDelete(medication)}
              />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

function useMedicationInsightHelpers(medication: any) {
  const shortIndication = React.useMemo(() => {
    if (typeof medication?.indicationShort === 'string' && medication.indicationShort.trim().length) {
      return medication.indicationShort.trim();
    }
    if (typeof medication?.indication === 'string' && medication.indication.trim().length) {
      return medication.indication.trim();
    }
    return null;
  }, [medication?.indicationShort, medication?.indication]);

  const detailedIndication = React.useMemo(() => {
    if (typeof medication?.indicationDetail === 'string' && medication.indicationDetail.trim().length) {
      return medication.indicationDetail.trim();
    }
    return null;
  }, [medication?.indicationDetail]);

  const drugClass = React.useMemo(() => {
    if (typeof medication?.drugClass === 'string' && medication.drugClass.trim().length) {
      return medication.drugClass.trim();
    }
    return null;
  }, [medication?.drugClass]);

  const showInfoCta = !shortIndication || !drugClass || !detailedIndication;
  const [isFetchingInfo, setIsFetchingInfo] = React.useState(false);

  const handleNeedInfoClick = React.useCallback(
    async (event?: React.MouseEvent<HTMLButtonElement>) => {
      if (event) {
        event.stopPropagation();
      }

      if (isFetchingInfo) return;
      if (!medication?.name) {
        toast.error('Add a medication name before requesting more info.');
        return;
      }
      if (!medication?.id) {
        toast.error('Please save this medication before requesting more info.');
        return;
      }

      setIsFetchingInfo(true);
      try {
        const response = await fetch('/api/medications/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: medication.name }),
        });

        let data: any = null;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('[medications] Failed to parse insight response', parseError);
        }

        if (!response.ok || !data) {
          throw new Error(data?.error || 'Unable to fetch medication details.');
        }

        const updatePayload: Record<string, any> = {};
        if (typeof data.shortIndication === 'string' && data.shortIndication.trim().length) {
          updatePayload.indicationShort = toTitleCase(data.shortIndication.trim());
        }
        if (typeof data.detailedIndication === 'string' && data.detailedIndication.trim().length) {
          updatePayload.indicationDetail = data.detailedIndication.trim();
        }
        if (typeof data.drugClass === 'string' && data.drugClass.trim().length) {
          updatePayload.drugClass = toTitleCase(data.drugClass.trim());
        }

        if (Object.keys(updatePayload).length === 0) {
          toast.info('No additional information was returned.');
          return;
        }

        updatePayload.insightSource = 'openai';
        updatePayload.insightFetchedAt = serverTimestamp();

        await updateDoc(doc(db, 'medications', medication.id), updatePayload);
        toast.success('Medication insights saved.');
      } catch (error) {
        console.error('[medications] Insight fetch failed', error);
        toast.error(
          error instanceof Error
            ? error.message
            : 'Unable to retrieve medication details. Please try again.',
        );
      } finally {
        setIsFetchingInfo(false);
      }
    },
    [isFetchingInfo, medication],
  );

  return {
    shortIndication,
    detailedIndication,
    drugClass,
    showInfoCta,
    isFetchingInfo,
    handleNeedInfoClick,
  };
}

function MedicationRow({
  medication,
  onView,
  onEdit,
  onDelete,
}: {
  medication: any;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isActive = medication.active !== false && !medication.stoppedAt;
  const { shortIndication, drugClass, showInfoCta, isFetchingInfo, handleNeedInfoClick } =
    useMedicationInsightHelpers(medication);
  const columnTemplate =
    'grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1fr)_96px] lg:grid-cols-[minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_160px]';
  const medicationName =
    typeof medication.name === 'string' && medication.name.trim().length
      ? medication.name.trim()
      : 'Medication';
  const doseLabel =
    typeof medication.dose === 'string' && medication.dose.trim().length
      ? medication.dose.trim()
      : '—';
  const frequencyLabel =
    typeof medication.frequency === 'string' && medication.frequency.trim().length
      ? medication.frequency.trim()
      : '—';
  const tooltipClassName =
    'max-w-xs text-sm font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2';
  const showNameTooltip = medicationName.length > 26;
  const showIndicationTooltip = (shortIndication?.length ?? 0) > 32;
  const showDoseTooltip = doseLabel.length > 18;
  const showFrequencyTooltip = frequencyLabel.length > 18;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'group items-center gap-4 px-6 py-5 transition-smooth hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/20 cursor-pointer',
          'grid',
          columnTemplate,
        )}
        role="button"
        tabIndex={0}
        onClick={onView}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onView();
          }
        }}
      >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            isActive ? 'bg-success-light text-success-dark' : 'bg-error-light text-error-dark',
          )}
        >
          <PillIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex items-start gap-2">
            {showNameTooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="font-semibold text-text-primary truncate" title={medicationName}>
                    {medicationName}
                  </p>
                </TooltipTrigger>
                <TooltipContent className={tooltipClassName}>{medicationName}</TooltipContent>
              </Tooltip>
            ) : (
              <p className="font-semibold text-text-primary truncate" title={medicationName}>
                {medicationName}
              </p>
            )}
            {showInfoCta ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleNeedInfoClick(event);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50',
                      isFetchingInfo
                        ? 'border-brand-primary bg-brand-primary/10 text-brand-primary animate-pulse'
                        : 'border-border-light bg-background-subtle text-text-secondary hover:border-brand-primary hover:text-brand-primary hover:scale-110'
                    )}
                    aria-label="Fetch more medication info"
                    disabled={isFetchingInfo}
                    aria-busy={isFetchingInfo}
                  >
                    {isFetchingInfo ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Info className="h-3 w-3" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-[240px] text-xs font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2">
                  {isFetchingInfo ? 'Fetching medication info...' : 'Need a quick summary? Click for medication type and common uses.'}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {shortIndication ? (
            showIndicationTooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p
                    className="text-sm text-text-secondary truncate capitalize"
                    title={shortIndication}
                  >
                    {shortIndication}
                  </p>
                </TooltipTrigger>
                <TooltipContent className={tooltipClassName}>{shortIndication}</TooltipContent>
              </Tooltip>
            ) : (
              <p className="text-sm text-text-secondary truncate capitalize" title={shortIndication}>
                {shortIndication}
              </p>
            )
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary lg:hidden">
          <Badge tone={isActive ? 'success' : 'neutral'} variant={isActive ? 'soft' : 'outline'} size="sm">
            {isActive ? 'Active' : 'Stopped'}
          </Badge>
          {drugClass ? (
            <Badge tone="neutral" variant="outline" size="sm" className="truncate max-w-[140px]" title={drugClass}>
              {drugClass}
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="text-sm text-text-secondary truncate" title={doseLabel}>
        {showDoseTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{doseLabel}</span>
            </TooltipTrigger>
            <TooltipContent className={tooltipClassName}>{doseLabel}</TooltipContent>
          </Tooltip>
        ) : (
          doseLabel
        )}
      </div>
      <div className="text-sm text-text-secondary truncate" title={frequencyLabel}>
        {showFrequencyTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>{frequencyLabel}</span>
            </TooltipTrigger>
            <TooltipContent className={tooltipClassName}>{frequencyLabel}</TooltipContent>
          </Tooltip>
        ) : (
          frequencyLabel
        )}
      </div>
      <div className="hidden lg:flex items-center gap-2">
        <Badge tone={isActive ? 'success' : 'neutral'} variant={isActive ? 'soft' : 'outline'} size="sm">
          {isActive ? 'Active' : 'Stopped'}
        </Badge>
        {drugClass ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                tone="neutral"
                variant="outline"
                size="sm"
                className="inline-flex max-w-[160px] truncate cursor-help"
                title={drugClass}
              >
                {drugClass}
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="text-xs font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2">
              {drugClass}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-error hover:text-error"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      </div>
    </TooltipProvider>
  );
}

function MedicationCard({
  medication,
  onView,
  onEdit,
  onDelete,
}: {
  medication: any;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const isActive = medication.active !== false && !medication.stoppedAt;
  const {
    shortIndication,
    detailedIndication,
    drugClass,
    showInfoCta,
    isFetchingInfo,
    handleNeedInfoClick,
  } = useMedicationInsightHelpers(medication);

  const medicationName =
    typeof medication.name === 'string' && medication.name.trim().length
      ? medication.name.trim()
      : 'Medication';
  const tooltipClassName =
    'max-w-xs text-sm font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2';
  const showNameTooltip = medicationName.length > 28;
  const showShortIndicationTooltip = (shortIndication?.length ?? 0) > 32;

  const doseLabel =
    typeof medication.dose === 'string' && medication.dose.trim().length
      ? medication.dose.trim()
      : '—';
  const frequencyLabel =
    typeof medication.frequency === 'string' && medication.frequency.trim().length
      ? medication.frequency.trim()
      : '—';
  const notesLabel =
    typeof medication.notes === 'string' && medication.notes.trim().length
      ? medication.notes.trim()
      : null;

  const hasExpandableContent = detailedIndication || notesLabel;

  const handleCardClick = () => {
    if (hasExpandableContent) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (hasExpandableContent) {
        setIsExpanded(!isExpanded);
      }
    }
  };

  return (
    <div
      className={cn(
        'relative rounded-3xl border border-border-light bg-surface px-5 py-5 shadow-soft transition-all',
        hasExpandableContent && 'cursor-pointer hover:shadow-hover active:scale-[0.99]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40'
      )}
      role={hasExpandableContent ? 'button' : undefined}
      tabIndex={hasExpandableContent ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      aria-expanded={hasExpandableContent ? isExpanded : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
            isActive ? 'bg-success-light text-success-dark' : 'bg-error-light text-error-dark',
          )}
        >
          <PillIcon className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-start gap-2">
                {showNameTooltip ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <h3
                        className="text-lg font-semibold text-text-primary line-clamp-2"
                        title={medicationName}
                      >
                        {medicationName}
                      </h3>
                    </TooltipTrigger>
                    <TooltipContent className={tooltipClassName}>{medicationName}</TooltipContent>
                  </Tooltip>
                ) : (
                  <h3
                    className="text-lg font-semibold text-text-primary line-clamp-2"
                    title={medicationName}
                  >
                    {medicationName}
                  </h3>
                )}
                {showInfoCta ? (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleNeedInfoClick(event);
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50',
                            isFetchingInfo
                              ? 'border-brand-primary bg-brand-primary/10 text-brand-primary animate-pulse'
                              : 'border-border-light bg-background-subtle text-text-secondary hover:border-brand-primary hover:text-brand-primary hover:scale-110'
                          )}
                          aria-label="Fetch more medication info"
                          disabled={isFetchingInfo}
                          aria-busy={isFetchingInfo}
                        >
                          {isFetchingInfo ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Info className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-[240px] text-xs font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2">
                        {isFetchingInfo ? 'Fetching medication info...' : 'Need a quick summary? Click for medication type and common uses.'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : null}
              </div>
              {shortIndication ? (
                showShortIndicationTooltip ? (
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p
                          className="text-sm text-text-secondary capitalize line-clamp-2"
                          title={shortIndication}
                        >
                          {shortIndication}
                        </p>
                      </TooltipTrigger>
                      <TooltipContent className={tooltipClassName}>{shortIndication}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <p
                    className="text-sm text-text-secondary capitalize line-clamp-2"
                    title={shortIndication}
                  >
                    {shortIndication}
                  </p>
                )
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge tone={isActive ? 'success' : 'neutral'} variant={isActive ? 'soft' : 'outline'} size="sm">
                {isActive ? 'Active' : 'Stopped'}
              </Badge>
              {drugClass ? (
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        tone="neutral"
                        variant="outline"
                        size="sm"
                        className="max-w-[160px] truncate cursor-help"
                      >
                        {drugClass}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2">
                      {drugClass}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
            </div>
          </div>

          {/* Simplified dose/frequency for mobile */}
          <div className="flex items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-text-secondary">Dose:</span>
              <span className="text-text-primary font-semibold">{doseLabel}</span>
            </div>
            <span className="text-text-tertiary">•</span>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-text-secondary">Freq:</span>
              <span className="text-text-primary font-semibold">{frequencyLabel}</span>
            </div>
          </div>

          {/* Expandable details section */}
          {hasExpandableContent && (
            <>
              {isExpanded ? (
                <div className="space-y-3 animate-fade-in-up">
                  {detailedIndication && (
                    <div className="rounded-2xl border border-border-light bg-background-subtle/40 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
                        About this medication
                      </p>
                      <p className="text-sm text-text-primary leading-relaxed">
                        {detailedIndication}
                      </p>
                    </div>
                  )}
                  {notesLabel && (
                    <div className="rounded-2xl border border-dashed border-border-light/80 bg-background-subtle/60 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-2">
                        Personal notes
                      </p>
                      <p className="text-sm text-text-secondary/90 whitespace-pre-line">
                        {notesLabel}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(true);
                  }}
                  className="text-sm text-brand-primary font-semibold hover:text-brand-primary-dark transition-colors flex items-center gap-1"
                >
                  <span>See more details</span>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Simplified action buttons */}
      <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-border-light/60">
        <Button
          variant="outline"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          className="flex-1 justify-center"
        >
          Edit medication
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-10 w-10 shrink-0 rounded-full text-text-tertiary hover:text-error hover:bg-error/10 active:scale-95"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          aria-label="Delete medication"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .replace(/\b(of|and|for|to|in|on|the)\b/gi, (match) => match.toLowerCase());
  }

function sanitizeOptionalString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function formatInsightTimestamp(value: unknown): string | null {
  if (!value) return null;

  try {
    if (typeof value === 'string') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
}
    }

    if (typeof value === 'object' && value !== null) {
      // Firestore Timestamp has toDate()
      if ('toDate' in (value as Record<string, unknown>) && typeof (value as any).toDate === 'function') {
        const date = (value as any).toDate();
        return date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
      }
      if ('seconds' in (value as Record<string, unknown>)) {
        const seconds = Number((value as any).seconds);
        const nanos = Number((value as any).nanoseconds ?? (value as any).nanosecond ?? 0);
        if (!Number.isNaN(seconds)) {
          const date = new Date(seconds * 1000 + nanos / 1_000_000);
          return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
        }
      }
    }
  } catch (error) {
    console.warn('[medications] Failed to format insight timestamp', error);
  }

  return null;
}

function DeleteMedicationDialog({
  medication,
  onClose,
}: {
  medication: any | null;
  onClose: () => void;
}) {
  if (!medication) return null;

  const handleDelete = async () => {
    try {
      await deleteDoc(doc(db, 'medications', medication.id));
      toast.success('Medication deleted');
      onClose();
    } catch (error) {
      console.error('[medications] Failed to delete medication', error);
      toast.error('Unable to delete medication. Please try again.');
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete medication</DialogTitle>
          <DialogDescription>
            This will remove {medication.name || 'this medication'} from your list.
            You will no longer see it in your medication history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MedicationInsightDialogProps = {
  medication: any | null;
  onOpenChange: (open: boolean) => void;
};

function MedicationInsightDialog({ medication, onOpenChange }: MedicationInsightDialogProps) {
  const open = Boolean(medication);
  const shortIndicationRaw =
    typeof medication?.indicationShort === 'string' && medication.indicationShort.trim().length
      ? medication.indicationShort
      : typeof medication?.indication === 'string' && medication.indication.trim().length
        ? medication.indication
        : null;
  const shortIndication = shortIndicationRaw ? shortIndicationRaw.trim() : null;

  const detailedIndication =
    typeof medication?.indicationDetail === 'string' && medication.indicationDetail.trim().length
      ? medication.indicationDetail.trim()
      : null;

  const drugClass =
    typeof medication?.drugClass === 'string' && medication.drugClass.trim().length
      ? medication.drugClass.trim()
      : null;

  const notes =
    typeof medication?.notes === 'string' && medication.notes.trim().length
      ? medication.notes.trim()
      : null;

  const fetchedAtLabel = medication ? formatInsightTimestamp(medication.insightFetchedAt) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-text-primary">
            {medication?.name || 'Medication'}
          </DialogTitle>
          <DialogDescription>
            {shortIndication
              ? `Snapshot: ${shortIndication}`
              : 'Fetch quick insight to see indication and drug class.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border-light bg-background-subtle/60 p-4 space-y-2">
            <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Detailed indication
            </p>
            <p className="text-sm text-text-primary whitespace-pre-line">
              {detailedIndication ||
                shortIndication ||
                'We don’t have a detailed indication yet. Use “Need more info” from the list to generate one.'}
            </p>
          </div>
          <div className="rounded-xl border border-border-light bg-background-subtle/60 p-4">
            <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Drug class
            </p>
            <p className="text-sm text-text-primary">
              {drugClass || 'Not available yet'}
            </p>
          </div>
          <div className="rounded-xl border border-border-light bg-background-subtle/40 p-4 space-y-2">
            <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
              Dose & Schedule
            </p>
            <p className="text-sm text-text-primary">
              {[
                medication?.dose ? `Dose: ${medication.dose}` : null,
                medication?.frequency ? `Frequency: ${medication.frequency}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || 'No dose information recorded.'}
            </p>
          </div>
          {notes ? (
            <div className="rounded-xl border border-dashed border-border-light bg-background-subtle/30 p-4 space-y-2">
              <p className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
                Personal notes
              </p>
              <p className="text-sm text-text-primary whitespace-pre-line">{notes}</p>
            </div>
          ) : null}
          {fetchedAtLabel ? (
            <p className="text-xs text-text-muted text-right">
              Insight updated {fetchedAtLabel}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type MedicationFormValues = {
  name: string;
  dose?: string;
  frequency?: string;
  notes?: string;
};

function AddMedicationDialog({
  open,
  onOpenChange,
  onSubmit,
  isSaving,
  initialValues,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: MedicationFormValues) => void;
  isSaving: boolean;
  initialValues?: MedicationFormValues;
  mode: 'create' | 'edit';
}) {
  const [name, setName] = React.useState(initialValues?.name ?? '');
  const [dose, setDose] = React.useState(initialValues?.dose ?? '');
  const [frequency, setFrequency] = React.useState(initialValues?.frequency ?? '');
  const [notes, setNotes] = React.useState(initialValues?.notes ?? '');

  React.useEffect(() => {
    if (open && initialValues) {
      setName(initialValues.name ?? '');
      setDose(initialValues.dose ?? '');
      setFrequency(initialValues.frequency ?? '');
      setNotes(initialValues.notes ?? '');
    }
    if (!open && mode === 'create') {
      setName('');
      setDose('');
      setFrequency('');
      setNotes('');
    }
  }, [open, initialValues, mode]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && mode === 'create') {
      setName('');
      setDose('');
      setFrequency('');
      setNotes('');
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({ name, dose, frequency, notes });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit medication' : 'Add medication'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Update the details of this medication.'
              : 'Enter the details shown on your prescription so LumiMD can keep everything in sync.'}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="medication-name">
              Name
            </label>
            <input
              id="medication-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
              placeholder="e.g. Lisinopril"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="medication-dose">
                Dose
              </label>
              <input
                id="medication-dose"
                value={dose}
                onChange={(event) => setDose(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
                placeholder="e.g. 10 mg"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary" htmlFor="medication-frequency">
                Frequency
              </label>
              <input
                id="medication-frequency"
                value={frequency}
                onChange={(event) => setFrequency(event.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
                placeholder="e.g. Once daily"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="medication-notes">
              Notes (optional)
            </label>
            <textarea
              id="medication-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-24 w-full resize-none rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/30"
              placeholder="Add instructions or reminders."
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Add medication'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
