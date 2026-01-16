'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    Pill,
    Calendar,
    Clock,
    AlertTriangle,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCareMedications } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

export default function PatientMedicationsPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const { data: medications, isLoading, error } = useCareMedications(patientId);

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
                        Unable to load medications
                    </h2>
                    <p className="text-text-secondary mb-4">
                        {error.message || 'An error occurred while loading medications.'}
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

    const activeMeds = medications?.filter((m) => m.active !== false) ?? [];
    const discontinuedMeds = medications?.filter((m) => m.active === false) ?? [];

    return (
        <PageContainer maxWidth="lg">
            {/* Back Button */}
            <Button variant="ghost" size="sm" className="mb-4" asChild>
                <Link href={`/care/${patientId}`} className="flex items-center">
                    <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
                    <span>Back to Overview</span>
                </Link>
            </Button>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                    Medications
                </h1>
                <p className="text-text-secondary mt-1">
                    {activeMeds.length} active medication{activeMeds.length !== 1 ? 's' : ''}
                </p>
            </div>

            {medications?.length === 0 ? (
                <Card variant="elevated" padding="lg" className="text-center py-12">
                    <Pill className="h-12 w-12 text-text-muted mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        No medications recorded
                    </h2>
                    <p className="text-text-secondary">
                        Medications from visit summaries will appear here.
                    </p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* Active Medications */}
                    {activeMeds.length > 0 && (
                        <section>
                            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">
                                Active Medications
                            </h2>
                            <div className="space-y-3">
                                {activeMeds.map((med) => (
                                    <Card key={med.id} variant="elevated" padding="md">
                                        <div className="flex items-start gap-4">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary shrink-0">
                                                <Pill className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-text-primary">
                                                    {med.name}
                                                </h3>
                                                {med.dose && (
                                                    <p className="text-sm text-text-secondary">
                                                        {med.dose}
                                                    </p>
                                                )}
                                                {med.frequency && (
                                                    <div className="flex items-center gap-1 text-sm text-text-muted mt-1">
                                                        <Clock className="h-3 w-3" />
                                                        {med.frequency}
                                                    </div>
                                                )}
                                                {med.startedAt && (
                                                    <div className="flex items-center gap-1 text-xs text-text-muted mt-2">
                                                        <Calendar className="h-3 w-3" />
                                                        Started{' '}
                                                        {new Date(med.startedAt).toLocaleDateString()}
                                                    </div>
                                                )}
                                                {med.notes && (
                                                    <p className="text-xs text-text-muted mt-2 italic">
                                                        {med.notes}
                                                    </p>
                                                )}
                                            </div>
                                            {med.source === 'visit' && (
                                                <span className="text-xs px-2 py-1 rounded-full bg-background-subtle text-text-muted shrink-0">
                                                    From visit
                                                </span>
                                            )}
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Discontinued Medications */}
                    {discontinuedMeds.length > 0 && (
                        <section>
                            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">
                                Discontinued
                            </h2>
                            <div className="space-y-3">
                                {discontinuedMeds.map((med) => (
                                    <Card
                                        key={med.id}
                                        variant="elevated"
                                        padding="md"
                                        className="opacity-60"
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-subtle text-text-muted shrink-0">
                                                <Pill className="h-5 w-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-text-secondary line-through">
                                                    {med.name}
                                                </h3>
                                                {med.dose && (
                                                    <p className="text-sm text-text-muted">
                                                        {med.dose}
                                                    </p>
                                                )}
                                                {med.stoppedAt && (
                                                    <div className="flex items-center gap-1 text-xs text-text-muted mt-2">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        Stopped{' '}
                                                        {new Date(med.stoppedAt).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </PageContainer>
    );
}
