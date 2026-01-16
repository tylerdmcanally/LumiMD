'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    Pill,
    CheckSquare,
    Stethoscope,
    CheckCircle,
    XCircle,
    Clock,
    AlertTriangle,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePatientMedicationStatus } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

// =============================================================================
// Medication Status Card
// =============================================================================

function MedicationStatusCard({
    schedule,
    summary,
}: {
    schedule: Array<{
        medicationId: string;
        medicationName: string;
        dose?: string;
        scheduledTime: string;
        status: 'taken' | 'skipped' | 'pending' | 'missed';
        actionAt?: string;
    }>;
    summary: {
        total: number;
        taken: number;
        skipped: number;
        pending: number;
        missed: number;
    };
}) {
    const statusIcon = {
        taken: <CheckCircle className="h-4 w-4 text-success" />,
        skipped: <XCircle className="h-4 w-4 text-text-muted" />,
        pending: <Clock className="h-4 w-4 text-text-muted" />,
        missed: <AlertTriangle className="h-4 w-4 text-error" />,
    };

    const statusText = {
        taken: 'Taken',
        skipped: 'Skipped',
        pending: 'Pending',
        missed: 'Missed',
    };

    if (schedule.length === 0) {
        return (
            <Card variant="elevated" padding="md">
                <p className="text-text-muted text-sm">No medications scheduled for today.</p>
            </Card>
        );
    }

    return (
        <Card variant="elevated" padding="md">
            {/* Summary Header */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-border-light">
                <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                        <CheckCircle className="h-4 w-4 text-success" />
                        {summary.taken} taken
                    </span>
                    {summary.missed > 0 && (
                        <span className="flex items-center gap-1 text-error font-medium">
                            <AlertTriangle className="h-4 w-4" />
                            {summary.missed} missed
                        </span>
                    )}
                    {summary.pending > 0 && (
                        <span className="flex items-center gap-1 text-text-muted">
                            <Clock className="h-4 w-4" />
                            {summary.pending} pending
                        </span>
                    )}
                </div>
                <span className="text-sm font-medium text-text-primary">
                    {summary.taken}/{summary.total}
                </span>
            </div>

            {/* Medication List */}
            <ul className="space-y-3">
                {schedule.map((item, idx) => (
                    <li
                        key={idx}
                        className={cn(
                            'flex items-center justify-between p-3 rounded-lg',
                            item.status === 'missed' && 'bg-error-light',
                            item.status === 'taken' && 'bg-success-light',
                            item.status === 'pending' && 'bg-background-subtle',
                            item.status === 'skipped' && 'bg-background-subtle'
                        )}
                    >
                        <div className="flex items-center gap-3">
                            {statusIcon[item.status]}
                            <div>
                                <p className="font-medium text-text-primary">{item.medicationName}</p>
                                {item.dose && (
                                    <p className="text-xs text-text-muted">{item.dose}</p>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-medium text-text-primary">{item.scheduledTime}</p>
                            <p
                                className={cn(
                                    'text-xs',
                                    item.status === 'missed' && 'text-error',
                                    item.status === 'taken' && 'text-success',
                                    item.status === 'pending' && 'text-text-muted',
                                    item.status === 'skipped' && 'text-text-muted'
                                )}
                            >
                                {statusText[item.status]}
                            </p>
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

// =============================================================================
// Patient Detail Page
// =============================================================================

export default function PatientDetailPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const {
        data: medStatus,
        isLoading,
        error,
    } = usePatientMedicationStatus(patientId);

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
                        Unable to load patient data
                    </h2>
                    <p className="text-text-secondary mb-4">
                        {error.message || 'An error occurred while loading this patient.'}
                    </p>
                    <Button variant="secondary" asChild>
                        <Link href="/care" className="flex items-center">
                            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
                            <span>Back to Dashboard</span>
                        </Link>
                    </Button>
                </Card>
            </PageContainer>
        );
    }

    return (
        <PageContainer maxWidth="lg">
            {/* Back Button */}
            <Button variant="ghost" size="sm" className="mb-4" asChild>
                <Link href="/care" className="flex items-center">
                    <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
                    <span>Back to Care Dashboard</span>
                </Link>
            </Button>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                    Patient Details
                </h1>
                <p className="text-text-secondary mt-1">
                    Viewing health information for today ({medStatus?.date})
                </p>
            </div>

            {/* Medication Status */}
            <section className="mb-8">
                <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                    <Pill className="h-5 w-5 text-brand-primary" />
                    Today's Medications
                </h2>
                {medStatus && (
                    <MedicationStatusCard
                        schedule={medStatus.schedule}
                        summary={medStatus.summary}
                    />
                )}
            </section>

            {/* Quick Actions - Links to other views */}
            <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card variant="elevated" padding="md" className="hover:shadow-lg transition-shadow">
                    <Link href={`/care/${patientId}/visits`} className="block">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
                                <Stethoscope className="h-5 w-5" />
                            </div>
                            <span className="font-medium text-text-primary">Visits</span>
                        </div>
                        <p className="text-sm text-text-muted">View past visit summaries</p>
                    </Link>
                </Card>

                <Card variant="elevated" padding="md" className="hover:shadow-lg transition-shadow">
                    <Link href={`/care/${patientId}/medications`} className="block">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
                                <Pill className="h-5 w-5" />
                            </div>
                            <span className="font-medium text-text-primary">Medications</span>
                        </div>
                        <p className="text-sm text-text-muted">Active medication list</p>
                    </Link>
                </Card>

                <Card variant="elevated" padding="md" className="hover:shadow-lg transition-shadow">
                    <Link href={`/care/${patientId}/actions`} className="block">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
                                <CheckSquare className="h-5 w-5" />
                            </div>
                            <span className="font-medium text-text-primary">Actions</span>
                        </div>
                        <p className="text-sm text-text-muted">Pending action items</p>
                    </Link>
                </Card>
            </section>
        </PageContainer>
    );
}
