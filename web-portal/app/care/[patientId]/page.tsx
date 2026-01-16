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
    ArrowRight,
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
                        <Link href="/care" className="inline-flex items-center gap-2">
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
            <div className="space-y-8 animate-fade-in-up">
                {/* Hero Header */}
                <div className="rounded-2xl bg-hero-brand p-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                    <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
                        <Link href="/care" className="inline-flex items-center gap-2 text-brand-primary-dark hover:text-brand-primary">
                            <ArrowLeft className="h-4 w-4" />
                            <span>Back to Care Dashboard</span>
                        </Link>
                    </Button>
                    <span className="text-sm font-medium text-brand-primary-dark uppercase tracking-wider">
                        Patient Overview
                    </span>
                    <h1 className="text-3xl font-bold text-text-primary lg:text-4xl">
                        Quick Summary
                    </h1>
                    <p className="text-text-secondary mt-1">
                        Today's snapshot ({medStatus?.date})
                    </p>
                </div>

                {/* Needs Attention Banner */}
                {needsAttention.length > 0 && (
                    <Card 
                        variant="flat" 
                        padding="none" 
                        className={cn(
                            'overflow-hidden',
                            hasHighPriority ? 'bg-error-light border-error/30' : 'bg-warning-light border-warning/30'
                        )}
                    >
                        <div className={cn(
                            'px-5 py-3 flex items-center gap-3 border-b',
                            hasHighPriority ? 'border-error/20' : 'border-warning/20'
                        )}>
                            <div className={cn(
                                'flex h-10 w-10 items-center justify-center rounded-lg',
                                hasHighPriority ? 'bg-error/20' : 'bg-warning/20'
                            )}>
                                <AlertTriangle className={cn(
                                    'h-5 w-5',
                                    hasHighPriority ? 'text-error-dark' : 'text-warning-dark'
                                )} />
                            </div>
                            <div>
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
                                    className="ml-2"
                                >
                                    {needsAttention.length}
                                </Badge>
                            </div>
                        </div>
                        <div className="divide-y divide-border-light">
                            {needsAttention.map((item, idx) => (
                                <Link
                                    key={idx}
                                    href={item.actionUrl || '#'}
                                    className="flex items-center justify-between px-5 py-4 hover:bg-white/50 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={cn(
                                            'w-2 h-2 rounded-full',
                                            item.priority === 'high' ? 'bg-error' : 
                                            item.priority === 'medium' ? 'bg-warning' : 'bg-text-muted'
                                        )} />
                                        <span className="text-sm text-text-primary">{item.message}</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-text-muted group-hover:translate-x-1 transition-transform" />
                                </Link>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Top Row: Medication Progress + Health Snapshot */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Today's Medication Progress */}
                    <Card variant="elevated" padding="lg">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
                                    <Pill className="h-5 w-5" />
                                </div>
                                <h2 className="text-lg font-semibold text-text-primary">Today's Medications</h2>
                            </div>
                            <Link 
                                href={`/care/${patientId}/medications`}
                                className="text-sm font-medium text-brand-primary hover:underline flex items-center gap-1"
                            >
                                View all
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-3xl font-bold text-text-primary">
                                    {medSummary.taken} of {medSummary.total}
                                </span>
                                <span className={cn(
                                    'text-sm font-bold',
                                    medProgress >= 80 ? 'text-success-dark' :
                                    medProgress >= 50 ? 'text-warning-dark' : 'text-error-dark'
                                )}>
                                    {medProgress}%
                                </span>
                            </div>
                            <div className="h-3 rounded-full bg-background-subtle overflow-hidden">
                                <div 
                                    className={cn(
                                        'h-full rounded-full transition-all duration-500',
                                        medProgress >= 80 ? 'bg-success' :
                                        medProgress >= 50 ? 'bg-warning' : 'bg-error'
                                    )}
                                    style={{ width: `${medProgress}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-4 gap-3">
                            <div className="p-3 rounded-lg bg-success-light text-center">
                                <p className="text-xl font-bold text-success-dark">{medSummary.taken}</p>
                                <p className="text-xs text-success-dark">Taken</p>
                            </div>
                            <div className="p-3 rounded-lg bg-background-subtle text-center">
                                <p className="text-xl font-bold text-text-muted">{medSummary.pending}</p>
                                <p className="text-xs text-text-muted">Pending</p>
                            </div>
                            <div className="p-3 rounded-lg bg-background-subtle text-center">
                                <p className="text-xl font-bold text-text-muted">{medSummary.skipped}</p>
                                <p className="text-xs text-text-muted">Skipped</p>
                            </div>
                            <div className={cn(
                                'p-3 rounded-lg text-center',
                                medSummary.missed > 0 ? 'bg-error-light' : 'bg-background-subtle'
                            )}>
                                <p className={cn(
                                    'text-xl font-bold',
                                    medSummary.missed > 0 ? 'text-error-dark' : 'text-text-muted'
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
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-error-light text-error-dark">
                                    <Heart className="h-5 w-5" />
                                </div>
                                <h2 className="text-lg font-semibold text-text-primary">Health Snapshot</h2>
                            </div>
                            <Link 
                                href={`/care/${patientId}/health`}
                                className="text-sm font-medium text-brand-primary hover:underline flex items-center gap-1"
                            >
                                View details
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>

                        <div className="space-y-3">
                            <HealthSnapshotItem
                                icon={<Heart className="h-4 w-4" />}
                                label="Blood Pressure"
                                value={healthSnapshot.latestBp?.value}
                                alertLevel={healthSnapshot.latestBp?.alertLevel}
                                date={healthSnapshot.latestBp?.date}
                                variant="error"
                            />
                            <HealthSnapshotItem
                                icon={<Droplets className="h-4 w-4" />}
                                label="Blood Glucose"
                                value={healthSnapshot.latestGlucose?.value}
                                alertLevel={healthSnapshot.latestGlucose?.alertLevel}
                                date={healthSnapshot.latestGlucose?.date}
                                variant="info"
                            />
                            <HealthSnapshotItem
                                icon={<Scale className="h-4 w-4" />}
                                label="Weight"
                                value={healthSnapshot.latestWeight?.value}
                                date={healthSnapshot.latestWeight?.date}
                                variant="brand"
                            />
                        </div>
                    </Card>
                </div>

                {/* Recent Activity */}
                {recentActivity.length > 0 && (
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
                                <Clock className="h-4 w-4" />
                            </div>
                            <h2 className="text-lg font-semibold text-text-primary">Recent Activity</h2>
                        </div>
                        <Card variant="elevated" padding="none" className="overflow-hidden">
                            <div className="divide-y divide-border-light">
                                {recentActivity.map((activity, idx) => (
                                    <div key={idx} className="flex items-center gap-4 px-5 py-4 hover:bg-hover transition-colors">
                                        <div className={cn(
                                            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
                                            activity.type === 'med_taken' && 'bg-success-light text-success-dark',
                                            activity.type === 'med_skipped' && 'bg-warning-light text-warning-dark',
                                            activity.type === 'health_log' && 'bg-brand-primary-pale text-brand-primary',
                                            activity.type === 'visit' && 'bg-info-light text-info-dark'
                                        )}>
                                            {activity.type === 'med_taken' && <CheckCircle className="h-5 w-5" />}
                                            {activity.type === 'med_skipped' && <XCircle className="h-5 w-5" />}
                                            {activity.type === 'health_log' && <Activity className="h-5 w-5" />}
                                            {activity.type === 'visit' && <Stethoscope className="h-5 w-5" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-text-primary truncate">
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
                    </section>
                )}

                {/* Quick Actions */}
                <section>
                    <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                        <QuickActionCard
                            href={`/care/${patientId}/health`}
                            icon={<Heart className="h-5 w-5" />}
                            label="Health"
                            variant="error"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/adherence`}
                            icon={<BarChart3 className="h-5 w-5" />}
                            label="Adherence"
                            variant="success"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/visits`}
                            icon={<Stethoscope className="h-5 w-5" />}
                            label="Visits"
                            variant="brand"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/conditions`}
                            icon={<Activity className="h-5 w-5" />}
                            label="Conditions"
                            variant="brand"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/providers`}
                            icon={<Users className="h-5 w-5" />}
                            label="Providers"
                            variant="brand"
                        />
                        <QuickActionCard
                            href={`/care/${patientId}/actions`}
                            icon={<CheckSquare className="h-5 w-5" />}
                            label="Actions"
                            variant="info"
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
    variant,
}: {
    icon: React.ReactNode;
    label: string;
    value?: string;
    alertLevel?: string;
    date?: string;
    variant: 'brand' | 'error' | 'info' | 'success' | 'warning';
}) {
    const isAlert = alertLevel === 'warning' || alertLevel === 'emergency';
    const isCaution = alertLevel === 'caution';

    const variantClasses = {
        brand: 'bg-brand-primary-pale text-brand-primary',
        error: 'bg-error-light text-error-dark',
        info: 'bg-info-light text-info-dark',
        success: 'bg-success-light text-success-dark',
        warning: 'bg-warning-light text-warning-dark',
    };

    return (
        <div className={cn(
            'flex items-center justify-between p-4 rounded-lg transition-colors',
            isAlert ? 'bg-error-light' : isCaution ? 'bg-warning-light' : 'bg-background-subtle'
        )}>
            <div className="flex items-center gap-3">
                <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    variantClasses[variant]
                )}>
                    {icon}
                </div>
                <span className="text-sm font-medium text-text-secondary">{label}</span>
            </div>
            {value ? (
                <div className="text-right">
                    <p className={cn(
                        'font-semibold',
                        isAlert ? 'text-error-dark' : isCaution ? 'text-warning-dark' : 'text-text-primary'
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
    variant,
}: {
    href: string;
    icon: React.ReactNode;
    label: string;
    variant: 'brand' | 'error' | 'info' | 'success' | 'warning';
}) {
    const variantClasses = {
        brand: 'bg-brand-primary-pale text-brand-primary',
        error: 'bg-error-light text-error-dark',
        info: 'bg-info-light text-info-dark',
        success: 'bg-success-light text-success-dark',
        warning: 'bg-warning-light text-warning-dark',
    };

    return (
        <Link href={href}>
            <Card 
                variant="elevated" 
                padding="md" 
                className="text-center h-full transition-all duration-150 hover:shadow-hover hover:-translate-y-0.5 group"
            >
                <div className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-transform group-hover:scale-110',
                    variantClasses[variant]
                )}>
                    {icon}
                </div>
                <p className="text-sm font-medium text-text-primary">{label}</p>
            </Card>
        </Link>
    );
}
