'use client';

import * as React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import {
    Users,
    AlertCircle,
    Loader2,
    CheckCircle,
    XCircle,
    Clock,
    Pill,
    ClipboardList,
    ChevronRight,
    AlertTriangle,
    Heart,
    Zap,
    TrendingUp,
    TrendingDown,
    Minus,
    RefreshCw,
    Activity,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    useCareOverview,
    useCareHealthLogs,
    CarePatientOverview,
    CareAlert,
    type CareHealthLogsResponse,
} from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

// =============================================================================
// Time-of-Day Greeting
// =============================================================================

function getGreeting(): { greeting: string; subtitle: string } {
    const hour = new Date().getHours();
    if (hour < 12) {
        return {
            greeting: 'Good morning',
            subtitle: 'Here\u2019s how your loved ones are doing today.',
        };
    } else if (hour < 17) {
        return {
            greeting: 'Good afternoon',
            subtitle: 'Check in on your family\u2019s health updates.',
        };
    } else {
        return {
            greeting: 'Good evening',
            subtitle: 'Here\u2019s a summary of today\u2019s care updates.',
        };
    }
}

// =============================================================================
// Enhanced Alert Item Component
// =============================================================================

function getAlertIcon(type: CareAlert['type']) {
    switch (type) {
        case 'missed_dose':
            return <Pill className="h-4 w-4" />;
        case 'overdue_action':
            return <ClipboardList className="h-4 w-4" />;
        case 'health_warning':
            return <Heart className="h-4 w-4" />;
        case 'no_data':
            return <Clock className="h-4 w-4" />;
        case 'med_change':
            return <Zap className="h-4 w-4" />;
        case 'missed_checkins':
            return <Clock className="h-4 w-4" />;
        case 'medication_trouble':
            return <AlertTriangle className="h-4 w-4" />;
        default:
            return <AlertCircle className="h-4 w-4" />;
    }
}

function getSeverityStyles(severity: CareAlert['severity']) {
    switch (severity) {
        case 'emergency':
            return { bg: 'bg-error/15', border: 'border-error/30', text: 'text-error-dark', icon: 'text-error' };
        case 'high':
            return { bg: 'bg-error/10', border: 'border-error/20', text: 'text-error-dark', icon: 'text-error' };
        case 'medium':
            return { bg: 'bg-warning/10', border: 'border-warning/20', text: 'text-warning-dark', icon: 'text-warning' };
        case 'low':
            return { bg: 'bg-background-subtle', border: 'border-border-light', text: 'text-text-secondary', icon: 'text-text-muted' };
    }
}

function EnhancedAlertItem({
    alert,
    patientName,
}: {
    alert: CareAlert;
    patientName?: string;
}) {
    const styles = getSeverityStyles(alert.severity);

    return (
        <Link
            href={alert.targetUrl || '#'}
            className={cn(
                'flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-sm',
                styles.bg,
                styles.border
            )}
        >
            <div className={cn('mt-0.5 shrink-0', styles.icon)}>
                {getAlertIcon(alert.type)}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className={cn('font-medium text-sm', styles.text)}>
                        {alert.title}
                    </p>
                    {alert.severity === 'emergency' && (
                        <Badge tone="danger" variant="solid" size="sm">
                            Urgent
                        </Badge>
                    )}
                </div>
                <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                    {alert.description}
                </p>
                {patientName && (
                    <p className="text-xs text-text-muted mt-1">
                        {patientName}
                    </p>
                )}
            </div>
            <ChevronRight className="h-4 w-4 text-text-muted shrink-0 mt-0.5" />
        </Link>
    );
}

// =============================================================================
// Enhanced Needs Attention Panel (Right sidebar on desktop)
// Uses already-batched overview alerts for all patients
// =============================================================================

