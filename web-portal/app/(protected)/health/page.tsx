'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
    Activity,
    Droplets,
    TrendingUp,
    TrendingDown,
    Minus,
    Plus,
    Trash2,
    Scale,
    Download,
    Pill,
    Sparkles,
} from 'lucide-react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
} from 'recharts';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/PageContainer';
import { useHealthLogs, HealthLog, useMedicationCompliance, useHealthInsights } from '@/lib/api/hooks';
import { useViewing } from '@/lib/contexts/ViewingContext';
import { useApiClient } from '@/lib/hooks/useApiClient';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

// =============================================================================
// Types
// =============================================================================

interface BPDataPoint {
    date: string;
    dateLabel: string;
    systolic: number;
    diastolic: number;
}

interface GlucoseDataPoint {
    date: string;
    dateLabel: string;
    reading: number;
    timing?: string;
}

interface WeightDataPoint {
    date: string;
    dateLabel: string;
    weight: number;
}

type LogType = 'bp' | 'glucose' | 'weight';

// =============================================================================
// Helpers
// =============================================================================

function getTrend(values: number[]): 'up' | 'down' | 'stable' {
    if (values.length < 2) return 'stable';
    const recent = values.slice(-3);
    const older = values.slice(-6, -3);
    if (older.length === 0) return 'stable';

    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) < 5) return 'stable';
    return diff > 0 ? 'up' : 'down';
}

function TrendIcon({ trend, goodDirection }: { trend: 'up' | 'down' | 'stable'; goodDirection: 'down' | 'stable' }) {
    if (trend === 'stable') {
        return <Minus className="h-4 w-4 text-text-secondary" />;
    }
    if (trend === 'up') {
        const isGood = goodDirection === 'stable' ? false : false;
        return <TrendingUp className={cn('h-4 w-4', isGood ? 'text-success-dark' : 'text-warning-dark')} />;
    }
    const isGood = goodDirection === 'down';
    return <TrendingDown className={cn('h-4 w-4', isGood ? 'text-success-dark' : 'text-warning-dark')} />;
}

// =============================================================================
// Log Modal Component
// =============================================================================

