'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Calendar,
  Stethoscope,
  Pill,
  ClipboardList,
  MapPin,
  Sparkles,
  CheckCircle2,
  MinusCircle,
  RefreshCw,
  FileText,
  Pencil,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useCareVisitSummary, useUpdateVisitMetadata, useCareVisits } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const trimText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const formatFollowUpAction = (entry: unknown): string | null => {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const task = trimText(record.task) || trimText(record.type) || 'Follow up';
  const timeframe = trimText(record.timeframe);
  const dueAt = trimText(record.dueAt);

  if (timeframe) {
    return `${task} — ${timeframe}`;
  }

  if (dueAt) {
    const dateValue = new Date(dueAt);
    const dueLabel = Number.isNaN(dateValue.getTime()) ? dueAt : format(dateValue, 'MMM d, yyyy');
    return `${task} — by ${dueLabel}`;
  }

  return task;
};

const formatOrderedTest = (entry: unknown): string | null => {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const name = trimText(record.name);
  if (!name) return null;
  const category = trimText(record.category);
  if (!category || category.toLowerCase() === 'other') {
    return name;
  }
  return `${name} (${category})`;
};

const formatMedicationDisplay = (med: unknown): string => {
  if (typeof med === 'string') return med;
  if (med && typeof med === 'object') {
    const record = med as Record<string, unknown>;
    return (
      (record.display as string) ||
      (record.name as string) ||
      (record.original as string) ||
      'Medication'
    );
  }
  return 'Medication';
};

