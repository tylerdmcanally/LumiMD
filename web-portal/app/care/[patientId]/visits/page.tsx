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
  MapPin,
  ChevronRight,
  Stethoscope,
  Clock,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCareVisits } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

type VisitStatus = 'completed' | 'processing' | 'pending';

function getVisitStatus(visit: any): VisitStatus {
  if (visit.processingStatus === 'completed' || visit.status === 'completed') {
    return 'completed';
  }
  if (visit.processingStatus === 'processing' || visit.status === 'processing') {
    return 'processing';
  }
  return 'pending';
}

const STATUS_CONFIG: Record<VisitStatus, {
  label: string;
  tone: 'success' | 'warning' | 'neutral';
  icon: React.ReactNode;
}> = {
  completed: {
    label: 'Completed',
    tone: 'success',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  processing: {
    label: 'Processing',
    tone: 'warning',
    icon: <Clock className="h-3 w-3" />,
  },
  pending: {
    label: 'Pending',
    tone: 'neutral',
    icon: <Clock className="h-3 w-3" />,
  },
};

export default function PatientVisitsPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;

  const { data: visits, isLoading, error } = useCareVisits(patientId);

  // Separate visits by status
  const { completedVisits, processingVisits } = React.useMemo(() => {
    if (!visits) return { completedVisits: [], processingVisits: [] };
    
    const completed = visits.filter(
      (v) => v.processingStatus === 'completed' || v.status === 'completed'
    );
    const processing = visits.filter(
      (v) => !(v.processingStatus === 'completed' || v.status === 'completed')
    );

    // Sort by date descending
    const sortByDate = (a: any, b: any) => {
      const aDate = new Date(a.visitDate || a.createdAt || 0).getTime();
      const bDate = new Date(b.visitDate || b.createdAt || 0).getTime();
      return bDate - aDate;
    };

    return {
      completedVisits: completed.sort(sortByDate),
      processingVisits: processing.sort(sortByDate),
    };
  }, [visits]);

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
          <p className="text-sm text-text-secondary">Loading visit history...</p>
        </div>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Unable to load visits
          </h2>
          <p className="text-text-secondary mb-4">
            {error.message || 'An error occurred while loading visits.'}
          </p>
          <Button variant="secondary" asChild>
            <Link href={`/care/${patientId}`} className="flex items-center">
              <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
              <span>Back to Overview</span>
            </Link>
          </Button>
        </Card>
      </PageContainer>
    );
  }

  const totalVisits = visits?.length ?? 0;

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-8">
        {/* Back Button */}
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/care/${patientId}`} className="flex items-center text-brand-primary hover:text-brand-primary-dark">
            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
            <span>Back to Overview</span>
          </Link>
        </Button>

        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
            Visit History
          </h1>
          <p className="text-text-secondary">
            {totalVisits} visit{totalVisits !== 1 ? 's' : ''} recorded
          </p>
        </header>

        {/* Stats Cards */}
        {totalVisits > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Visits"
              value={totalVisits}
              icon={<FileText className="h-5 w-5 text-brand-primary" />}
            />
            <StatCard
              label="Completed"
              value={completedVisits.length}
              icon={<CheckCircle2 className="h-5 w-5 text-success" />}
              variant="success"
            />
            <StatCard
              label="Processing"
              value={processingVisits.length}
              icon={<Clock className="h-5 w-5 text-warning" />}
              variant="warning"
            />
          </div>
        )}

        {/* Empty State */}
        {totalVisits === 0 ? (
          <Card variant="elevated" padding="lg" className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-pale mx-auto mb-4">
              <Stethoscope className="h-8 w-8 text-brand-primary" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              No visits yet
            </h2>
            <p className="text-text-secondary max-w-sm mx-auto">
              Visit summaries will appear here once the patient records and processes their medical visits.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Processing Visits Section */}
            {processingVisits.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-warning" />
                  Processing ({processingVisits.length})
                </h2>
                <div className="space-y-3">
                  {processingVisits.map((visit) => (
                    <ProcessingVisitCard key={visit.id} visit={visit} />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Visits Section */}
            {completedVisits.length > 0 && (
              <section>
                {processingVisits.length > 0 && (
                  <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Completed ({completedVisits.length})
                  </h2>
                )}
                <div className="space-y-3">
                  {completedVisits.map((visit) => (
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      patientId={patientId}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function StatCard({
  label,
  value,
  icon,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'neutral' | 'success' | 'warning';
}) {
  const variantStyles = {
    neutral: 'border-l-brand-primary',
    success: 'border-l-success',
    warning: 'border-l-warning',
  };

  return (
    <Card variant="flat" padding="md" className={cn('border-l-4', variantStyles[variant])}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background-subtle">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-text-secondary">{label}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function ProcessingVisitCard({ visit }: { visit: any }) {
  const visitDate = visit.visitDate || visit.createdAt;
  const formattedDate = visitDate
    ? format(new Date(visitDate), 'MMMM d, yyyy')
    : 'Date unknown';

  return (
    <Card variant="elevated" padding="md" className="opacity-80 border-l-4 border-l-warning">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-light">
          <Loader2 className="h-5 w-5 animate-spin text-warning" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone="warning" variant="soft" size="sm">
              Processing
            </Badge>
          </div>
          <p className="text-sm text-text-secondary">
            Visit from {formattedDate} is being processed
          </p>
          {visit.provider && (
            <p className="text-xs text-text-muted mt-1">
              {visit.provider}
              {visit.specialty && ` • ${visit.specialty}`}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function VisitCard({ visit, patientId }: { visit: any; patientId: string }) {
  const visitDate = visit.visitDate || visit.createdAt;
  const formattedDate = visitDate
    ? format(new Date(visitDate), 'EEEE, MMMM d, yyyy')
    : null;
  const formattedShortDate = visitDate
    ? format(new Date(visitDate), 'MMM d, yyyy')
    : null;

  const status = getVisitStatus(visit);
  const statusConfig = STATUS_CONFIG[status];

  const providerName = visit.provider || 'Unknown Provider';
  const specialty = visit.specialty || null;
  const location = visit.location || null;
  const summary = visit.summary || null;
  const diagnoses = Array.isArray(visit.diagnoses) ? visit.diagnoses.filter(Boolean) : [];

  return (
    <Link href={`/care/${patientId}/visits/${visit.id}`} className="block group">
      <Card
        variant="elevated"
        padding="none"
        className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-brand-primary/30 group-focus-visible:ring-2 group-focus-visible:ring-brand-primary/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            {/* Main Content */}
            <div className="flex-1 min-w-0 space-y-3">
              {/* Date & Status */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-sm text-text-muted">
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">{formattedDate || 'Date not recorded'}</span>
                  <span className="sm:hidden">{formattedShortDate || 'No date'}</span>
                </div>
                <Badge tone={statusConfig.tone} variant="soft" size="sm" className="gap-1">
                  {statusConfig.icon}
                  {statusConfig.label}
                </Badge>
              </div>

              {/* Provider & Specialty */}
              <div>
                <h3 className="font-semibold text-text-primary text-lg group-hover:text-brand-primary transition-colors">
                  {providerName}
                </h3>
                {specialty && (
                  <p className="text-sm text-text-secondary">{specialty}</p>
                )}
              </div>

              {/* Location */}
              {location && (
                <div className="flex items-center gap-1.5 text-sm text-text-muted">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{location}</span>
                </div>
              )}

              {/* Summary Preview */}
              {summary && (
                <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
                  {summary}
                </p>
              )}

              {/* Diagnoses Tags */}
              {diagnoses.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {diagnoses.slice(0, 3).map((diagnosis: unknown, idx: number) => (
                    <span
                      key={`${visit.id}-dx-${idx}`}
                      className="text-xs px-2.5 py-1 rounded-full bg-brand-primary-pale text-brand-primary font-medium"
                    >
                      {String(diagnosis)}
                    </span>
                  ))}
                  {diagnoses.length > 3 && (
                    <span className="text-xs text-text-muted px-2 py-1">
                      +{diagnoses.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-background-subtle group-hover:bg-brand-primary-pale transition-colors shrink-0">
              <ChevronRight className="h-5 w-5 text-text-muted group-hover:text-brand-primary transition-colors" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
