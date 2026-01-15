'use client';

import * as React from 'react';
import Link from 'next/link';
import { Users, AlertCircle, Activity, ArrowRight, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCareOverview, CarePatientOverview } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

// =============================================================================
// PatientOverviewCard Component
// =============================================================================

function PatientOverviewCard({ patient }: { patient: CarePatientOverview }) {
    const { medicationsToday, pendingActions, alerts } = patient;
    const hasHighPriorityAlerts = alerts.some((a) => a.priority === 'high');

    const medProgress =
        medicationsToday.total > 0
            ? Math.round((medicationsToday.taken / medicationsToday.total) * 100)
            : 0;

    return (
        <Card
            variant="elevated"
            padding="md"
            className={cn(
                'relative overflow-hidden',
                hasHighPriorityAlerts && 'ring-2 ring-warning/50'
            )}
        >
            {hasHighPriorityAlerts && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-warning" />
            )}

            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-pale text-brand-primary text-lg font-semibold">
                        {patient.name?.charAt(0) || '?'}
                    </div>
                    <div>
                        <h3 className="font-semibold text-text-primary">
                            {patient.name || 'Unknown'}
                        </h3>
                        <p className="text-sm text-text-muted">
                            {patient.email?.split('@')[0] || 'Shared with you'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Medication Progress */}
            <div className="mb-4">
                <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-text-secondary">Today's Medications</span>
                    <span className="font-medium text-text-primary">
                        {medicationsToday.taken}/{medicationsToday.total}
                    </span>
                </div>
                <div className="h-2 bg-background-subtle rounded-full overflow-hidden">
                    <div
                        className={cn(
                            'h-full rounded-full transition-all',
                            medicationsToday.missed > 0
                                ? 'bg-error'
                                : medProgress === 100
                                    ? 'bg-success'
                                    : 'bg-brand-primary'
                        )}
                        style={{ width: `${medProgress}%` }}
                    />
                </div>
                {/* Status breakdown */}
                <div className="flex items-center gap-4 mt-2 text-xs">
                    {medicationsToday.taken > 0 && (
                        <span className="flex items-center gap-1 text-success">
                            <CheckCircle className="h-3 w-3" />
                            {medicationsToday.taken} taken
                        </span>
                    )}
                    {medicationsToday.missed > 0 && (
                        <span className="flex items-center gap-1 text-error">
                            <XCircle className="h-3 w-3" />
                            {medicationsToday.missed} missed
                        </span>
                    )}
                    {medicationsToday.pending > 0 && (
                        <span className="flex items-center gap-1 text-text-muted">
                            <Clock className="h-3 w-3" />
                            {medicationsToday.pending} pending
                        </span>
                    )}
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-background-subtle rounded-lg p-3">
                    <p className="text-xs text-text-muted mb-1">Pending Actions</p>
                    <p
                        className={cn(
                            'text-lg font-semibold',
                            pendingActions > 0 ? 'text-warning' : 'text-text-primary'
                        )}
                    >
                        {pendingActions}
                    </p>
                </div>
                <div className="bg-background-subtle rounded-lg p-3">
                    <p className="text-xs text-text-muted mb-1">Alerts</p>
                    <p
                        className={cn(
                            'text-lg font-semibold',
                            alerts.length > 0 ? 'text-error' : 'text-success'
                        )}
                    >
                        {alerts.length}
                    </p>
                </div>
            </div>

            <Button variant="secondary" size="sm" className="w-full" asChild>
                <Link href={`/care/${patient.userId}`}>
                    View Details
                    <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
            </Button>
        </Card>
    );
}

// =============================================================================
// NeedsAttentionList Component
// =============================================================================

function NeedsAttentionList({ patients }: { patients: CarePatientOverview[] }) {
    // Collect all high-priority alerts across patients
    const allAlerts = patients.flatMap((patient) =>
        patient.alerts
            .filter((a) => a.priority === 'high' || a.priority === 'medium')
            .map((alert) => ({
                ...alert,
                patientName: patient.name,
                patientId: patient.userId,
            }))
    );

    if (allAlerts.length === 0) {
        return (
            <Card variant="elevated" padding="md">
                <div className="flex items-center gap-3 text-success">
                    <CheckCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">No urgent items at this time</span>
                </div>
            </Card>
        );
    }

    return (
        <Card variant="elevated" padding="md" className="border-l-4 border-l-warning">
            <ul className="space-y-3">
                {allAlerts.map((alert, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                        <AlertCircle
                            className={cn(
                                'h-5 w-5 shrink-0 mt-0.5',
                                alert.priority === 'high' ? 'text-error' : 'text-warning'
                            )}
                        />
                        <div>
                            <Link
                                href={`/care/${alert.patientId}`}
                                className="font-medium text-text-primary hover:text-brand-primary"
                            >
                                {alert.patientName}
                            </Link>
                            <p className="text-sm text-text-secondary">{alert.message}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
}

// =============================================================================
// Main Care Dashboard Page
// =============================================================================

export default function CareDashboardPage() {
    const { data, isLoading, error } = useCareOverview();
    const patients = data?.patients ?? [];

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
                        Unable to load care dashboard
                    </h2>
                    <p className="text-text-secondary">
                        {error.message || 'An error occurred while loading your shared patients.'}
                    </p>
                </Card>
            </PageContainer>
        );
    }

    const hasPatients = patients.length > 0;

    return (
        <PageContainer maxWidth="lg">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                    Care Dashboard
                </h1>
                <p className="text-text-secondary mt-1">
                    {hasPatients
                        ? `Managing ${patients.length} family member${patients.length > 1 ? 's' : ''}`
                        : 'No shared patients yet'}
                </p>
            </div>

            {!hasPatients ? (
                /* Empty State */
                <Card variant="elevated" padding="lg" className="text-center py-12">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-pale mx-auto mb-4">
                        <Users className="h-8 w-8 text-brand-primary" />
                    </div>
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        No shared patients yet
                    </h2>
                    <p className="text-text-secondary mb-6 max-w-md mx-auto">
                        When someone shares their health information with you,
                        you'll see their care overview here.
                    </p>
                    <Button variant="primary" asChild>
                        <Link href="/dashboard">Go to My Health</Link>
                    </Button>
                </Card>
            ) : (
                <>
                    {/* Needs Attention Section */}
                    <section className="mb-8">
                        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-warning" />
                            Needs Attention
                        </h2>
                        <NeedsAttentionList patients={patients} />
                    </section>

                    {/* Patient Cards */}
                    <section className="mb-8">
                        <h2 className="text-lg font-semibold text-text-primary mb-4">
                            Family Members
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {patients.map((patient) => (
                                <PatientOverviewCard key={patient.userId} patient={patient} />
                            ))}
                        </div>
                    </section>

                    {/* Recent Activity - Placeholder for now */}
                    <section>
                        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                            <Activity className="h-5 w-5 text-brand-primary" />
                            Recent Activity
                        </h2>
                        <Card variant="elevated" padding="md">
                            <p className="text-text-muted text-sm">
                                Activity timeline coming in Phase 4.
                            </p>
                        </Card>
                    </section>
                </>
            )}
        </PageContainer>
    );
}
