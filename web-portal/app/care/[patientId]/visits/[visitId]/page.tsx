\'use client\';

import * as React from \'react\';
import Link from \'next/link\';
import { useParams } from \'next/navigation\';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Calendar,
  Stethoscope,
  Pill,
  ClipboardList,
} from \'lucide-react\';
import { PageContainer } from \'@/components/layout/PageContainer\';
import { Card } from \'@/components/ui/card\';
import { Button } from \'@/components/ui/button\';
import { useCareVisitSummary } from \'@/lib/api/hooks\';
import { cn } from \'@/lib/utils\';

export default function CareVisitDetailPage() {
  const params = useParams<{ patientId: string; visitId: string }>();
  const patientId = params.patientId;
  const visitId = params.visitId;

  const { data: visit, isLoading, error } = useCareVisitSummary(patientId, visitId);

  if (isLoading) {
    return (
      <PageContainer maxWidth="lg">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
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
            {error?.message || \'An error occurred while loading this visit.\'}
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

  return (
    <PageContainer maxWidth="lg">
      <Button variant="ghost" size="sm" className="mb-4" asChild>
        <Link href={`/care/${patientId}/visits`} className="flex items-center">
          <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
          <span>Back to Visits</span>
        </Link>
      </Button>

      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
          Visit Summary
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-muted">
          <div className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {visit.visitDate
              ? new Date(visit.visitDate).toLocaleDateString()
              : \'Date not recorded\'}
          </div>
          <div className="flex items-center gap-1">
            <Stethoscope className="h-4 w-4" />
            {visit.provider || \'Unknown Provider\'}
          </div>
        </div>
      </div>

      <section className="grid gap-6">
        <Card variant="elevated" padding="md">
          <h2 className="text-lg font-semibold text-text-primary mb-2 flex items-center gap-2">
            <Stethoscope className="h-5 w-5 text-brand-primary" />
            Summary
          </h2>
          <p className={cn(
            \'text-sm leading-relaxed\',
            visit.summary ? \'text-text-secondary\' : \'text-text-muted\'
          )}>
            {visit.summary || \'Summary is still processing.\'}
          </p>
        </Card>

        <Card variant="elevated" padding="md">
          <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-warning" />
            Next Steps
          </h2>
          {visit.nextSteps?.length ? (
            <ul className="space-y-2 text-sm text-text-secondary">
              {visit.nextSteps.map((step, idx) => (
                <li key={`${idx}-${step}`} className="flex gap-2">
                  <span className="text-text-muted">•</span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">No next steps recorded.</p>
          )}
        </Card>

        <Card variant="elevated" padding="md">
          <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Pill className="h-5 w-5 text-success" />
            Medications
          </h2>
          {visit.medications ? (
            <div className="space-y-3 text-sm text-text-secondary">
              {Object.entries(visit.medications).map(([section, meds]) => (
                <div key={section}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">
                    {section}
                  </p>
                  {Array.isArray(meds) && meds.length > 0 ? (
                    <ul className="space-y-1">
                      {meds.map((med, idx) => (
                        <li key={`${section}-${idx}`}>• {typeof med === \'string\' ? med : (med as any)?.name || \'Medication\'}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-muted">None</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">No medications recorded.</p>
          )}
        </Card>
      </section>
    </PageContainer>
  );
}