export default function CareVisitDetailPage() {
  const params = useParams<{ patientId: string; visitId: string }>();
  const patientId = params.patientId;
  const visitId = params.visitId;

  const { data: visitData, isLoading, error, refetch } = useCareVisitSummary(patientId, visitId);
  const { data: allVisits } = useCareVisits(patientId);
  const updateVisitMetadata = useUpdateVisitMetadata();

  // Local override for optimistic updates
  const [localOverrides, setLocalOverrides] = React.useState<{
    provider?: string;
    specialty?: string;
    location?: string;
    visitDate?: string;
  } | null>(null);

  // Merge server data with local overrides
  const visit = React.useMemo(() => {
    if (!visitData) return null;
    if (!localOverrides) return visitData;
    return {
      ...visitData,
      provider: localOverrides.provider ?? visitData.provider,
      specialty: localOverrides.specialty ?? visitData.specialty,
      location: localOverrides.location ?? visitData.location,
      visitDate: localOverrides.visitDate ?? visitData.visitDate,
    };
  }, [visitData, localOverrides]);

  // Clear local overrides when server data updates
  React.useEffect(() => {
    if (visitData) {
      setLocalOverrides(null);
    }
  }, [visitData]);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    provider: '',
    specialty: '',
    location: '',
    visitDate: '',
  });

  // Build provider -> specialty/location mappings from all visits
  const { providerMap, specialties, providers, locations } = React.useMemo(() => {
    const pMap = new Map<string, { specialty: string | null; location: string | null }>();
    const specSet = new Set<string>();
    const provSet = new Set<string>();
    const locSet = new Set<string>();

    if (allVisits) {
      allVisits.forEach((v: any) => {
        const prov = v.provider?.trim();
        const spec = v.specialty?.trim();
        const loc = v.location?.trim();

        if (prov) {
          provSet.add(prov);
          // Store the most recent specialty/location for this provider
          if (!pMap.has(prov) || spec || loc) {
            const existing = pMap.get(prov) || { specialty: null, location: null };
            pMap.set(prov, {
              specialty: spec || existing.specialty,
              location: loc || existing.location,
            });
          }
        }
        if (spec) specSet.add(spec);
        if (loc) locSet.add(loc);
      });
    }

    return {
      providerMap: pMap,
      specialties: Array.from(specSet).sort(),
      providers: Array.from(provSet).sort(),
      locations: Array.from(locSet).sort(),
    };
  }, [allVisits]);

  // Initialize edit form when visit data loads
  React.useEffect(() => {
    if (visit) {
      const visitDate = visit.visitDate ? new Date(visit.visitDate) : null;
      const formattedDateForInput = visitDate && !isNaN(visitDate.getTime())
        ? format(visitDate, 'yyyy-MM-dd')
        : '';
      
      setEditForm({
        provider: visit.provider || '',
        specialty: visit.specialty || '',
        location: visit.location || '',
        visitDate: formattedDateForInput,
      });
    }
  }, [visit]);

  // Auto-fill specialty and location when provider changes
  const handleProviderChange = (value: string) => {
    setEditForm((prev) => {
      const newForm = { ...prev, provider: value };
      
      // If we know this provider, auto-fill specialty and location if empty
      const knownProvider = providerMap.get(value);
      if (knownProvider) {
        if (!prev.specialty && knownProvider.specialty) {
          newForm.specialty = knownProvider.specialty;
        }
        if (!prev.location && knownProvider.location) {
          newForm.location = knownProvider.location;
        }
      }
      
      return newForm;
    });
  };

  const handleOpenEdit = () => {
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    try {
      await updateVisitMetadata.mutateAsync({
        patientId,
        visitId,
        data: {
          provider: editForm.provider,
          specialty: editForm.specialty,
          location: editForm.location,
          visitDate: editForm.visitDate || null,
        },
      });
      
      // Optimistically update the UI immediately
      setLocalOverrides({
        provider: editForm.provider || undefined,
        specialty: editForm.specialty || undefined,
        location: editForm.location || undefined,
        visitDate: editForm.visitDate ? new Date(editForm.visitDate).toISOString() : undefined,
      });
      
      toast.success('Visit details updated');
      setEditDialogOpen(false);
      
      // Also refetch to sync with server
      refetch();
    } catch (err) {
      toast.error('Failed to update visit');
    }
  };

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
          <p className="text-sm text-text-secondary">Loading visit summary...</p>
        </div>
      </PageContainer>
    );
  }

  if (error || !visit) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Unable to load visit
          </h2>
          <p className="text-text-secondary mb-4">
            {error?.message || 'An error occurred while loading this visit.'}
          </p>
          <Button variant="secondary" asChild>
            <Link href={`/care/${patientId}/visits`} className="flex items-center">
              <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
              <span>Back to Visits</span>
            </Link>
          </Button>
        </Card>
      </PageContainer>
    );
  }

  // Parse medications
  const medications = visit.medications as Record<string, unknown> | undefined;
  const startedMeds = Array.isArray(medications?.started) ? medications.started : [];
  const stoppedMeds = Array.isArray(medications?.stopped) ? medications.stopped : [];
  const changedMeds = Array.isArray(medications?.changed) ? medications.changed : [];
  const hasMedChanges = startedMeds.length > 0 || stoppedMeds.length > 0 || changedMeds.length > 0;

  // Parse diagnoses
  const diagnoses = Array.isArray(visit.diagnoses) && visit.diagnoses.length > 0
    ? visit.diagnoses.filter(Boolean)
    : Array.isArray((visit as any).diagnosesDetailed)
      ? ((visit as any).diagnosesDetailed as Array<Record<string, unknown>>)
        .map((item) => trimText(item?.name))
        .filter((value): value is string => Boolean(value))
      : [];

  // Parse action items (prefer structured follow-ups, fallback to legacy nextSteps)
  const nextSteps = Array.isArray((visit as any).followUps)
    ? ((visit as any).followUps as unknown[])
      .map(formatFollowUpAction)
      .filter((value): value is string => Boolean(value))
    : [];
  const actionItems = nextSteps.length > 0
    ? nextSteps
    : Array.isArray(visit.nextSteps)
      ? visit.nextSteps.filter(Boolean)
      : [];

  // Parse ordered tests (prefer structured testsOrdered, fallback to legacy imaging)
  const orderedTests = Array.isArray((visit as any).testsOrdered)
    ? ((visit as any).testsOrdered as unknown[])
      .map(formatOrderedTest)
      .filter((value): value is string => Boolean(value))
    : [];
  const orderedTestItems = orderedTests.length > 0
    ? orderedTests
    : Array.isArray((visit as any).imaging)
      ? ((visit as any).imaging as string[]).filter(Boolean)
      : [];

  const medicationReview = React.useMemo(() => {
    const review = (visit as any).medicationReview as Record<string, unknown> | undefined;
    if (!review || typeof review !== 'object') {
      return {
        reviewed: false,
        followUpNeeded: false,
        continuedReviewed: [] as unknown[],
        concerns: [] as string[],
        sideEffects: [] as string[],
        notes: [] as string[],
      };
    }

    const continuedReviewed = Array.isArray(review.continuedReviewed)
      ? (review.continuedReviewed as unknown[]).filter(Boolean)
      : Array.isArray(review.continued)
        ? (review.continued as unknown[]).filter(Boolean)
        : [];
    const adherenceConcerns = Array.isArray(review.adherenceConcerns)
      ? (review.adherenceConcerns as unknown[])
        .map(trimText)
        .filter((value): value is string => Boolean(value))
      : [];
    const reviewConcerns = Array.isArray(review.reviewConcerns)
      ? (review.reviewConcerns as unknown[])
        .map(trimText)
        .filter((value): value is string => Boolean(value))
      : [];
    const concerns = Array.from(new Set([...reviewConcerns, ...adherenceConcerns]));
    const sideEffects = Array.isArray(review.sideEffectsDiscussed)
      ? (review.sideEffectsDiscussed as unknown[])
        .map(trimText)
        .filter((value): value is string => Boolean(value))
      : [];
    const notes = Array.isArray(review.notes)
      ? (review.notes as unknown[])
        .map(trimText)
        .filter((value): value is string => Boolean(value))
      : [];
    const reviewed = typeof review.reviewed === 'boolean'
      ? review.reviewed
      : continuedReviewed.length > 0 ||
        concerns.length > 0 ||
        sideEffects.length > 0 ||
        notes.length > 0;

    return {
      reviewed,
      followUpNeeded: Boolean(review.followUpNeeded),
      continuedReviewed,
      concerns,
      sideEffects,
      notes,
    };
  }, [visit]);

  const hasMedicationReviewDetails =
    medicationReview.reviewed ||
    medicationReview.continuedReviewed.length > 0 ||
    medicationReview.concerns.length > 0 ||
    medicationReview.sideEffects.length > 0 ||
    medicationReview.notes.length > 0 ||
    medicationReview.followUpNeeded;

  // Format visit date
  const visitDate = visit.visitDate ? new Date(visit.visitDate) : null;
  const formattedDate = visitDate && !isNaN(visitDate.getTime())
    ? format(visitDate, 'EEEE, MMMM d, yyyy')
    : null;

  return (
    <PageContainer maxWidth="2xl">
      <div className="flex flex-col gap-8">
        {/* Back Button */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/care/${patientId}/visits`} className="flex items-center text-text-secondary hover:text-brand-primary">
              <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
              <span>Back to visits</span>
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleOpenEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            Edit Details
          </Button>
        </div>

        {/* Header with key details */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="brand" variant="soft" size="sm" className="gap-1">
              <FileText className="h-3 w-3" />
              Visit Summary
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
            {visit.provider || 'Medical Visit'}
          </h1>
          {visit.specialty && (
            <p className="text-lg text-text-secondary">{visit.specialty}</p>
          )}
        </header>

        {/* Highlight Cards */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HighlightCard
            icon={<Calendar className="h-4 w-4 text-text-muted" />}
            label="Visit Date"
            value={formattedDate || 'Not recorded'}
            onEdit={handleOpenEdit}
          />
          <HighlightCard
            icon={<Stethoscope className="h-4 w-4 text-text-muted" />}
            label="Provider"
            value={visit.provider || 'Not recorded'}
            onEdit={handleOpenEdit}
          />
          <HighlightCard
            icon={<Sparkles className="h-4 w-4 text-text-muted" />}
            label="Specialty"
            value={visit.specialty || 'Not recorded'}
            onEdit={handleOpenEdit}
          />
          <HighlightCard
            icon={<MapPin className="h-4 w-4 text-text-muted" />}
            label="Location"
            value={visit.location || 'Not recorded'}
            onEdit={handleOpenEdit}
          />
        </section>

        {/* AI Summary Card */}
        <Card className="relative overflow-hidden border-none bg-gradient-to-br from-brand-primary/10 via-card to-card shadow-floating">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.45),_transparent_60%)]" />
          <div className="relative z-10 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-4">
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-surface/80 px-3 py-1 text-xs font-semibold text-text-secondary shadow-sm">
                  <Sparkles className="h-3 w-3" />
                  AI Summary
                </span>
                <h2 className="text-xl font-semibold text-text-primary">Visit Highlights</h2>
                <p className="text-sm text-text-secondary">
                  Key takeaways generated from the visit recording.
                </p>
              </div>
            </div>
            {visit.summary ? (
              <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-sm">
                <p className="text-sm leading-relaxed text-text-primary whitespace-pre-wrap">
                  {visit.summary}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border-light/80 bg-background-subtle/70 p-6 text-center text-sm text-text-muted shadow-inner">
                Summary is still being processed. Check back soon.
              </div>
            )}
          </div>
        </Card>

        {/* Two Column Layout for Action Items and Diagnoses */}
        <section className="grid gap-6 lg:grid-cols-2">
          {/* Action Items / Next Steps */}
          <Card variant="elevated" padding="none" className="overflow-hidden">
            <div className="border-b border-border-light bg-background-subtle/50 px-5 py-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-warning" />
                Action Items
              </h2>
              <p className="text-sm text-text-secondary mt-1">
                Follow-up tasks from this visit
              </p>
            </div>
            <div className="p-5">
              {actionItems.length > 0 ? (
                <ul className="space-y-3">
                  {actionItems.map((step, idx) => (
                    <li
                      key={`step-${idx}`}
                      className="flex items-start gap-3 rounded-2xl border border-border-light/60 bg-background-subtle/70 px-4 py-3 text-sm text-text-primary shadow-sm"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning/15 text-xs font-semibold text-warning-dark">
                        {idx + 1}
                      </span>
                      <p className="leading-relaxed">{String(step)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">
                  No action items recorded for this visit.
                </p>
              )}

              <div className="mt-5 border-t border-border-light/60 pt-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2">Ordered Tests</h3>
                {orderedTestItems.length > 0 ? (
                  <ul className="space-y-2">
                    {orderedTestItems.map((item, idx) => (
                      <li
                        key={`test-${idx}`}
                        className="rounded-xl border border-border-light/60 bg-background-subtle/70 px-3 py-2 text-sm text-text-primary"
                      >
                        {String(item)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-text-muted">No ordered tests recorded.</p>
                )}
              </div>
            </div>
          </Card>

          {/* Diagnoses */}
          <Card variant="elevated" padding="none" className="overflow-hidden">
            <div className="border-b border-border-light bg-background-subtle/50 px-5 py-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-text-muted" />
                Diagnoses
              </h2>
              <p className="text-sm text-text-secondary mt-1">
                Conditions discussed during this visit
              </p>
            </div>
            <div className="p-5">
              {diagnoses.length > 0 ? (
                <ul className="space-y-2">
                  {diagnoses.map((diagnosis, idx) => (
                    <li
                      key={`dx-${idx}`}
                      className="rounded-2xl border border-border-light/60 bg-background-subtle/70 px-4 py-3 shadow-sm"
                    >
                      <span className="font-medium text-text-primary">{String(diagnosis)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted text-center py-4">
                  No diagnoses recorded for this visit.
                </p>
              )}
            </div>
          </Card>
        </section>

        {/* Medication Changes */}
        <Card variant="elevated" padding="none" className="overflow-hidden">
          <div className="border-b border-border-light bg-background-subtle/50 px-5 py-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Pill className="h-5 w-5 text-success" />
              Medication Changes
            </h2>
            <p className="text-sm text-text-secondary mt-1">
              What was started, adjusted, or stopped as a result of this visit
            </p>
          </div>
          <div className="p-5">
            {hasMedChanges ? (
              <div className="grid gap-6 sm:grid-cols-3">
                <MedicationSection
                  label="Started"
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  items={startedMeds}
                  tone="success"
                  emptyMessage="No new medications"
                />
                <MedicationSection
                  label="Adjusted"
                  icon={<RefreshCw className="h-4 w-4" />}
                  items={changedMeds}
                  tone="warning"
                  emptyMessage="No adjustments"
                />
                <MedicationSection
                  label="Stopped"
                  icon={<MinusCircle className="h-4 w-4" />}
                  items={stoppedMeds}
                  tone="danger"
                  emptyMessage="No medications stopped"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border-light/60 bg-background-subtle/70 p-6 text-center text-sm text-text-muted">
                No medication changes were recorded in this visit.
              </div>
            )}

            {hasMedicationReviewDetails ? (
              <div className="mt-5 border-t border-border-light/60 pt-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2">Medication Review</h3>

                {medicationReview.continuedReviewed.length > 0 ? (
                  <div className="mb-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Reviewed/continued
                    </p>
                    <ul className="space-y-2">
                      {medicationReview.continuedReviewed.map((item, idx) => (
                        <li
                          key={`review-med-${idx}`}
                          className="rounded-xl border border-border-light/60 bg-background-subtle/70 px-3 py-2 text-sm text-text-primary"
                        >
                          {formatMedicationDisplay(item)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {medicationReview.concerns.length > 0 ? (
                  <div className="mb-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Review concerns
                    </p>
                    <ul className="ml-4 list-disc space-y-1 text-sm text-text-primary">
                      {medicationReview.concerns.map((item, idx) => (
                        <li key={`review-concern-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {medicationReview.sideEffects.length > 0 ? (
                  <div className="mb-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Side effects discussed
                    </p>
                    <ul className="ml-4 list-disc space-y-1 text-sm text-text-primary">
                      {medicationReview.sideEffects.map((item, idx) => (
                        <li key={`review-side-effect-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {medicationReview.notes.length > 0 ? (
                  <div className="mb-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Notes
                    </p>
                    <ul className="ml-4 list-disc space-y-1 text-sm text-text-primary">
                      {medicationReview.notes.map((item, idx) => (
                        <li key={`review-note-${idx}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {medicationReview.followUpNeeded ? (
                  <p className="text-sm font-medium text-warning-dark">
                    Medication follow-up is needed.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Visit Details</DialogTitle>
            <DialogDescription>
              Update the provider, specialty, location, or date for this visit.
              Selecting a known provider will auto-fill specialty and location.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">
                Provider Name
              </label>
              <Input
                value={editForm.provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                placeholder="e.g., Dr. Smith"
                list="provider-suggestions"
              />
              <datalist id="provider-suggestions">
                {providers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {providers.length > 0 && (
                <p className="text-xs text-text-muted">
                  {providers.length} provider{providers.length !== 1 ? 's' : ''} from previous visits
                </p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">
                Specialty
              </label>
              <Input
                value={editForm.specialty}
                onChange={(e) => setEditForm((prev) => ({ ...prev, specialty: e.target.value }))}
                placeholder="e.g., Cardiology"
                list="specialty-suggestions"
              />
              <datalist id="specialty-suggestions">
                {specialties.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">
                Location
              </label>
              <Input
                value={editForm.location}
                onChange={(e) => setEditForm((prev) => ({ ...prev, location: e.target.value }))}
                placeholder="e.g., Main Street Medical Center"
                list="location-suggestions"
              />
              <datalist id="location-suggestions">
                {locations.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-text-primary">
                Visit Date
              </label>
              <Input
                type="date"
                value={editForm.visitDate}
                onChange={(e) => setEditForm((prev) => ({ ...prev, visitDate: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateVisitMetadata.isPending}
            >
              {updateVisitMetadata.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function HighlightCard({
  icon,
  label,
  value,
  onEdit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onEdit?: () => void;
}) {
  return (
    <button
      onClick={onEdit}
      className="w-full text-left group rounded-2xl border border-border-light/60 bg-background-subtle/70 p-4 shadow-soft backdrop-blur-sm hover:border-brand-primary/30 hover:shadow-md transition-all"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {icon}
          {label}
        </div>
        <Pencil className="h-3 w-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="mt-2 text-base font-semibold text-text-primary truncate" title={value}>
        {value}
      </div>
    </button>
  );
}

function MedicationSection({
  label,
  icon,
  items,
  tone,
  emptyMessage,
}: {
  label: string;
  icon: React.ReactNode;
  items: unknown[];
  tone: 'success' | 'warning' | 'danger';
  emptyMessage: string;
}) {
  const toneStyles = {
    success: {
      badge: 'bg-success text-white',
      border: 'border-success/30',
      bg: 'bg-success-light/50',
    },
    warning: {
      badge: 'bg-warning text-white',
      border: 'border-warning/30',
      bg: 'bg-warning-light/50',
    },
    danger: {
      badge: 'bg-error text-white',
      border: 'border-error/30',
      bg: 'bg-error-light/50',
    },
  };

  const styles = toneStyles[tone];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold flex items-center gap-1', styles.badge)}>
          {icon}
          {label}
        </span>
        <span className="text-xs text-text-muted">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((med, idx) => (
            <li
              key={`med-${label}-${idx}`}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm text-text-primary',
                styles.border,
                styles.bg
              )}
            >
              {formatMedicationDisplay(med)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-muted italic">{emptyMessage}</p>
      )}
    </div>
  );
}
