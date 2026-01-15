'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    Calendar,
    MapPin,
    User,
    ChevronRight,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useVisits } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

export default function PatientVisitsPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const { data: visits, isLoading, error } = useVisits(patientId);

    if (isLoading) {
        return (
            <PageContainer maxWidth="lg">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
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
                        <Link href={`/care/${patientId}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Overview
                        </Link>
                    </Button>
                </Card>
            </PageContainer>
        );
    }

    const processedVisits = visits?.filter((v) => v.status === 'processed') ?? [];
    const pendingVisits = visits?.filter((v) => v.status !== 'processed') ?? [];

    return (
        <PageContainer maxWidth="lg">
            {/* Back Button */}
            <Button variant="ghost" size="sm" className="mb-4" asChild>
                <Link href={`/care/${patientId}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Overview
                </Link>
            </Button>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                    Visit History
                </h1>
                <p className="text-text-secondary mt-1">
                    {visits?.length ?? 0} visit{(visits?.length ?? 0) !== 1 ? 's' : ''} recorded
                </p>
            </div>

            {visits?.length === 0 ? (
                <Card variant="elevated" padding="lg" className="text-center py-12">
                    <Calendar className="h-12 w-12 text-text-muted mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        No visits yet
                    </h2>
                    <p className="text-text-secondary">
                        Visit summaries will appear here once recorded.
                    </p>
                </Card>
            ) : (
                <div className="space-y-4">
                    {/* Pending Visits */}
                    {pendingVisits.length > 0 && (
                        <section className="mb-6">
                            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">
                                Processing
                            </h2>
                            <div className="space-y-3">
                                {pendingVisits.map((visit) => (
                                    <Card key={visit.id} variant="elevated" padding="md" className="opacity-70">
                                        <div className="flex items-center gap-3">
                                            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                                            <span className="text-text-secondary">
                                                Processing visit from{' '}
                                                {visit.visitDate
                                                    ? new Date(visit.visitDate).toLocaleDateString()
                                                    : 'unknown date'}
                                            </span>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Processed Visits */}
                    {processedVisits.map((visit) => (
                        <Card
                            key={visit.id}
                            variant="elevated"
                            padding="md"
                            className="hover:shadow-lg transition-shadow"
                        >
                            <Link href={`/care/${patientId}/visits/${visit.id}`} className="block">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        {/* Visit Date */}
                                        <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
                                            <Calendar className="h-4 w-4" />
                                            {visit.visitDate
                                                ? new Date(visit.visitDate).toLocaleDateString('en-US', {
                                                    weekday: 'long',
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric',
                                                })
                                                : 'Date not recorded'}
                                        </div>

                                        {/* Provider & Specialty */}
                                        <h3 className="font-semibold text-text-primary mb-1">
                                            {visit.provider || 'Unknown Provider'}
                                            {visit.specialty && (
                                                <span className="text-text-secondary font-normal">
                                                    {' '}
                                                    • {visit.specialty}
                                                </span>
                                            )}
                                        </h3>

                                        {/* Location */}
                                        {visit.location && (
                                            <div className="flex items-center gap-1 text-sm text-text-muted mb-2">
                                                <MapPin className="h-3 w-3" />
                                                {visit.location}
                                            </div>
                                        )}

                                        {/* Summary Preview */}
                                        {visit.summary && (
                                            <p className="text-sm text-text-secondary line-clamp-2 mt-2">
                                                {visit.summary}
                                            </p>
                                        )}

                                        {/* Diagnoses */}
                                        {visit.diagnoses && visit.diagnoses.length > 0 && (
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {visit.diagnoses.slice(0, 3).map((diagnosis, idx) => (
                                                    <span
                                                        key={idx}
                                                        className="text-xs px-2 py-1 rounded-full bg-brand-primary-pale text-brand-primary"
                                                    >
                                                        {diagnosis}
                                                    </span>
                                                ))}
                                                {visit.diagnoses.length > 3 && (
                                                    <span className="text-xs text-text-muted">
                                                        +{visit.diagnoses.length - 3} more
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <ChevronRight className="h-5 w-5 text-text-muted shrink-0 ml-4" />
                                </div>
                            </Link>
                        </Card>
                    ))}
                </div>
            )}
        </PageContainer>
    );
}