function NeedsAttentionPanel({ patients }: { patients: CarePatientOverview[] }) {
    const allAlerts: Array<CareAlert & { patientName: string; patientId: string }> = patients
        .flatMap((patient) =>
            patient.alerts
                .filter((alert) => alert.priority === 'high' || alert.priority === 'medium')
                .map((alert, idx) => ({
                    id: `${patient.userId}-${alert.type}-${idx}`,
                    type: alert.type,
                    severity: alert.priority === 'high' ? 'high' : 'medium',
                    title:
                        alert.type === 'missed_dose'
                            ? 'Missed Medications'
                            : 'Overdue Action Item',
                    description: alert.message,
                    targetUrl:
                        alert.type === 'missed_dose'
                            ? `/care/${patient.userId}/medications`
                            : `/care/${patient.userId}/actions`,
                    timestamp: patient.lastActive || new Date(0).toISOString(),
                    patientName: patient.name,
                    patientId: patient.userId,
                })),
        );

    // Sort by severity
    const severityOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
    allAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const emergencyCount = allAlerts.filter((a) => a.severity === 'emergency').length;
    const highCount = allAlerts.filter((a) => a.severity === 'high').length;
    const urgentCount = emergencyCount + highCount;
    const hasAlerts = allAlerts.length > 0;

    return (
        <Card variant="elevated" padding="none" className="h-fit overflow-hidden">
            {/* Warm accent top strip */}
            <div className={cn(
                'h-1',
                urgentCount > 0 ? 'bg-gradient-to-r from-error to-[#E07A5F]' : 'bg-gradient-to-r from-[#E8A838] to-[#E07A5F]'
            )} />
            <div className="p-4 border-b border-border-light">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-text-primary flex items-center gap-2">
                        <AlertTriangle className={cn(
                            'h-5 w-5',
                            urgentCount > 0 ? 'text-error' : 'text-[#E07A5F]'
                        )} />
                        Needs Attention
                    </h2>
                    {urgentCount > 0 && (
                        <Badge tone="danger" variant="solid" size="sm">
                            {urgentCount} urgent
                        </Badge>
                    )}
                </div>
                {/* Summary badges */}
                {allAlerts.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        {emergencyCount > 0 && (
                            <Badge tone="danger" variant="soft" size="sm">
                                {emergencyCount} critical
                            </Badge>
                        )}
                        {highCount > 0 && (
                            <Badge tone="warning" variant="soft" size="sm">
                                {highCount} high
                            </Badge>
                        )}
                        {allAlerts.filter((a) => a.severity === 'medium').length > 0 && (
                            <Badge tone="neutral" variant="soft" size="sm">
                                {allAlerts.filter((a) => a.severity === 'medium').length} medium
                            </Badge>
                        )}
                    </div>
                )}
            </div>

            <div className="p-3">
                {!hasAlerts ? (
                    <div className="flex items-center gap-3 p-3 text-success">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">All clear! No urgent items.</span>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {allAlerts.slice(0, 6).map((alert) => (
                            <EnhancedAlertItem
                                key={alert.id}
                                alert={alert}
                                patientName={patients.length > 1 ? alert.patientName : undefined}
                            />
                        ))}
                        {allAlerts.length > 6 && (
                            <p className="text-sm text-text-muted text-center pt-2">
                                + {allAlerts.length - 6} more alerts
                            </p>
                        )}
                    </div>
                )}
            </div>
        </Card>
    );
}

// =============================================================================
// Trend Indicator Component
// =============================================================================

function TrendIndicator({ 
    direction, 
    size = 'sm' 
}: { 
    direction: 'up' | 'down' | 'stable' | null; 
    size?: 'sm' | 'md';
}) {
    if (!direction) return null;
    
    const sizeClasses = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
    
    switch (direction) {
        case 'up':
            return <TrendingUp className={cn(sizeClasses, 'text-error')} />;
        case 'down':
            return <TrendingDown className={cn(sizeClasses, 'text-success')} />;
        case 'stable':
            return <Minus className={cn(sizeClasses, 'text-text-muted')} />;
        default:
            return null;
    }
}

// =============================================================================
// Avatar Color Palettes (warm, varied)
// =============================================================================

const AVATAR_PALETTES = [
    { bg: 'bg-brand-primary-pale', text: 'text-brand-primary' },
    { bg: 'bg-[#FDF0EC]', text: 'text-[#D06A4E]' },
    { bg: 'bg-[#FEF3D7]', text: 'text-[#B8892A]' },
    { bg: 'bg-[#E3EFF7]', text: 'text-[#3F6E8C]' },
    { bg: 'bg-[#F0E6F6]', text: 'text-[#7E4E9E]' },
];

// =============================================================================
// Patient Card Component (Compact, information-dense)
// =============================================================================

