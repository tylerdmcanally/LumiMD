'use client';

import * as React from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
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
    ChevronRight,
    AlertTriangle,
    Heart,
    Zap,
    TrendingUp,
    TrendingDown,
    Minus,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCareOverview, CarePatientOverview, useCareAlerts, CareAlert } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

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
            return { bg: 'bg-brand-primary-pale', border: 'border-brand-primary/20', text: 'text-text-primary', icon: 'text-brand-primary' };
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

// Legacy alert item for backward compatibility
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
// Enhanced Needs Attention Panel (Right sidebar on desktop)
// Uses unified alerts API for all patients
// =============================================================================

function NeedsAttentionPanel({ patients }: { patients: CarePatientOverview[] }) {
    // Fetch unified alerts for each patient
    const alertQueries = patients.map((p) => useCareAlerts(p.userId, { days: 7 }));
    const isLoadingAlerts = alertQueries.some((q) => q.isLoading);

    // Aggregate all alerts across patients
    const allAlerts: Array<CareAlert & { patientName: string; patientId: string }> = [];
    
    alertQueries.forEach((query, idx) => {
        if (query.data?.alerts) {
            query.data.alerts.forEach((alert) => {
                allAlerts.push({
                    ...alert,
                    patientName: patients[idx].name,
                    patientId: patients[idx].userId,
                });
            });
        }
    });

    // Sort by severity
    const severityOrder: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
    allAlerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const emergencyCount = allAlerts.filter((a) => a.severity === 'emergency').length;
    const highCount = allAlerts.filter((a) => a.severity === 'high').length;
    const urgentCount = emergencyCount + highCount;

    // Fallback to legacy alerts if new API not loaded yet
    const legacyAlerts = patients.flatMap((patient) =>
        patient.alerts
            .filter((a) => a.priority === 'high' || a.priority === 'medium')
            .map((alert) => ({
                ...alert,
                patientName: patient.name,
                patientId: patient.userId,
            }))
    );

    const displayAlerts = allAlerts.length > 0 ? allAlerts : [];
    const hasAlerts = displayAlerts.length > 0 || legacyAlerts.length > 0;

    return (
        <Card variant="elevated" padding="none" className="h-fit">
            <div className="p-4 border-b border-border-light">
                <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-text-primary flex items-center gap-2">
                        <AlertTriangle className={cn(
                            'h-5 w-5',
                            urgentCount > 0 ? 'text-error' : 'text-warning'
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
                {displayAlerts.length > 0 && (
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
                {isLoadingAlerts ? (
                    <div className="flex items-center justify-center py-6">
                        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                    </div>
                ) : !hasAlerts ? (
                    <div className="flex items-center gap-3 p-3 text-success">
                        <CheckCircle className="h-5 w-5" />
                        <span className="text-sm font-medium">All clear! No urgent items.</span>
                    </div>
                ) : displayAlerts.length > 0 ? (
                    <div className="space-y-2">
                        {displayAlerts.slice(0, 6).map((alert) => (
                            <EnhancedAlertItem
                                key={alert.id}
                                alert={alert}
                                patientName={patients.length > 1 ? alert.patientName : undefined}
                            />
                        ))}
                        {displayAlerts.length > 6 && (
                            <p className="text-sm text-text-muted text-center pt-2">
                                + {displayAlerts.length - 6} more alerts
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {legacyAlerts.slice(0, 5).map((alert, idx) => (
                            <AlertItem
                                key={idx}
                                alert={alert}
                                patientName={alert.patientName}
                                patientId={alert.patientId}
                            />
                        ))}
                        {legacyAlerts.length > 5 && (
                            <p className="text-sm text-text-muted text-center pt-2">
                                + {legacyAlerts.length - 5} more alerts
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
// Patient Card Component (Compact, information-dense)
// =============================================================================

function PatientCard({ patient }: { patient: CarePatientOverview }) {
    const { medicationsToday, pendingActions, alerts } = patient;
    const hasHighPriorityAlerts = alerts.some((a) => a.priority === 'high');

    // Fetch alerts count from new API
    const { data: alertsData } = useCareAlerts(patient.userId, { days: 7 });
    const alertCount = alertsData?.summary?.total ?? alerts.length;
    const hasUrgent = (alertsData?.summary?.emergency ?? 0) + (alertsData?.summary?.high ?? 0) > 0 || hasHighPriorityAlerts;

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
                    <div className="lg:col-span-2">
                        <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2 mb-4">
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
                        {/* Spacer to align with patient cards (matches heading height) */}
                        <div className="hidden lg:block h-[32px] mb-4" />
                        <div className="lg:sticky lg:top-24">
                            <NeedsAttentionPanel patients={patients} />
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    );
}
