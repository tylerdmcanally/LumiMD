'use client';

import * as React from 'react';
import Link from 'next/link';
import {
    Users,
    AlertCircle,
    ArrowRight,
    Loader2,
    CheckCircle,
    XCircle,
    Clock,
    Pill,
    ClipboardList,
    Calendar,
    ChevronRight,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCareOverview, CarePatientOverview } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

// =============================================================================
// Alert Item Component
// =============================================================================

function AlertItem({
    alert,
    patientName,
    patientId,
}: {
    alert: { message: string; priority: 'high' | 'medium' | 'low' };
    patientName: string;
    patientId: string;
}) {
    const isHigh = alert.priority === 'high';

    return (
        <Link
            href={`/care/${patientId}`}
            className={cn(
                'flex items-start gap-3 p-3 rounded-lg transition-colors',
                isHigh
                    ? 'bg-error/10 hover:bg-error/15'
                    : 'bg-warning/10 hover:bg-warning/15'
            )}
        >
            <AlertCircle
                className={cn(
                    'h-5 w-5 shrink-0 mt-0.5',
                    isHigh ? 'text-error' : 'text-warning'
                )}
            />
            <div className="flex-1 min-w-0">
                <p className="font-medium text-text-primary truncate">{patientName}</p>
                <p className="text-sm text-text-secondary">{alert.message}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-text-muted shrink-0" />
        </Link>
    );
}

// =============================================================================
// Needs Attention Panel (Right sidebar on desktop)
// =============================================================================

function NeedsAttentionPanel({ patients }: { patients: CarePatientOverview[] }) {
    const allAlerts = patients.flatMap((patient) =>
        patient.alerts
            .filter((a) => a.priority === 'high' || a.priority === 'medium')
            .map((alert) => ({
                ...alert,
                patientName: patient.name,
                patientId: patient.userId,
            }))
    );

    const highPriorityCount = allAlerts.filter((a) => a.priority === 'high').length;

    return (
        <Card variant="elevated" padding="none" className="h-fit">
            <div className="p-4 border-b border-border-light">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-text-primary flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-warning" />
                        Needs Attention
                    </h2>
                    {highPriorityCount > 0 && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-error text-white rounded-full">
                            {highPriorityCount} urgent
                        </span>
                    )}
                </div>
            </div>

            <div className="p-3">
                {allAlerts.length === 0 ? (
                    <div className="flex items-center gap-3 p-3 text-success">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">All clear! No urgent items.</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {allAlerts.slice(0, 5).map((alert, idx) => (
                            <AlertItem
                                key={idx}
                                alert={alert}
                                patientName={alert.patientName}
                                patientId={alert.patientId}
                            />
                        ))}
                        {allAlerts.length > 5 && (
                            <p className="text-sm text-text-muted text-center pt-2">
                                + {allAlerts.length - 5} more alerts
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}

// =============================================================================
// Patient Card Component (Compact, information-dense)
// =============================================================================

function PatientCard({ patient }: { patient: CarePatientOverview }) {
    const { medicationsToday, pendingActions, alerts } = patient;
    const hasHighPriorityAlerts = alerts.some((a) => a.priority === 'high');

    const medProgress =
        medicationsToday.total > 0
            ? Math.round((medicationsToday.taken / medicationsToday.total) * 100)
            : 0;

    return (
        <Card
            variant="elevated"
            padding="none"
            className={cn(
                'relative overflow-hidden transition-shadow hover:shadow-lg',
                hasHighPriorityAlerts && 'ring-2 ring-error/50'
            )}
        >
            {hasHighPriorityAlerts && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-error" />
            )}

            {/* Header */}
            <div className="p-4 pb-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary-pale text-brand-primary text-lg font-semibold shrink-0">
                        {patient.name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-text-primary truncate">
                            {patient.name || 'Unknown'}
                        </h3>
                        <p className="text-sm text-text-muted truncate">
                            {patient.email || 'Shared with you'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="px-4 pb-3">
                <div className="grid grid-cols-3 gap-2">
                    {/* Medications */}
                    <div className="bg-background-subtle rounded-lg p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <Pill className="h-4 w-4 text-brand-primary" />
                        </div>
                        <p className="text-lg font-semibold text-text-primary">
                            {medicationsToday.taken}/{medicationsToday.total}
                        </p>
                        <p className="text-xs text-text-muted">Meds Today</p>
                    </div>

                    {/* Actions */}
                    <div className="bg-background-subtle rounded-lg p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <ClipboardList className="h-4 w-4 text-warning" />
                        </div>
                        <p className={cn(
                            'text-lg font-semibold',
                            pendingActions > 0 ? 'text-warning' : 'text-text-primary'
                        )}>
                            {pendingActions}
                        </p>
                        <p className="text-xs text-text-muted">Actions</p>
                    </div>

                    {/* Alerts */}
                    <div className="bg-background-subtle rounded-lg p-2.5 text-center">
                        <div className="flex items-center justify-center gap-1 mb-1">
                            <AlertCircle className="h-4 w-4 text-error" />
                        </div>
                        <p className={cn(
                            'text-lg font-semibold',
                            alerts.length > 0 ? 'text-error' : 'text-success'
                        )}>
                            {alerts.length}
                        </p>
                        <p className="text-xs text-text-muted">Alerts</p>
                    </div>
                </div>
            </div>

            {/* Medication Progress Bar */}
            <div className="px-4 pb-3">
                <div className="flex items-center gap-2 text-xs mb-1.5">
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
                <div className="h-1.5 bg-background-subtle rounded-full overflow-hidden">
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
            </div>

            {/* Action Buttons */}
            <div className="border-t border-border-light p-3 flex gap-2">
                <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    asChild
                >
                    <Link href={`/care/${patient.userId}/medications`} className="flex items-center justify-center gap-1.5">
                        <Pill className="h-4 w-4 shrink-0" />
                        <span>Medications</span>
                    </Link>
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    asChild
                >
                    <Link href={`/care/${patient.userId}/actions`} className="flex items-center justify-center gap-1.5">
                        <ClipboardList className="h-4 w-4 shrink-0" />
                        <span>Actions</span>
                    </Link>
                </Button>
                <Button
                    variant="primary"
                    size="sm"
                    className="px-3"
                    asChild
                >
                    <Link href={`/care/${patient.userId}`} className="flex items-center justify-center">
                        <ArrowRight className="h-4 w-4" />
                    </Link>
                </Button>
            </div>
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
            <PageContainer maxWidth="xl">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                </div>
            </PageContainer>
        );
    }

    if (error) {
        return (
            <PageContainer maxWidth="xl">
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
        <PageContainer maxWidth="xl">
            {/* Header */}
            <div className="mb-6">
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
                </Card>
            ) : (
                /* Two-column desktop layout */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Patient Cards (2/3 width on desktop) */}
                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                            <Users className="h-5 w-5 text-brand-primary" />
                            Family Members
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {patients.map((patient) => (
                                <PatientCard key={patient.userId} patient={patient} />
                            ))}
                        </div>
                    </div>

                    {/* Right: Needs Attention Panel (1/3 width on desktop) */}
                    <div className="lg:col-span-1">
                        <div className="lg:sticky lg:top-24">
                            <NeedsAttentionPanel patients={patients} />
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