function PatientCard({ patient, colorIndex = 0 }: { patient: CarePatientOverview; colorIndex?: number }) {
    const { medicationsToday, pendingActions, alerts } = patient;
    const hasHighPriorityAlerts = alerts.some((a) => a.priority === 'high');
    const alertCount = alerts.length;
    const hasUrgent = hasHighPriorityAlerts;

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
                hasUrgent && 'ring-2 ring-error/50'
            )}
        >
            {hasUrgent && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-error" />
            )}

            {/* Clickable card body */}
            <Link href={`/care/${patient.userId}`} className="block cursor-pointer">
                {/* Header */}
                <div className="p-4 pb-3">
                    <div className="flex items-center gap-3">
                        <div className={cn(
                            'flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold shrink-0',
                            AVATAR_PALETTES[colorIndex % AVATAR_PALETTES.length].bg,
                            AVATAR_PALETTES[colorIndex % AVATAR_PALETTES.length].text
                        )}>
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
                        <ChevronRight className="h-5 w-5 text-text-muted shrink-0" />
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="px-4 pb-3">
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                        {/* Medications */}
                        <div className="bg-background-subtle rounded-lg p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1 mb-1">
                                <Pill className="h-4 w-4 text-text-muted" />
                            </div>
                            <p className="text-lg font-semibold text-text-primary">
                                {medicationsToday.taken}/{medicationsToday.total}
                            </p>
                            <p className="text-xs text-text-muted">Meds Today</p>
                        </div>

                        {/* Actions */}
                        <div className="bg-background-subtle rounded-lg p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1 mb-1">
                                <ClipboardList className="h-4 w-4 text-text-muted" />
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
                                <AlertTriangle className={cn(
                                    'h-4 w-4',
                                    hasUrgent ? 'text-error' : alertCount > 0 ? 'text-warning' : 'text-text-muted'
                                )} />
                            </div>
                            <p className={cn(
                                'text-lg font-semibold',
                                hasUrgent ? 'text-error' : alertCount > 0 ? 'text-warning' : 'text-success'
                            )}>
                                {alertCount}
                            </p>
                            <p className="text-xs text-text-muted">Alerts</p>
                        </div>
                    </div>
                </div>

                {/* Medication Progress Bar */}
                <div className="px-4 pb-3">
                    {/* Fixed height status line for consistent card heights */}
                    <div className="flex items-center gap-2 text-xs mb-1.5 min-h-[18px]">
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
                        {/* Show placeholder if no status to maintain height */}
                        {medicationsToday.total === 0 && (
                            <span className="text-text-muted">No medications today</span>
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
            </Link>

            {/* Action Buttons */}
            <div className="border-t border-border-light bg-[#FDFCF9] p-3 flex gap-2">
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
            </div>
        </Card>
    );
}

// =============================================================================
// Main Care Dashboard Page
// =============================================================================