function LogReadingModal({
    open,
    onClose,
    onSubmit,
    isSubmitting,
}: {
    open: boolean;
    onClose: () => void;
    onSubmit: (type: LogType, value: Record<string, unknown>) => Promise<void>;
    isSubmitting: boolean;
}) {
    const [selectedType, setSelectedType] = React.useState<LogType | null>(null);
    const [systolic, setSystolic] = React.useState('');
    const [diastolic, setDiastolic] = React.useState('');
    const [glucose, setGlucose] = React.useState('');
    const [timing, setTiming] = React.useState('fasting');
    const [weight, setWeight] = React.useState('');

    const resetForm = () => {
        setSelectedType(null);
        setSystolic('');
        setDiastolic('');
        setGlucose('');
        setTiming('fasting');
        setWeight('');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async () => {
        if (!selectedType) return;

        let value: Record<string, unknown> = {};
        if (selectedType === 'bp') {
            value = { systolic: parseInt(systolic), diastolic: parseInt(diastolic) };
        } else if (selectedType === 'glucose') {
            value = { reading: parseInt(glucose), timing };
        } else if (selectedType === 'weight') {
            value = { weight: parseFloat(weight), unit: 'lbs' };
        }

        await onSubmit(selectedType, value);
        handleClose();
    };

    const isValid = () => {
        if (selectedType === 'bp') {
            return systolic && diastolic && parseInt(systolic) > 0 && parseInt(diastolic) > 0;
        }
        if (selectedType === 'glucose') {
            return glucose && parseInt(glucose) > 0;
        }
        if (selectedType === 'weight') {
            return weight && parseFloat(weight) > 0;
        }
        return false;
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
            <div className="relative bg-surface rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 animate-fade-in-up">
                <h2 className="text-xl font-bold text-text-primary mb-4">Log Reading</h2>

                {/* Type Selection */}
                {!selectedType && (
                    <div className="space-y-3">
                        <button
                            onClick={() => setSelectedType('bp')}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border-light hover:bg-hover transition-colors"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                                <Activity className="h-5 w-5" />
                            </div>
                            <span className="font-medium text-text-primary">Blood Pressure</span>
                        </button>
                        <button
                            onClick={() => setSelectedType('glucose')}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border-light hover:bg-hover transition-colors"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                <Droplets className="h-5 w-5" />
                            </div>
                            <span className="font-medium text-text-primary">Blood Glucose</span>
                        </button>
                        <button
                            onClick={() => setSelectedType('weight')}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border border-border-light hover:bg-hover transition-colors"
                        >
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
                                <Scale className="h-5 w-5" />
                            </div>
                            <span className="font-medium text-text-primary">Weight</span>
                        </button>
                    </div>
                )}

                {/* BP Form */}
                {selectedType === 'bp' && (
                    <div className="space-y-4">
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-text-secondary mb-1">Systolic</label>
                                <input
                                    type="number"
                                    value={systolic}
                                    onChange={(e) => setSystolic(e.target.value)}
                                    placeholder="120"
                                    className="w-full px-4 py-3 rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-brand-primary"
                                />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-medium text-text-secondary mb-1">Diastolic</label>
                                <input
                                    type="number"
                                    value={diastolic}
                                    onChange={(e) => setDiastolic(e.target.value)}
                                    placeholder="80"
                                    className="w-full px-4 py-3 rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-brand-primary"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Glucose Form */}
                {selectedType === 'glucose' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Reading (mg/dL)</label>
                            <input
                                type="number"
                                value={glucose}
                                onChange={(e) => setGlucose(e.target.value)}
                                placeholder="100"
                                className="w-full px-4 py-3 rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-brand-primary"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Timing</label>
                            <select
                                value={timing}
                                onChange={(e) => setTiming(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-brand-primary"
                            >
                                <option value="fasting">Fasting</option>
                                <option value="before_meal">Before Meal</option>
                                <option value="after_meal">After Meal</option>
                                <option value="bedtime">Bedtime</option>
                            </select>
                        </div>
                    </div>
                )}

                {/* Weight Form */}
                {selectedType === 'weight' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-text-secondary mb-1">Weight (lbs)</label>
                            <input
                                type="number"
                                step="0.1"
                                value={weight}
                                onChange={(e) => setWeight(e.target.value)}
                                placeholder="150"
                                className="w-full px-4 py-3 rounded-lg border border-border-light focus:outline-none focus:ring-2 focus:ring-brand-primary"
                            />
                        </div>
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <Button variant="ghost" onClick={handleClose} className="flex-1">
                        Cancel
                    </Button>
                    {selectedType && (
                        <Button
                            variant="primary"
                            onClick={handleSubmit}
                            disabled={!isValid() || isSubmitting}
                            className="flex-1"
                        >
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Main Component
// =============================================================================

export default function HealthDashboardPage() {
    const { isViewingShared, viewingUserId } = useViewing();
    const { data: healthLogs = [], isLoading } = useHealthLogs();
    const apiClient = useApiClient();
    const queryClient = useQueryClient();

    const [modalOpen, setModalOpen] = React.useState(false);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [deletingId, setDeletingId] = React.useState<string | null>(null);
    const [isExporting, setIsExporting] = React.useState(false);
    const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
    const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);

    // Medication compliance data
    const { data: compliance } = useMedicationCompliance(7);

    // AI-generated insights
    const { data: insights = [], isLoading: insightsLoading } = useHealthInsights();

    // Handle provider report export
    const handleExportReport = async () => {
        setIsExporting(true);
        try {
            const blob = await apiClient.healthLogs.providerReport();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `LumiMD-Health-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast.success('Report downloaded successfully');
        } catch (error) {
            toast.error('Failed to generate report');
            console.error('[health] Error exporting report:', error);
        } finally {
            setIsExporting(false);
        }
    };

    // Handle log submission
    const handleLogSubmit = async (type: LogType, value: Record<string, unknown>) => {
        setIsSubmitting(true);
        try {
            await apiClient.healthLogs.create({
                type,
                value: value as any, // Type assertion - value is properly structured by modal
                source: 'manual',
            });
            toast.success('Reading logged successfully');
            queryClient.invalidateQueries({ queryKey: ['health-logs'] });
        } catch (error) {
            toast.error('Failed to log reading');
            console.error('[health] Error logging reading:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle delete
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this reading?')) return;

        setDeletingId(id);
        try {
            await apiClient.healthLogs.delete(id);
            toast.success('Reading deleted');
            queryClient.invalidateQueries({ queryKey: ['health-logs'] });
        } catch (error) {
            toast.error('Failed to delete reading');
            console.error('[health] Error deleting reading:', error);
        } finally {
            setDeletingId(null);
        }
    };

    // Handle bulk delete
    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} reading(s)?`)) return;

        setIsBulkDeleting(true);
        try {
            const deletePromises = Array.from(selectedIds).map(id => apiClient.healthLogs.delete(id));
            await Promise.all(deletePromises);
            toast.success(`${selectedIds.size} reading(s) deleted`);
            setSelectedIds(new Set());
            queryClient.invalidateQueries({ queryKey: ['health-logs'] });
        } catch (error) {
            toast.error('Failed to delete some readings');
            console.error('[health] Error bulk deleting:', error);
        } finally {
            setIsBulkDeleting(false);
        }
    };

    // Toggle individual selection
    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    // Toggle select all (visible items)
    const visibleLogs = healthLogs.slice(0, 20);
    const allVisibleSelected = visibleLogs.length > 0 && visibleLogs.every(log => selectedIds.has(log.id));
    const toggleSelectAll = () => {
        if (allVisibleSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(visibleLogs.map(log => log.id)));
        }
    };

    // Filter and process BP data
    const bpData = React.useMemo<BPDataPoint[]>(() => {
        return healthLogs
            .filter((log): log is HealthLog => log.type === 'bp')
            .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
            .map(log => ({
                date: log.createdAt || '',
                dateLabel: log.createdAt ? format(new Date(log.createdAt), 'MMM d') : '',
                systolic: log.value.systolic || 0,
                diastolic: log.value.diastolic || 0,
            }));
    }, [healthLogs]);

    // Filter and process glucose data
    const glucoseData = React.useMemo<GlucoseDataPoint[]>(() => {
        return healthLogs
            .filter((log): log is HealthLog => log.type === 'glucose')
            .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
            .map(log => ({
                date: log.createdAt || '',
                dateLabel: log.createdAt ? format(new Date(log.createdAt), 'MMM d') : '',
                reading: log.value.reading || 0,
                timing: log.value.timing,
            }));
    }, [healthLogs]);

    // Calculate stats
    const bpStats = React.useMemo(() => {
        if (bpData.length === 0) return null;
        const latest = bpData[bpData.length - 1];
        const systolicValues = bpData.map(d => d.systolic);
        const avgSystolic = Math.round(systolicValues.reduce((a, b) => a + b, 0) / systolicValues.length);
        const avgDiastolic = Math.round(bpData.map(d => d.diastolic).reduce((a, b) => a + b, 0) / bpData.length);
        return {
            latest,
            avgSystolic,
            avgDiastolic,
            trend: getTrend(systolicValues),
            count: bpData.length,
        };
    }, [bpData]);

    const glucoseStats = React.useMemo(() => {
        if (glucoseData.length === 0) return null;
        const latest = glucoseData[glucoseData.length - 1];
        const readings = glucoseData.map(d => d.reading);
        const avg = Math.round(readings.reduce((a, b) => a + b, 0) / readings.length);
        return {
            latest,
            avg,
            trend: getTrend(readings),
            count: glucoseData.length,
        };
    }, [glucoseData]);

    // Filter and process weight data
    const weightData = React.useMemo<WeightDataPoint[]>(() => {
        return healthLogs
            .filter((log): log is HealthLog => log.type === 'weight')
            .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
            .map(log => ({
                date: log.createdAt || '',
                dateLabel: log.createdAt ? format(new Date(log.createdAt), 'MMM d') : '',
                weight: log.value.weight || 0,
            }));
    }, [healthLogs]);

    const weightStats = React.useMemo(() => {
        if (weightData.length === 0) return null;
        const latest = weightData[weightData.length - 1];
        const weights = weightData.map(d => d.weight);
        const avg = Math.round(weights.reduce((a, b) => a + b, 0) / weights.length * 10) / 10;
        return {
            latest,
            avg,
            trend: getTrend(weights),
            count: weightData.length,
        };
    }, [weightData]);

    const hasNoData = bpData.length === 0 && glucoseData.length === 0 && weightData.length === 0;

    return (
        <PageContainer maxWidth="2xl">
            <div className="space-y-8 animate-fade-in-up">
                {/* Header */}
                <div className="rounded-2xl bg-hero-brand p-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <span className="text-sm font-medium text-brand-primary-dark uppercase tracking-wider">
                                Health Trends
                            </span>
                            <h1 className="text-3xl font-bold text-text-primary lg:text-4xl">
                                Your Health Dashboard
                            </h1>
                            {isViewingShared && (
                                <p className="text-sm text-brand-primary font-medium">
                                    Viewing shared data (read-only)
                                </p>
                            )}
                        </div>
                        {!isViewingShared && (
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    onClick={handleExportReport}
                                    disabled={isExporting || hasNoData}
                                    leftIcon={<Download className="h-4 w-4" />}
                                >
                                    {isExporting ? 'Exporting...' : 'Export PDF'}
                                </Button>
                                <Button
                                    variant="primary"
                                    onClick={() => setModalOpen(true)}
                                    leftIcon={<Plus className="h-4 w-4" />}
                                >
                                    Log Reading
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Loading state */}
                {isLoading && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Card variant="elevated" padding="lg" className="h-32 animate-pulse-soft bg-background-subtle" />
                        <Card variant="elevated" padding="lg" className="h-32 animate-pulse-soft bg-background-subtle" />
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && hasNoData && (
                    <Card variant="elevated" padding="lg" className="text-center py-12">
                        <Activity className="h-12 w-12 mx-auto text-text-tertiary mb-4" />
                        <h3 className="text-lg font-semibold text-text-primary mb-2">
                            No health data yet
                        </h3>
                        <p className="text-text-secondary max-w-md mx-auto mb-4">
                            Start tracking your health by logging blood pressure, glucose, or weight readings.
                        </p>
                        {!isViewingShared && (
                            <Button
                                variant="primary"
                                onClick={() => setModalOpen(true)}
                                leftIcon={<Plus className="h-4 w-4" />}
                            >
                                Log Your First Reading
                            </Button>
                        )}
                    </Card>
                )}

                {/* Summary Cards */}
                {!isLoading && !hasNoData && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        {/* BP Summary */}
                        {bpStats && (
                            <Card variant="elevated" padding="lg">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                                        <Activity className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-text-secondary">Blood Pressure</p>
                                        <p className="text-2xl font-bold text-text-primary">
                                            {bpStats.latest.systolic}/{bpStats.latest.diastolic}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <TrendIcon trend={bpStats.trend} goodDirection="down" />
                                            <span className="text-sm text-text-muted">
                                                Avg: {bpStats.avgSystolic}/{bpStats.avgDiastolic} • {bpStats.count} readings
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Glucose Summary */}
                        {glucoseStats && (
                            <Card variant="elevated" padding="lg">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                        <Droplets className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-text-secondary">Blood Glucose</p>
                                        <p className="text-2xl font-bold text-text-primary">
                                            {glucoseStats.latest.reading} mg/dL
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <TrendIcon trend={glucoseStats.trend} goodDirection="stable" />
                                            <span className="text-sm text-text-muted">
                                                Avg: {glucoseStats.avg} mg/dL • {glucoseStats.count} readings
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Weight Summary */}
                        {weightStats && (
                            <Card variant="elevated" padding="lg">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-600">
                                        <Scale className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-text-secondary">Weight</p>
                                        <p className="text-2xl font-bold text-text-primary">
                                            {weightStats.latest.weight} lbs
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <TrendIcon trend={weightStats.trend} goodDirection="stable" />
                                            <span className="text-sm text-text-muted">
                                                Avg: {weightStats.avg} lbs • {weightStats.count} readings
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Medication Compliance Summary */}
                        {compliance?.hasReminders && (
                            <Card variant="elevated" padding="lg">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
                                        <Pill className="h-6 w-6" />
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm text-text-secondary">Medication Adherence</p>
                                        <p className="text-2xl font-bold text-text-primary">
                                            {compliance.adherence}%
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={cn(
                                                'text-sm',
                                                compliance.adherence >= 80 ? 'text-success-dark' :
                                                    compliance.adherence >= 50 ? 'text-warning-dark' : 'text-error-dark'
                                            )}>
                                                {compliance.adherence >= 80 ? 'On track' :
                                                    compliance.adherence >= 50 ? 'Needs improvement' : 'Low adherence'}
                                            </span>
                                            <span className="text-sm text-text-muted">
                                                • {compliance.takenCount}/{compliance.expectedCount} doses (7 days)
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        )}
                    </div>
                )}

                {/* LumiBot Insights */}
                {insights.length > 0 && (
                    <section>
                        <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-brand-primary" />
                            LumiBot Insights
                        </h2>
                        <Card variant="elevated" padding="lg">
                            <div className="space-y-3">
                                {insights.map((insight) => (
                                    <div
                                        key={insight.id}
                                        className={cn(
                                            'flex items-start gap-3 p-3 rounded-lg',
                                            insight.type === 'positive' && 'bg-success-light/30',
                                            insight.type === 'attention' && 'bg-warning-light/30',
                                            insight.type === 'tip' && 'bg-brand-primary-light/30',
                                            insight.type === 'neutral' && 'bg-background-subtle',
                                        )}
                                    >
                                        <div className={cn(
                                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm',
                                            insight.type === 'positive' && 'bg-success-light text-success-dark',
                                            insight.type === 'attention' && 'bg-warning-light text-warning-dark',
                                            insight.type === 'tip' && 'bg-brand-primary-light text-brand-primary',
                                            insight.type === 'neutral' && 'bg-gray-100 text-gray-600',
                                        )}>
                                            {insight.type === 'positive' && '✓'}
                                            {insight.type === 'attention' && '!'}
                                            {insight.type === 'tip' && '💡'}
                                            {insight.type === 'neutral' && '📊'}
                                        </div>
                                        <p className="text-text-primary text-sm leading-relaxed">
                                            {insight.text}
                                        </p>
                                    </div>
                                ))}
                            </div>
                            {insights[0]?.generatedAt && (
                                <p className="text-xs text-text-muted mt-4 text-right">
                                    Last updated: {new Date(insights[0].generatedAt).toLocaleDateString()}
                                </p>
                            )}
                        </Card>
                    </section>
                )}

                {/* BP Chart */}
                {bpData.length > 0 && (
                    <section>
                        <h2 className="text-lg font-semibold text-text-primary mb-4">
                            Blood Pressure Trend
                        </h2>
                        <Card variant="elevated" padding="lg">
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={bpData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="dateLabel"
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[60, 180]}
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#fff',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            }}
                                            labelStyle={{ fontWeight: 600 }}
                                            formatter={(value: any, name: any) => [
                                                `${value} mmHg`,
                                                name
                                            ]}
                                            itemSorter={() => -1}
                                        />
                                        {/* Healthy systolic range (90-120) */}
                                        <ReferenceLine
                                            y={120}
                                            stroke="#22c55e"
                                            strokeDasharray="5 5"
                                            label={{ value: 'Systolic target (120)', position: 'insideTopRight', fill: '#22c55e', fontSize: 11 }}
                                        />
                                        {/* Healthy diastolic (80) */}
                                        <ReferenceLine
                                            y={80}
                                            stroke="#3b82f6"
                                            strokeDasharray="5 5"
                                            label={{ value: 'Diastolic target (80)', position: 'insideBottomRight', fill: '#3b82f6', fontSize: 11 }}
                                        />
                                        {/* Systolic line - render first so shows first in tooltip */}
                                        <Line
                                            type="monotone"
                                            dataKey="systolic"
                                            stroke="#f43f5e"
                                            strokeWidth={2}
                                            dot={{ fill: '#f43f5e', strokeWidth: 0, r: 4 }}
                                            name="Systolic"
                                        />
                                        {/* Diastolic line */}
                                        <Line
                                            type="monotone"
                                            dataKey="diastolic"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                                            name="Diastolic"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Legend */}
                            <div className="flex items-center justify-center gap-6 mt-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                                    <span className="text-text-secondary">Systolic (top number)</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                                    <span className="text-text-secondary">Diastolic (bottom number)</span>
                                </div>
                            </div>
                        </Card>
                    </section>
                )}

                {/* Glucose Chart */}
                {glucoseData.length > 0 && (
                    <section>
                        <h2 className="text-lg font-semibold text-text-primary mb-4">
                            Blood Glucose Trend
                        </h2>
                        <Card variant="elevated" padding="lg">
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={glucoseData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="dateLabel"
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[60, 250]}
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#fff',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            }}
                                            labelStyle={{ fontWeight: 600 }}
                                        />
                                        <ReferenceLine y={70} stroke="#fbbf24" strokeDasharray="5 5" />
                                        <ReferenceLine y={130} stroke="#fbbf24" strokeDasharray="5 5" />
                                        <Line
                                            type="monotone"
                                            dataKey="reading"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                                            name="Glucose"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </section>
                )}

                {/* Weight Chart */}
                {weightData.length > 0 && (
                    <section>
                        <h2 className="text-lg font-semibold text-text-primary mb-4">
                            Weight Trend
                        </h2>
                        <Card variant="elevated" padding="lg">
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={weightData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="dateLabel"
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={['dataMin - 10', 'dataMax + 10']}
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#fff',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            }}
                                            labelStyle={{ fontWeight: 600 }}
                                            formatter={(value) => [`${value} lbs`, 'Weight']}
                                        />
                                        <Line
                                            type="monotone"
                                            dataKey="weight"
                                            stroke="#22c55e"
                                            strokeWidth={2}
                                            dot={{ fill: '#22c55e', strokeWidth: 0, r: 4 }}
                                            name="Weight"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </Card>
                    </section>
                )}

                {/* Medication Adherence Chart */}
                {compliance?.hasReminders && compliance.dailyData.length > 0 && (
                    <section>
                        <h2 className="text-lg font-semibold text-text-primary mb-4">
                            Medication Adherence (7 Days)
                        </h2>
                        <Card variant="elevated" padding="lg">
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={compliance.dailyData.map(d => ({
                                        ...d,
                                        dateLabel: format(new Date(d.date), 'MMM d'),
                                    }))} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                        <XAxis
                                            dataKey="dateLabel"
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            tick={{ fontSize: 12, fill: '#6b7280' }}
                                            tickLine={false}
                                            axisLine={false}
                                            tickFormatter={(v) => `${v}%`}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: '#fff',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '8px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                            }}
                                            labelStyle={{ fontWeight: 600 }}
                                            formatter={(value: any, _name: any, props: any) => [
                                                `${value}% (${props.payload.taken}/${props.payload.expected} doses)`,
                                                'Adherence'
                                            ]}
                                        />
                                        <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="5 5" label={{ value: '80% target', fill: '#22c55e', fontSize: 11 }} />
                                        <Line
                                            type="monotone"
                                            dataKey="adherence"
                                            stroke="#a855f7"
                                            strokeWidth={2}
                                            dot={{ fill: '#a855f7', strokeWidth: 0, r: 4 }}
                                            name="Adherence"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Per-medication breakdown */}
                            {compliance.byMedication.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-border-light">
                                    <h3 className="text-sm font-medium text-text-secondary mb-3">By Medication</h3>
                                    <div className="space-y-2">
                                        {compliance.byMedication.map(med => (
                                            <div key={med.medicationId} className="flex items-center gap-3">
                                                <div className="flex-1">
                                                    <span className="text-sm text-text-primary">{med.name}</span>
                                                </div>
                                                <div className="w-32 bg-background-subtle rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full rounded-full transition-all",
                                                            med.adherence >= 80 ? "bg-success" :
                                                                med.adherence >= 50 ? "bg-warning" : "bg-error"
                                                        )}
                                                        style={{ width: `${med.adherence}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-text-primary w-12 text-right">
                                                    {med.adherence}%
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>
                    </section>
                )}

                {/* Recent Logs Table */}
                {healthLogs.length > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold text-text-primary">
                                    Recent Readings
                                </h2>
                                {!isViewingShared && selectedIds.size > 0 && (
                                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-sm font-medium">
                                        {selectedIds.size} selected
                                        <button
                                            onClick={() => setSelectedIds(new Set())}
                                            className="ml-1 hover:text-brand-primary-dark"
                                            title="Clear selection"
                                        >
                                            ×
                                        </button>
                                    </span>
                                )}
                            </div>
                            {!isViewingShared && selectedIds.size > 0 && (
                                <Button
                                    variant="danger"
                                    onClick={handleBulkDelete}
                                    disabled={isBulkDeleting}
                                    leftIcon={<Trash2 className="h-4 w-4" />}
                                >
                                    {isBulkDeleting ? 'Deleting...' : `Delete Selected`}
                                </Button>
                            )}
                        </div>
                        <Card variant="elevated" padding="none">
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border-light">
                                            {!isViewingShared && (
                                                <th className="px-4 py-3 w-10">
                                                    <input
                                                        type="checkbox"
                                                        checked={allVisibleSelected}
                                                        onChange={toggleSelectAll}
                                                        className="h-4 w-4 rounded border-border-light text-brand-primary focus:ring-brand-primary cursor-pointer"
                                                        title={allVisibleSelected ? "Deselect all" : "Select all"}
                                                    />
                                                </th>
                                            )}
                                            <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Date</th>
                                            <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Type</th>
                                            <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Value</th>
                                            <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">Status</th>
                                            {!isViewingShared && (
                                                <th className="px-4 py-3 text-right text-sm font-medium text-text-secondary">Actions</th>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleLogs.map((log) => (
                                            <tr key={log.id} className={cn(
                                                "border-b border-border-light last:border-0",
                                                selectedIds.has(log.id) && "bg-brand-primary/5"
                                            )}>
                                                {!isViewingShared && (
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedIds.has(log.id)}
                                                            onChange={() => toggleSelect(log.id)}
                                                            className="h-4 w-4 rounded border-border-light text-brand-primary focus:ring-brand-primary cursor-pointer"
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 text-sm text-text-primary">
                                                    {log.createdAt ? format(new Date(log.createdAt), 'MMM d, h:mm a') : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-text-primary capitalize">
                                                    {log.type === 'bp' ? 'Blood Pressure' : log.type === 'glucose' ? 'Glucose' : log.type}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-text-primary font-medium">
                                                    {log.type === 'bp' && `${log.value.systolic}/${log.value.diastolic}`}
                                                    {log.type === 'glucose' && `${log.value.reading} mg/dL`}
                                                    {log.type === 'weight' && `${log.value.weight} ${log.value.unit || 'lbs'}`}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={cn(
                                                            'inline-flex px-2 py-1 rounded text-xs font-medium',
                                                            log.alertLevel === 'normal' && 'bg-success-light text-success-dark',
                                                            log.alertLevel === 'caution' && 'bg-warning-light text-warning-dark',
                                                            log.alertLevel === 'warning' && 'bg-error-light text-error-dark',
                                                            !log.alertLevel && 'bg-background-subtle text-text-secondary',
                                                        )}
                                                    >
                                                        {log.alertLevel || 'normal'}
                                                    </span>
                                                </td>
                                                {!isViewingShared && (
                                                    <td className="px-4 py-3 text-right">
                                                        <button
                                                            onClick={() => handleDelete(log.id)}
                                                            disabled={deletingId === log.id}
                                                            className="text-text-tertiary hover:text-error transition-colors disabled:opacity-50"
                                                            title="Delete reading"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    </section>
                )}
            </div>

            {/* Log Reading Modal */}
            <LogReadingModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSubmit={handleLogSubmit}
                isSubmitting={isSubmitting}
            />
        </PageContainer>
    );
}
