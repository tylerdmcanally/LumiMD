'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Stethoscope,
  Calendar,
  ChevronRight,
  Users,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCareVisits } from '@/lib/api/hooks';

type ProviderInfo = {
  name: string;
  specialty: string | null;
  visitCount: number;
  lastVisitDate: Date | null;
  visitIds: string[];
};

export default function ProvidersPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const patientId = params.patientId;

  const { data: visits, isLoading, error } = useCareVisits(patientId);

  // Extract and aggregate providers from visits
  const providers = React.useMemo(() => {
    if (!visits) return [];

    const providerMap = new Map<string, ProviderInfo>();

    visits.forEach((visit: any) => {
      const providerName = visit.provider?.trim();
      if (!providerName) return;

      const visitDate = visit.visitDate || visit.createdAt;
      const parsedDate = visitDate ? new Date(visitDate) : null;
      const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

      const existing = providerMap.get(providerName);
      if (existing) {
        existing.visitCount += 1;
        existing.visitIds.push(visit.id);
        // Update specialty if we have one and existing doesn't
        if (!existing.specialty && visit.specialty?.trim()) {
          existing.specialty = visit.specialty.trim();
        }
        // Update last visit date if this one is more recent
        if (validDate && (!existing.lastVisitDate || validDate > existing.lastVisitDate)) {
          existing.lastVisitDate = validDate;
        }
      } else {
        providerMap.set(providerName, {
          name: providerName,
          specialty: visit.specialty?.trim() || null,
          visitCount: 1,
          lastVisitDate: validDate,
          visitIds: [visit.id],
        });
      }
    });

    // Sort by last visit date (most recent first)
    return Array.from(providerMap.values()).sort((a, b) => {
      if (!a.lastVisitDate && !b.lastVisitDate) return a.name.localeCompare(b.name);
      if (!a.lastVisitDate) return 1;
      if (!b.lastVisitDate) return -1;
      return b.lastVisitDate.getTime() - a.lastVisitDate.getTime();
    });
  }, [visits]);

  // Group providers by specialty
  const providersBySpecialty = React.useMemo(() => {
    const groups = new Map<string, ProviderInfo[]>();
    
    providers.forEach((provider) => {
      const specialty = provider.specialty || 'Other';
      const existing = groups.get(specialty) || [];
      existing.push(provider);
      groups.set(specialty, existing);
    });

    // Sort groups alphabetically, but put "Other" at the end
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
  }, [providers]);

  const handleProviderClick = (providerName: string) => {
    // Navigate to visits page with provider filter
    const encodedProvider = encodeURIComponent(providerName);
    router.push(`/care/${patientId}/visits?provider=${encodedProvider}`);
  };

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
          <p className="text-sm text-text-secondary">Loading providers...</p>
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
            Unable to load providers
          </h2>
          <p className="text-text-secondary mb-4">
            {error.message || 'An error occurred while loading provider information.'}
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

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/care/${patientId}`} className="flex items-center text-text-secondary hover:text-brand-primary">
            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
            <span>Back to Overview</span>
          </Link>
        </Button>

        {/* Header */}
        <PageHeader
          title="Care Team"
          subtitle={`${providers.length} provider${providers.length !== 1 ? 's' : ''} across ${providersBySpecialty.length} specialt${providersBySpecialty.length !== 1 ? 'ies' : 'y'}`}
        />

        {/* Empty State */}
        {providers.length === 0 ? (
          <Card variant="elevated" padding="lg" className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background-subtle mx-auto mb-4">
              <Users className="h-8 w-8 text-text-muted" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              No providers yet
            </h2>
            <p className="text-text-secondary max-w-sm mx-auto">
              Provider information will appear here once visits are recorded with provider details.
            </p>
          </Card>
        ) : (
          <div className="space-y-8">
            {providersBySpecialty.map(([specialty, specialtyProviders]) => (
              <section key={specialty}>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Stethoscope className="h-4 w-4" />
                  {specialty}
                  <span className="text-text-tertiary font-normal">
                    ({specialtyProviders.length})
                  </span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {specialtyProviders.map((provider) => (
                    <ProviderCard
                      key={provider.name}
                      provider={provider}
                      onClick={() => handleProviderClick(provider.name)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}

function ProviderCard({
  provider,
  onClick,
}: {
  provider: ProviderInfo;
  onClick: () => void;
}) {
  const lastVisitFormatted = provider.lastVisitDate
    ? format(provider.lastVisitDate, 'MMM d, yyyy')
    : 'Unknown';

  return (
    <button
      onClick={onClick}
      className="w-full text-left group"
    >
      <Card
        variant="elevated"
        padding="md"
        className="h-full transition-all duration-200 hover:shadow-lg hover:border-brand-primary/30 group-focus-visible:ring-2 group-focus-visible:ring-brand-primary/40"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-text-primary group-hover:text-brand-primary transition-colors truncate">
              {provider.name}
            </h3>
            {provider.specialty && (
              <p className="text-sm text-text-secondary truncate">
                {provider.specialty}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <Stethoscope className="h-3 w-3" />
                {provider.visitCount} visit{provider.visitCount !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Last: {lastVisitFormatted}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-background-subtle group-hover:bg-hover transition-colors shrink-0">
            <ChevronRight className="h-4 w-4 text-text-muted group-hover:text-brand-primary transition-colors" />
          </div>
        </div>
      </Card>
    </button>
  );
}