export default function CareDashboardPage() {
    const { data, isLoading, isFetching, error, refetch } = useCareOverview();
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

    const { greeting, subtitle } = getGreeting();

    return (
        <PageContainer maxWidth="xl">
            {/* Warm Greeting Hero */}
            <div className="relative overflow-hidden rounded-2xl bg-hero-warm mb-8 p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight">
                            {greeting}
                        </h1>
                        <p className="text-text-secondary mt-1 text-sm sm:text-base">
                            {hasPatients
                                ? subtitle
                                : 'No one has shared their health with you yet.'}
                        </p>
                        {hasPatients && (
                            <p className="text-xs text-text-muted mt-2">
                                Caring for {patients.length} loved one{patients.length > 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="self-start sm:self-center shrink-0"
                    >
                        <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
                        {isFetching ? 'Refreshing...' : 'Refresh'}
                    </Button>
                </div>
            </div>

            {!hasPatients ? (
                /* Empty State */
                <Card variant="elevated" padding="lg" className="text-center py-12 overflow-hidden relative">
                    {/* Warm decorative accent */}
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary via-[#7ECDB5] to-[#E07A5F]" />
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FDF0EC] mx-auto mb-4">
                        <Users className="h-8 w-8 text-[#E07A5F]" />
                    </div>
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        No one has shared with you yet
                    </h2>
                    <p className="text-text-secondary mb-6 max-w-md mx-auto">
                        When a family member shares their health information with you,
                        you&apos;ll be able to keep up with their care from here.
                    </p>
                </Card>
            ) : (
                <>
                    {/* Two-column desktop layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left: Patient Cards (2/3 width on desktop) */}
                        <div className="lg:col-span-2">
                            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
                                <Users className="h-5 w-5 text-text-muted" />
                                Family Members
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {patients.map((patient, index) => (
                                    <PatientCard key={patient.userId} patient={patient} colorIndex={index} />
                                ))}
                            </div>
                        </div>

                        {/* Right: Needs Attention Panel (1/3 width on desktop) */}
                        <div className="lg:col-span-1">
                            {/* Spacer to align with patient cards (matches heading height) */}
                            <div className="hidden lg:block h-[32px] mb-4" />
                            <div className="lg:sticky lg:top-24">
                                <NeedsAttentionPanel patients={patients} />
                            </div>
                        </div>
                    </div>

                    {/* Health Overview - cross-patient health summary */}
                    <div className="mt-6">
                        <HealthOverviewPanel patients={patients} />
                    </div>
                </>
            )}
        </PageContainer>
    );
}

// =============================================================================
// Health Overview Panel — Cross-patient health status
// =============================================================================

function HealthOverviewPanel({ patients }: { patients: CarePatientOverview[] }) {
    if (patients.length === 0) return null;

    return (
        <Card variant="elevated" padding="none" className="overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-brand-primary via-[#7ECDB5] to-[#E07A5F]" />
            <div className="p-4 border-b border-border-light">
                <h2 className="font-semibold text-text-primary flex items-center gap-2">
                    <Activity className="h-5 w-5 text-brand-primary" />
                    Health Overview
                </h2>
                <p className="text-xs text-text-muted mt-1">
                    Recent health status across all family members
                </p>
            </div>
            <div className="divide-y divide-border-light">
                {patients.map((patient) => (
                    <PatientHealthRow key={patient.userId} patient={patient} />
                ))}
            </div>
        </Card>
    );
}

function PatientHealthRow({ patient }: { patient: CarePatientOverview }) {
    const { data, isLoading } = useCareHealthLogs(patient.userId, { days: 30 });

    const getHealthStatus = (healthData: CareHealthLogsResponse | undefined): {
        status: 'good' | 'monitor' | 'attention' | 'no_data';
        label: string;
        details: string;
    } => {
        if (!healthData || healthData.logs.length === 0) {
            return { status: 'no_data', label: 'No data', details: 'No readings in 30 days' };
        }

        const { alerts, summary, insights } = healthData;
        const hasEmergency = alerts.emergency > 0;
        const hasWarning = alerts.warning > 0;
        const hasConcernInsight = insights?.some((i) => i.severity === 'concern');
        const hasAttentionInsight = insights?.some((i) => i.severity === 'attention');

        if (hasEmergency) {
            return { status: 'attention', label: 'Needs attention', details: `${alerts.emergency} critical reading${alerts.emergency > 1 ? 's' : ''}` };
        }

        if (hasWarning || hasConcernInsight) {
            const parts: string[] = [];
            if (hasWarning) parts.push(`${alerts.warning} warning${alerts.warning > 1 ? 's' : ''}`);
            if (hasConcernInsight) parts.push('concerning trend');
            return { status: 'attention', label: 'Needs attention', details: parts.join(', ') };
        }

        if (hasAttentionInsight) {
            return { status: 'monitor', label: 'Monitor', details: 'Trend needs watching' };
        }

        const totalReadings = healthData.logs.length;
        const latestDate = healthData.logs[0]?.createdAt;
        const daysSinceLatest = latestDate ? Math.floor((Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;

        if (daysSinceLatest >= 7) {
            return { status: 'monitor', label: 'Monitor', details: `Last reading ${daysSinceLatest} days ago` };
        }

        return { status: 'good', label: 'Doing well', details: `${totalReadings} reading${totalReadings !== 1 ? 's' : ''} — all stable` };
    };

    const healthStatus = getHealthStatus(data);

    const statusStyles = {
        good: { icon: <CheckCircle className="h-4 w-4 text-success" />, bg: 'bg-success/10', text: 'text-success' },
        monitor: { icon: <Clock className="h-4 w-4 text-warning" />, bg: 'bg-warning/10', text: 'text-warning-dark' },
        attention: { icon: <AlertTriangle className="h-4 w-4 text-error" />, bg: 'bg-error/10', text: 'text-error' },
        no_data: { icon: <Minus className="h-4 w-4 text-text-muted" />, bg: 'bg-background-subtle', text: 'text-text-muted' },
    };

    const style = statusStyles[healthStatus.status];

    // Build quick vitals summary
    const vitals: string[] = [];
    if (data?.summary.bp.latest) {
        vitals.push(`BP: ${data.summary.bp.latest.systolic}/${data.summary.bp.latest.diastolic}`);
    }
    if (data?.summary.glucose.latest) {
        vitals.push(`Glucose: ${(data.summary.glucose.latest as { reading: number }).reading}`);
    }
    if (data?.summary.weight.latest) {
        vitals.push(`Weight: ${(data.summary.weight.latest as { weight: number }).weight}`);
    }

    return (
        <Link
            href={`/care/${patient.userId}/health`}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-background-subtle transition-colors"
        >
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0', style.bg)}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-text-muted" /> : style.icon}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{patient.name}</p>
                    <span className={cn('text-xs font-medium', style.text)}>{healthStatus.label}</span>
                </div>
                <p className="text-xs text-text-muted truncate">
                    {isLoading ? 'Loading...' : healthStatus.details}
                    {vitals.length > 0 && ` — ${vitals.join(', ')}`}
                </p>
            </div>
            <ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
        </Link>
    );
}
