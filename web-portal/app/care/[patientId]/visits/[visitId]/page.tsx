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

export default function CareVisitDetailPage() {
  const params = useParams<{ patientId: string; visitId: string }>();
  const patientId = params.patientId;
  const visitId = params.visitId;

  const { data: visit, isLoading, error, refetch } = useCareVisitSummary(patientId, visitId);
  const { data: allVisits } = useCareVisits(patientId);
  const updateVisitMetadata = useUpdateVisitMetadata();

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
      toast.success('Visit details updated');
      setEditDialogOpen(false);
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
  const diagnoses = Array.isArray(visit.diagnoses) ? visit.diagnoses.filter(Boolean) : [];

  // Parse next steps
  const nextSteps = Array.isArray(visit.nextSteps) ? visit.nextSteps.filter(Boolean) : [];

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
            <Link href={`/care/${patientId}/visits`} className="flex items-center text-brand-primary hover:text-brand-primary-dark">
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
            icon={<Calendar className="h-4 w-4 text-brand-primary" />}
            label="Visit Date"
            value={formattedDate || 'Not recorded'}
            onEdit={handleOpenEdit}
          />
          <HighlightCard
            icon={<Stethoscope className="h-4 w-4 text-brand-primary" />}
            label="Provider"
            value={visit.provider || 'Not recorded'}
            onEdit={handleOpenEdit}
          />
          <HighlightCard
            icon={<Sparkles className="h-4 w-4 text-brand-primary" />}
            label="Specialty"
            value={visit.specialty || 'Not recorded'}
            onEdit={handleOpenEdit}
          />
          <HighlightCard
            icon={<MapPin className="h-4 w-4 text-brand-primary" />}
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
                <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-primary shadow-sm">
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
              {nextSteps.length > 0 ? (
                <ul className="space-y-3">
                  {nextSteps.map((step, idx) => (
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
            </div>
          </Card>

          {/* Diagnoses */}
          <Card variant="elevated" padding="none" className="overflow-hidden">
            <div className="border-b border-border-light bg-background-subtle/50 px-5 py-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-brand-primary" />
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

  const formatMedication = (med: unknown): string => {
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
              {formatMedication(med)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-muted italic">{emptyMessage}</p>
      )}
    </div>
  );
}
