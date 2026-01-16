'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
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
    Users,
    Activity,
    Heart,
    BarChart3,
    ChevronRight,
    Droplets,
    Scale,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePatientMedicationStatus, useCareQuickOverview } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

// =============================================================================
// Patient Detail Page
// =============================================================================

export default function PatientDetailPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const {
        data: medStatus,
        isLoading: medLoading,
        error: medError,
    } = usePatientMedicationStatus(patientId);

    const {
        data: quickOverview,
        isLoading: overviewLoading,
    } = useCareQuickOverview(patientId);

    const isLoading = medLoading || overviewLoading;

    if (isLoading) {
        return (
            <PageContainer maxWidth="2xl">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                </div>
            </PageContainer>
        );
    }

    if (medError) {
        return (
            <PageContainer maxWidth="lg">
                <Card variant="elevated" padding="lg" className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        Unable to load patient data
                    </h2>
                    <p className="text-text-secondary mb-4">
                        {medError.message || 'An error occurred while loading this patient.'}
                    </p>
                    <Button variant="secondary" asChild>
                        <Link href="/care" className="flex items-center gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            <span>Back to Dashboard</span>
                        </Link>
                    </Button>
                </Card>
            </PageContainer>
        );
    }

    const needsAttention = quickOverview?.needsAttention || [];
    const healthSnapshot = quickOverview?.healthSnapshot || {};
    const recentActivity = quickOverview?.recentActivity || [];
    const hasHighPriority = needsAttention.some((a) => a.priority === 'high');

    // Calculate medication progress
    const medSummary = medStatus?.summary || { total: 0, taken: 0, pending: 0, missed: 0, skipped: 0 };
    const medProgress = medSummary.total > 0 
        ? Math.round((medSummary.taken / medSummary.total) * 100) 
        : 0;

    return (
        <PageContainer maxWidth="2xl">
            {/* Back Button */}
            <Button variant="ghost" size="sm" className="mb-4" asChild>
                <Link href="/care" className="flex items-center gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    <span>Back to Care Dashboard</span>
                </Link>
            </Button>

            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                    Patient Overview
                </h1>
                <p className="text-text-secondary mt-1">
                    Quick summary for today ({medStatus?.date})
                </p>
            </div>

            <div className="space-y-6">
                {/* Needs Attention Banner */}
                {needsAttention.length > 0 && (
                    <Card 
                        variant="elevated" 
                        padding="none" 
                        className={cn(
                            'overflow-hidden',
                            hasHighPriority ? 'border-error/50' : 'border-warning/50'
                        )}
                    >
                        <div className={cn(
                            'px-4 py-3 flex items-center gap-2',
                            hasHighPriority ? 'bg-error-light' : 'bg-warning-light'
                        )}>
                            <AlertTriangle className={cn(
                                'h-5 w-5',
                                hasHighPriority ? 'text-error' : 'text-warning'
                            )} />
                            <span className={cn(
                                'font-semibold',
                                hasHighPriority ? 'text-error-dark' : 'text-warning-dark'
                            )}>
                                Needs Attention
                            </span>
                            <Badge 
                                tone={hasHighPriority ? 'danger' : 'warning'} 
                                variant="soft" 
                                size="sm"
                            >
                                {needsAttention.length}
                            </Badge>
                        </div>
                        <div className="divide-y divide-border-light">
                            {needsAttention.map((item, idx) => (
                                <Link
                                    key={idx}
                                    href={item.actionUrl || '#'}
                                    className="flex items-center justify-between px-4 py-3 hover:bg-background-subtle transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            'w-2 h-2 rounded-full',
                                            item.priority === 'high' ? 'bg-error' : 
                                            item.priority === 'medium' ? 'bg-warning' : 'bg-text-muted'
                                        )} />
                                        <span className="text-sm text-text-primary">{item.message}</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-text-muted" />
                                </Link>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Top Row: Medication Progress + Health Snapshot */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Today's Medication Progress */}
                    <Card variant="elevated" padding="lg">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                                <Pill className="h-5 w-5 text-brand-primary" />
                                Today's Medications
                            </h2>
                            <Link 
                                href={`/care/${patientId}/medications`}
                                className="text-sm text-brand-primary hover:underline"
                            >
                                View all
                            </Link>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-2xl font-bold text-text-primary">
                                    {medSummary.taken} of {medSummary.total}
                                </span>
                                <span className={cn(
                                    'text-sm font-medium',
                                    medProgress >= 80 ? 'text-success' :
                                    medProgress >= 50 ? 'text-warning' : 'text-error'
                                )}>
                                    {medProgress}%
                                </span>
                            </div>
                            <div className="h-3 rounded-full bg-background-subtle overflow-hidden">
                                <div 
                                    className={cn(
                                        'h-full rounded-full transition-all',
                                        medProgress >= 80 ? 'bg-success' :
                                        medProgress >= 50 ? 'bg-warning' : 'bg-error'
                                    )}
                                    style={{ width: `${medProgress}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="p-2 rounded-lg bg-success-light">
                                <p className="text-lg font-semibold text-success">{medSummary.taken}</p>
                                <p className="text-xs text-success-dark">Taken</p>
                            </div>
                            <div className="p-2 rounded-lg bg-background-subtle">
                                <p className="text-lg font-semibold text-text-muted">{medSummary.pending}</p>
                                <p className="text-xs text-text-muted">Pending</p>
                            </div>
                            <div className="p-2 rounded-lg bg-background-subtle">
                                <p className="text-lg font-semibold text-text-muted">{medSummary.skipped}</p>
                                <p className="text-xs text-text-muted">Skipped</p>
                            </div>
                            <div className={cn(
                                'p-2 rounded-lg',
                                medSummary.missed > 0 ? 'bg-error-light' : 'bg-background-subtle'
                            )}>
                                <p className={cn(
                                    'text-lg font-semibold',
                                    medSummary.missed > 0 ? 'text-error' : 'text-text-muted'
                                )}>{medSummary.missed}</p>
                                <p className={cn(
                                    'text-xs',
                                    medSummary.missed > 0 ? 'text-error-dark' : 'text-text-muted'
                                )}>Missed</p>
                            </div>
                        </div>
                    </Card>

                    {/* Health Snapshot */}
                    <Card variant="elevated" padding="lg">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                                <Heart className="h-5 w-5 text-error" />
                                Health Snapshot
                            </h2>
                            <Link 
                                href={`/care/${patientId}/health`}
                                className="text-sm text-brand-primary hover:underline"
                            >
                                View details
                            </Link>
                        </div>

                        <div className="grid gap-3">
                            <HealthSnapshotItem
                                icon={<Heart className="h-4 w-4" />}
                                label="Blood Pressure"
                                value={healthSnapshot.latestBp?.value}
                                alertLevel={healthSnapshot.latestBp?.alertLevel}
                                date={healthSnapshot.latestBp?.date}
                            />
                            <HealthSnapshotItem
                                icon={<Droplets className="h-4 w-4" />}
                                label="Blood Glucose"
                                value={healthSnapshot.latestGlucose?.value}
                                alertLevel={healthSnapshot.latestGlucose?.alertLevel}
                                date={healthSnapshot.latestGlucose?.date}
                            />
                            <HealthSnapshotItem
                                icon={<Scale className="h-4 w-4" />}
                                label="Weight"
                                value={healthSnapshot.latestWeight?.value}
                                date={healthSnapshot.latestWeight?.date}
                            />
                        </div>
                    </Card>
                </div>

                {/* Recent Activity */}
                {recentActivity.length > 0 && (
                    <Card variant="elevated" padding="none" className="overflow-hidden">
                        <div className="border-b border-border-light bg-background-subtle/50 px-5 py-4">
                            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                                <Clock className="h-5 w-5 text-text-muted" />
                                Recent Activity
                            </h2>
                        </div>
                        <div className="divide-y divide-border-light">
                            {recentActivity.map((activity, idx) => (
                                <div key={idx} className="flex items-center gap-4 px-5 py-3">
                                    <div className={cn(
                                        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                                        activity.type === 'med_taken' && 'bg-success-light text-success',
                                        activity.type === 'med_skipped' && 'bg-warning-light text-warning',
                                        activity.type === 'health_log' && 'bg-brand-primary-pale text-brand-primary',
                                        activity.type === 'visit' && 'bg-brand-primary-pale text-brand-primary'
                                    )}>
                                        {activity.type === 'med_taken' && <CheckCircle className="h-4 w-4" />}
                                        {activity.type === 'med_skipped' && <XCircle className="h-4 w-4" />}
                                        {activity.type === 'health_log' && <Activity className="h-4 w-4" />}
                                        {activity.type === 'visit' && <Stethoscope className="h-4 w-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-text-primary truncate">
                                            {activity.description}
                                        </p>
                                        <p className="text-xs text-text-muted">
                                            {activity.timestamp && formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Quick Actions */}
                <section>
                    <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <QuickActionCard
                            href={`/care/${patientId}/health`}
                            icon={<Heart className="h-5 w-5" />}
                            label="Health"
                            bgColor="bg-error-light"
                            textColor="text-error"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/adherence`}
                            icon={<BarChart3 className="h-5 w-5" />}
                            label="Adherence"
                            bgColor="bg-success-light"
                            textColor="text-success"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/visits`}
                            icon={<Stethoscope className="h-5 w-5" />}
                            label="Visits"
                            bgColor="bg-brand-primary-pale"
                            textColor="text-brand-primary"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/conditions`}
                            icon={<Activity className="h-5 w-5" />}
                            label="Conditions"
                            bgColor="bg-brand-primary-pale"
                            textColor="text-brand-primary"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/providers`}
                            icon={<Users className="h-5 w-5" />}
                            label="Providers"
                            bgColor="bg-brand-primary-pale"
                            textColor="text-brand-primary"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/actions`}
                            icon={<CheckSquare className="h-5 w-5" />}
                            label="Actions"
                            bgColor="bg-brand-primary-pale"
                            textColor="text-brand-primary"
                        />
                    </div>
                </section>
            </div>
        </PageContainer>
    );
}

// =============================================================================
// Helper Components
// =============================================================================

function HealthSnapshotItem({
    icon,
    label,
    value,
    alertLevel,
    date,
}: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    alertLevel?: string;
    date?: string;
}) {
    const isAlert = alertLevel === 'warning' || alertLevel === 'emergency';
    const isCaution = alertLevel === 'caution';

    return (
        <div className={cn(
            'flex items-center justify-between p-3 rounded-lg',
            isAlert ? 'bg-error-light' : isCaution ? 'bg-warning-light' : 'bg-background-subtle'
        )}>
            <div className="flex items-center gap-3">
                <div className={cn(
                    'text-text-muted',
                    isAlert && 'text-error',
                    isCaution && 'text-warning'
                )}>
                    {icon}
                </div>
                <span className="text-sm text-text-secondary">{label}</span>
            </div>
            {value ? (
                <div className="text-right">
                    <p className={cn(
                        'font-semibold',
                        isAlert ? 'text-error' : isCaution ? 'text-warning' : 'text-text-primary'
                    )}>
                        {value}
                    </p>
                    {date && (
                        <p className="text-xs text-text-muted">
                            {formatDistanceToNow(new Date(date), { addSuffix: true })}
                        </p>
                    )}
                </div>
            ) : (
                <span className="text-sm text-text-muted">No data</span>
            )}
        </div>
    );
}

function QuickActionCard({
    href,
    icon,
    label,
    bgColor,
    textColor,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    bgColor: string;
    textColor: string;
}) {
    return (
        <Link href={href}>
            <Card 
                variant="elevated" 
                padding="md" 
                className="text-center hover:shadow-lg transition-shadow cursor-pointer h-full"
            >
                <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2',
                    bgColor,
                    textColor
                )}>
                    {icon}
                </div>
                <p className="text-sm font-medium text-text-primary">{label}</p>
            </Card>
        </Link>
    );
}
