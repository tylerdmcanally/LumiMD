'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDistanceToNow, format } from 'date-fns';
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
    MessageSquare,
    ChevronRight,
    Droplets,
    Scale,
    ArrowRight,
    TrendingUp,
    TrendingDown,
    Minus,
    Calendar,
    Zap,
    FileBarChart,
    ListTodo,
    RefreshCw,
    Printer,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    useCareQuickOverview,
    useCareTrends,
    useCareTasksPage,
    useCreateCareTask,
    useUpdateCareTask,
    useDeleteCareTask,
    useCareSummaryExport,
    CareTask,
} from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const CARE_TASKS_PAGE_SIZE = 25;

// =============================================================================
// Patient Detail Page
// =============================================================================

export default function PatientDetailPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const {
        data: quickOverview,
        isLoading: overviewLoading,
        isFetching: overviewFetching,
        error: quickOverviewError,
        refetch: refetchOverview,
    } = useCareQuickOverview(patientId);

    // New data hooks for enhanced features
    const { data: trendsData, isLoading: trendsLoading, refetch: refetchTrends } = useCareTrends(patientId, { days: 30 });
    const { refetch: fetchExport, isFetching: exportFetching } = useCareSummaryExport(patientId);
    const isRefreshing = overviewFetching && !overviewLoading;

    const handleRefreshAll = React.useCallback(() => {
        refetchOverview();
        refetchTrends();
    }, [refetchOverview, refetchTrends]);

    const handleExportPrint = React.useCallback(async () => {
        const result = await fetchExport();
        const data = result.data;
        if (!data) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const doc = printWindow.document;
        doc.open();

        const style = doc.createElement('style');
        style.textContent = [
            'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #1a1a1a; }',
            'h1 { font-size: 24px; margin-bottom: 4px; }',
            'h2 { font-size: 18px; margin-top: 24px; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; }',
            '.subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }',
            '.stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0; }',
            '.stat { background: #f9f9f9; padding: 12px; border-radius: 6px; }',
            '.stat-label { font-size: 12px; color: #666; text-transform: uppercase; }',
            '.stat-value { font-size: 20px; font-weight: 600; }',
            'table { width: 100%; border-collapse: collapse; margin: 12px 0; }',
            'th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-size: 14px; }',
            'th { font-weight: 600; background: #f5f5f5; }',
            '.overdue { color: #991b1b; font-weight: 500; }',
            '.footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #999; }',
            '@media print { body { padding: 0; } }',
        ].join('\n');
        doc.head.appendChild(style);
        doc.title = `Care Summary - ${data.patient.name}`;

        const body = doc.body;
        const h1 = doc.createElement('h1');
        h1.textContent = `Care Summary: ${data.patient.name}`;
        body.appendChild(h1);

        const sub = doc.createElement('p');
        sub.className = 'subtitle';
        sub.textContent = `Generated ${new Date(data.generatedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        body.appendChild(sub);

        // Stats grid
        const statsGrid = doc.createElement('div');
        statsGrid.className = 'stat-grid';
        const statEntries: [string, number][] = [
            ['Visits', data.overview.totalVisits],
            ['Active Medications', data.overview.activeMedications],
            ['Pending Actions', data.overview.pendingActions],
            ['Conditions', data.overview.totalConditions],
        ];
        for (const [label, value] of statEntries) {
            const stat = doc.createElement('div');
            stat.className = 'stat';
            const lbl = doc.createElement('div');
            lbl.className = 'stat-label';
            lbl.textContent = label;
            const val = doc.createElement('div');
            val.className = 'stat-value';
            val.textContent = String(value);
            stat.appendChild(lbl);
            stat.appendChild(val);
            statsGrid.appendChild(stat);
        }
        body.appendChild(statsGrid);

        // Conditions
        if (data.conditions.length > 0) {
            const h2 = doc.createElement('h2');
            h2.textContent = 'Conditions';
            body.appendChild(h2);
            const ul = doc.createElement('ul');
            for (const c of data.conditions) {
                const li = doc.createElement('li');
                li.textContent = c;
                ul.appendChild(li);
            }
            body.appendChild(ul);
        }

        // Medications table
        if (data.currentMedications.length > 0) {
            const h2 = doc.createElement('h2');
            h2.textContent = 'Current Medications';
            body.appendChild(h2);
            const table = doc.createElement('table');
            const thead = doc.createElement('thead');
            const headerRow = doc.createElement('tr');
            for (const col of ['Medication', 'Dosage', 'Frequency', 'Instructions']) {
                const th = doc.createElement('th');
                th.textContent = col;
                headerRow.appendChild(th);
            }
            thead.appendChild(headerRow);
            table.appendChild(thead);
            const tbody = doc.createElement('tbody');
            for (const med of data.currentMedications) {
                const tr = doc.createElement('tr');
                for (const val of [med.name, med.dosage || '-', med.frequency || '-', med.instructions || '-']) {
                    const td = doc.createElement('td');
                    td.textContent = val;
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            body.appendChild(table);
        }

        // Pending actions table
        if (data.pendingActions.length > 0) {
            const h2 = doc.createElement('h2');
            h2.textContent = 'Pending Action Items';
            body.appendChild(h2);
            const table = doc.createElement('table');
            const thead = doc.createElement('thead');
            const headerRow = doc.createElement('tr');
            for (const col of ['Action', 'Due Date', 'Priority']) {
                const th = doc.createElement('th');
                th.textContent = col;
                headerRow.appendChild(th);
            }
            thead.appendChild(headerRow);
            table.appendChild(thead);
            const tbody = doc.createElement('tbody');
            const todayStr = new Date().toISOString().slice(0, 10);
            for (const action of data.pendingActions) {
                const tr = doc.createElement('tr');
                const tdTitle = doc.createElement('td');
                tdTitle.textContent = action.title;
                tr.appendChild(tdTitle);
                const tdDue = doc.createElement('td');
                if (action.dueDate) {
                    const dueStr = new Date(action.dueDate).toISOString().slice(0, 10);
                    tdDue.textContent = new Date(action.dueDate).toLocaleDateString();
                    if (dueStr < todayStr) {
                        tdDue.classList.add('overdue');
                        tdDue.textContent += ' (overdue)';
                    }
                } else {
                    tdDue.textContent = '-';
                }
                tr.appendChild(tdDue);
                const tdPri = doc.createElement('td');
                tdPri.textContent = action.priority || 'normal';
                tr.appendChild(tdPri);
                tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            body.appendChild(table);
        }

        // Recent visits
        if (data.recentVisits.length > 0) {
            const h2 = doc.createElement('h2');
            h2.textContent = 'Recent Visits';
            body.appendChild(h2);
            for (const visit of data.recentVisits) {
                const h3 = doc.createElement('h3');
                const dateLabel = visit.date ? new Date(visit.date).toLocaleDateString() : 'Unknown date';
                h3.textContent = `${dateLabel} — ${visit.provider || 'Unknown provider'}${visit.specialty ? ` (${visit.specialty})` : ''}`;
                body.appendChild(h3);
                if (visit.summary) {
                    const p = doc.createElement('p');
                    p.style.fontSize = '14px';
                    p.style.color = '#444';
                    p.textContent = visit.summary;
                    body.appendChild(p);
                }
            }
        }

        const footer = doc.createElement('div');
        footer.className = 'footer';
        footer.textContent = 'Generated by LumiMD Care Portal';
        body.appendChild(footer);

        doc.close();
        printWindow.onload = () => printWindow.print();
    }, [fetchExport]);

    const [tasksCursor, setTasksCursor] = React.useState<string | null>(null);
    const [taskItems, setTaskItems] = React.useState<CareTask[]>([]);
    const [tasksHasMore, setTasksHasMore] = React.useState(false);
    const [tasksNextCursor, setTasksNextCursor] = React.useState<string | null>(null);
    const [taskSummary, setTaskSummary] = React.useState({
        pending: 0,
        inProgress: 0,
        completed: 0,
        overdue: 0,
    });
    const {
        data: careTasksPage,
        isLoading: careTasksLoading,
        isFetching: careTasksFetching,
    } = useCareTasksPage(patientId, {
        limit: CARE_TASKS_PAGE_SIZE,
        cursor: tasksCursor,
    });
    const careTasks = React.useMemo(
        () => ({
            tasks: taskItems,
            summary: taskSummary,
        }),
        [taskItems, taskSummary],
    );

    const upcomingActions = quickOverview?.upcomingActions;
    const actionsLoading = overviewLoading;
    const medChanges = quickOverview?.recentMedicationChanges;
    const medChangesLoading = overviewLoading;

    // Task mutations
    const createTask = useCreateCareTask();
    const updateTask = useUpdateCareTask();
    const deleteTask = useDeleteCareTask();

    const resetTaskPagination = React.useCallback(() => {
        setTasksCursor(null);
        setTaskItems([]);
        setTasksHasMore(false);
        setTasksNextCursor(null);
        setTaskSummary({
            pending: 0,
            inProgress: 0,
            completed: 0,
            overdue: 0,
        });
    }, []);

    React.useEffect(() => {
        resetTaskPagination();
    }, [patientId, resetTaskPagination]);

    React.useEffect(() => {
        if (!careTasksPage) return;
        setTaskItems((previous) => {
            const byId = new Map<string, CareTask>();
            previous.forEach((task) => byId.set(task.id, task));
            careTasksPage.tasks.forEach((task) => byId.set(task.id, task));
            return Array.from(byId.values());
        });
        setTasksHasMore(careTasksPage.hasMore);
        setTasksNextCursor(careTasksPage.nextCursor);
        setTaskSummary(careTasksPage.summary);
    }, [careTasksPage]);

    // Task dialog state
    const [isTaskDialogOpen, setIsTaskDialogOpen] = React.useState(false);
    const [editingTask, setEditingTask] = React.useState<CareTask | null>(null);
    const [taskForm, setTaskForm] = React.useState({
        title: '',
        description: '',
        dueDate: '',
        priority: 'medium' as 'high' | 'medium' | 'low',
    });

    const handleOpenTaskDialog = (task?: CareTask) => {
        if (task) {
            setEditingTask(task);
            setTaskForm({
                title: task.title,
                description: task.description || '',
                dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
                priority: task.priority,
            });
        } else {
            setEditingTask(null);
            setTaskForm({ title: '', description: '', dueDate: '', priority: 'medium' });
        }
        setIsTaskDialogOpen(true);
    };

    const handleSaveTask = async () => {
        if (!taskForm.title.trim()) return;

        try {
            if (editingTask) {
                await updateTask.mutateAsync({
                    patientId,
                    taskId: editingTask.id,
                    data: {
                        title: taskForm.title,
                        description: taskForm.description || undefined,
                        dueDate: taskForm.dueDate || null,
                        priority: taskForm.priority,
                    },
                });
            } else {
                await createTask.mutateAsync({
                    patientId,
                    title: taskForm.title,
                    description: taskForm.description || undefined,
                    dueDate: taskForm.dueDate || null,
                    priority: taskForm.priority,
                });
            }
            setIsTaskDialogOpen(false);
            setEditingTask(null);
            resetTaskPagination();
        } catch (error) {
            console.error('Failed to save task:', error);
        }
    };

    const handleToggleTaskStatus = async (task: CareTask) => {
        try {
            await updateTask.mutateAsync({
                patientId,
                taskId: task.id,
                data: {
                    status: task.status === 'completed' ? 'pending' : 'completed',
                },
            });
            resetTaskPagination();
        } catch (error) {
            console.error('Failed to update task:', error);
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        try {
            await deleteTask.mutateAsync({ patientId, taskId });
            resetTaskPagination();
        } catch (error) {
            console.error('Failed to delete task:', error);
        }
    };

    const isLoading = overviewLoading;

    if (isLoading) {
        return (
            <PageContainer maxWidth="2xl">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                </div>
            </PageContainer>
        );
    }

    if (quickOverviewError) {
        return (
            <PageContainer maxWidth="lg">
                <Card variant="elevated" padding="lg" className="text-center py-12">
                    <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        Unable to load patient data
                    </h2>
                    <p className="text-text-secondary mb-4">
                        {quickOverviewError.message || 'An error occurred while loading this patient.'}
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
    const medSummary = quickOverview?.todaysMeds || { total: 0, taken: 0, pending: 0, missed: 0, skipped: 0 };
    const medProgress = medSummary.total > 0
        ? Math.round((medSummary.taken / medSummary.total) * 100)
        : 0;
    const unscheduledMedications = quickOverview?.unscheduledMedications || [];
    const lastActivity = quickOverview?.lastActivity;

    // Coverage and trends data
    const coverage = trendsData?.coverage;
    const adherenceTrend = trendsData?.adherence;

    return (
        <PageContainer maxWidth="2xl">
            <div className="space-y-8 animate-fade-in-up">
                {/* Hero Header */}
                <div className="rounded-2xl bg-hero-brand p-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
                    <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
                        <Link href="/care" className="inline-flex items-center gap-2 text-text-secondary hover:text-brand-primary">
                            <ArrowLeft className="h-4 w-4" />
                            <span>Back to Care Dashboard</span>
                        </Link>
                    </Button>
                    <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                            Patient Overview
                        </span>
                        <h1 className="text-3xl font-bold text-text-primary lg:text-4xl">
                            Quick Summary
                        </h1>
                        <p className="text-sm text-text-secondary">
                            Today's snapshot ({quickOverview?.date || 'today'})
                            {lastActivity && (
                                <span className="ml-3 inline-flex items-center gap-1.5">
                                    <span className={cn(
                                        'w-2 h-2 rounded-full',
                                        (() => {
                                            const hoursAgo = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);
                                            if (hoursAgo < 4) return 'bg-success';
                                            if (hoursAgo < 24) return 'bg-warning';
                                            return 'bg-error';
                                        })()
                                    )} />
                                    <span>Last activity {formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}</span>
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefreshAll}
                            disabled={isRefreshing}
                        >
                            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
                            {isRefreshing ? 'Refreshing...' : 'Refresh'}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportPrint}
                            disabled={exportFetching}
                        >
                            <Printer className={cn('h-4 w-4 mr-2', exportFetching && 'animate-pulse')} />
                            {exportFetching ? 'Generating...' : 'Print Summary'}
                        </Button>
                    </div>
                    </div>
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
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-subtle text-text-muted">
                                    <Pill className="h-5 w-5" />
                                </div>
                                <h2 className="text-lg font-semibold text-text-primary">Today's Medications</h2>
                            </div>
                            <Link 
                                href={`/care/${patientId}/medications`}
                                className="text-sm font-medium text-text-secondary hover:text-brand-primary flex items-center gap-1"
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

                        {/* Unscheduled medications notice */}
                        {unscheduledMedications.length > 0 && (
                            <div className="mt-4 p-3 rounded-lg bg-warning-light/50 border border-warning/20">
                                <p className="text-xs font-medium text-warning-dark mb-1">
                                    {unscheduledMedications.length} medication{unscheduledMedications.length > 1 ? 's' : ''} not being tracked
                                </p>
                                <p className="text-xs text-text-secondary">
                                    {unscheduledMedications.map((m) => m.medicationName).join(', ')}
                                    {' '}&mdash; no reminder schedule set up
                                </p>
                            </div>
                        )}
                    </Card>

                    {/* Health Snapshot */}
                    <Card variant="elevated" padding="lg">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-subtle text-text-muted">
                                    <Heart className="h-5 w-5" />
                                </div>
                                <h2 className="text-lg font-semibold text-text-primary">Health Snapshot</h2>
                            </div>
                            <Link 
                                href={`/care/${patientId}/health`}
                                className="text-sm font-medium text-text-secondary hover:text-brand-primary flex items-center gap-1"
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

                {/* Two-column grid for Upcoming Actions + Recent Med Changes */}
                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Upcoming Action Items */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background-subtle text-text-muted">
                                    <ListTodo className="h-4 w-4" />
                                </div>
                                <h2 className="text-lg font-semibold text-text-primary">Upcoming Actions</h2>
                            </div>
                            <Link
                                href={`/care/${patientId}/actions`}
                                className="text-sm font-medium text-text-secondary hover:text-brand-primary flex items-center gap-1"
                            >
                                View all
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                        <Card variant="elevated" padding="none" className="overflow-hidden">
                            {actionsLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                                </div>
                            ) : !upcomingActions?.actions?.length ? (
                                <div className="p-5 text-center">
                                    <CheckCircle className="h-8 w-8 text-success mx-auto mb-2" />
                                    <p className="text-sm text-text-secondary">No pending actions</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border-light">
                                    {upcomingActions.actions.slice(0, 4).map((action) => (
                                        <div
                                            key={action.id}
                                            className={cn(
                                                'flex items-start gap-3 px-4 py-3',
                                                action.isOverdue && 'bg-error/5'
                                            )}
                                        >
                                            <div className={cn(
                                                'w-2 h-2 rounded-full mt-2 shrink-0',
                                                action.isOverdue ? 'bg-error' : action.daysUntilDue !== null && action.daysUntilDue <= 3 ? 'bg-warning' : 'bg-text-muted'
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-text-primary line-clamp-2">
                                                    {action.description}
                                                </p>
                                                <p className={cn(
                                                    'text-xs mt-0.5',
                                                    action.isOverdue ? 'text-error-dark font-medium' : 'text-text-muted'
                                                )}>
                                                    {action.isOverdue
                                                        ? `Overdue by ${Math.abs(action.daysUntilDue || 0)} days`
                                                        : action.dueAt
                                                            ? `Due ${formatDistanceToNow(new Date(action.dueAt), { addSuffix: true })}`
                                                            : 'No due date'}
                                                </p>
                                            </div>
                                            {action.isOverdue && (
                                                <Badge tone="danger" variant="soft" size="sm">
                                                    Overdue
                                                </Badge>
                                            )}
                                        </div>
                                    ))}
                                    {/* Summary footer */}
                                    {upcomingActions.summary && (upcomingActions.summary.overdue > 0 || upcomingActions.summary.dueThisWeek > 0) && (
                                        <div className="px-4 py-2 bg-background-subtle flex items-center justify-between text-xs">
                                            <span className="text-text-muted">
                                                {upcomingActions.summary.overdue > 0 && (
                                                    <span className="text-error-dark font-medium mr-3">
                                                        {upcomingActions.summary.overdue} overdue
                                                    </span>
                                                )}
                                                {upcomingActions.summary.dueThisWeek > 0 && (
                                                    <span>{upcomingActions.summary.dueThisWeek} due this week</span>
                                                )}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    </section>

                    {/* Recent Medication Changes */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background-subtle text-text-muted">
                                    <Zap className="h-4 w-4" />
                                </div>
                                <h2 className="text-lg font-semibold text-text-primary">Recent Med Changes</h2>
                            </div>
                            <Link
                                href={`/care/${patientId}/medications`}
                                className="text-sm font-medium text-text-secondary hover:text-brand-primary flex items-center gap-1"
                            >
                                View all
                                <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                        <Card variant="elevated" padding="none" className="overflow-hidden">
                            {medChangesLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                                </div>
                            ) : !medChanges?.changes?.length ? (
                                <div className="p-5 text-center">
                                    <Pill className="h-8 w-8 text-text-muted mx-auto mb-2" />
                                    <p className="text-sm text-text-secondary">No changes in the last 30 days</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-border-light">
                                    {medChanges.changes.slice(0, 4).map((change) => (
                                        <div key={`${change.id}-${change.changeType}`} className="flex items-center gap-3 px-4 py-3">
                                            <div className={cn(
                                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                                change.changeType === 'started' && 'bg-success-light text-success-dark',
                                                change.changeType === 'stopped' && 'bg-error-light text-error-dark',
                                                change.changeType === 'modified' && 'bg-warning-light text-warning-dark'
                                            )}>
                                                {change.changeType === 'started' && <TrendingUp className="h-4 w-4" />}
                                                {change.changeType === 'stopped' && <TrendingDown className="h-4 w-4" />}
                                                {change.changeType === 'modified' && <Activity className="h-4 w-4" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-text-primary truncate">
                                                    {change.name}
                                                </p>
                                                <p className="text-xs text-text-muted">
                                                    {change.changeType === 'started' && 'Started'}
                                                    {change.changeType === 'stopped' && 'Stopped'}
                                                    {change.changeType === 'modified' && 'Modified'}
                                                    {change.dose && ` · ${change.dose}`}
                                                    {' · '}
                                                    {formatDistanceToNow(new Date(change.changeDate), { addSuffix: true })}
                                                </p>
                                            </div>
                                            <Badge
                                                tone={change.changeType === 'started' ? 'success' : change.changeType === 'stopped' ? 'danger' : 'warning'}
                                                variant="soft"
                                                size="sm"
                                            >
                                                {change.changeType}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </section>
                </div>

                {/* Data Coverage Card */}
                {coverage && (
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background-subtle text-text-muted">
                                <FileBarChart className="h-4 w-4" />
                            </div>
                            <h2 className="text-lg font-semibold text-text-primary">Data Coverage</h2>
                            <span className="text-xs text-text-muted">(Last 30 days)</span>
                        </div>
                        <Card variant="elevated" padding="md">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {/* Vitals Coverage */}
                                <div className="text-center">
                                    <div className={cn(
                                        'text-2xl font-bold',
                                        coverage.vitalsCoveragePercent >= 70 ? 'text-success-dark' :
                                        coverage.vitalsCoveragePercent >= 40 ? 'text-warning-dark' : 'text-error-dark'
                                    )}>
                                        {coverage.vitalsCoveragePercent}%
                                    </div>
                                    <p className="text-xs text-text-muted">Vitals Logged</p>
                                    <p className="text-xs text-text-muted">
                                        {coverage.vitalsLogged}/{coverage.vitalsExpected} days
                                    </p>
                                </div>

                                {/* Last Vital */}
                                <div className="text-center">
                                    <div className={cn(
                                        'text-2xl font-bold',
                                        coverage.daysWithoutVitals <= 3 ? 'text-success-dark' :
                                        coverage.daysWithoutVitals <= 7 ? 'text-warning-dark' : 'text-error-dark'
                                    )}>
                                        {coverage.daysWithoutVitals}
                                    </div>
                                    <p className="text-xs text-text-muted">Days Since Vital</p>
                                    {coverage.lastVitalDate && (
                                        <p className="text-xs text-text-muted">
                                            {format(new Date(coverage.lastVitalDate), 'MMM d')}
                                        </p>
                                    )}
                                </div>

                                {/* Last Visit */}
                                <div className="text-center">
                                    <div className={cn(
                                        'text-2xl font-bold',
                                        coverage.daysWithoutVisit <= 30 ? 'text-success-dark' :
                                        coverage.daysWithoutVisit <= 90 ? 'text-warning-dark' : 'text-text-muted'
                                    )}>
                                        {coverage.daysWithoutVisit > 365 ? '365+' : coverage.daysWithoutVisit}
                                    </div>
                                    <p className="text-xs text-text-muted">Days Since Visit</p>
                                    {coverage.lastVisitDate && (
                                        <p className="text-xs text-text-muted">
                                            {format(new Date(coverage.lastVisitDate), 'MMM d')}
                                        </p>
                                    )}
                                </div>

                                {/* Adherence Trend */}
                                {adherenceTrend && (
                                    <div className="text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <span className={cn(
                                                'text-2xl font-bold',
                                                adherenceTrend.current >= 80 ? 'text-success-dark' :
                                                adherenceTrend.current >= 60 ? 'text-warning-dark' : 'text-error-dark'
                                            )}>
                                                {adherenceTrend.current}%
                                            </span>
                                            {adherenceTrend.direction === 'up' && <TrendingUp className="h-4 w-4 text-success" />}
                                            {adherenceTrend.direction === 'down' && <TrendingDown className="h-4 w-4 text-error" />}
                                            {adherenceTrend.direction === 'stable' && <Minus className="h-4 w-4 text-text-muted" />}
                                        </div>
                                        <p className="text-xs text-text-muted">Adherence</p>
                                        {adherenceTrend.streak > 0 && (
                                            <p className="text-xs text-success-dark font-medium">
                                                {adherenceTrend.streak} day streak
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Stale data warning */}
                            {coverage.isStale && (
                                <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-3">
                                    <AlertTriangle className="h-5 w-5 text-warning shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium text-warning-dark">Data is getting stale</p>
                                        <p className="text-xs text-text-secondary">
                                            No health readings in {coverage.daysWithoutVitals} days. Consider checking in.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </Card>
                    </section>
                )}

                {/* Recent Activity */}
                {recentActivity.length > 0 && (
                    <section>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background-subtle text-text-muted">
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
                                            activity.type === 'health_log' && 'bg-background-subtle text-text-muted',
                                            activity.type === 'visit' && 'bg-background-subtle text-text-muted'
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
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
                        <QuickActionCard
                            href={`/care/${patientId}/messages`}
                            icon={<MessageSquare className="h-5 w-5" />}
                            label="Messages"
                            variant="brand"
                        />
                    </div>
                </section>

                {/* Care Plan / My Tasks */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background-subtle text-text-muted">
                                <CheckSquare className="h-4 w-4" />
                            </div>
                            <h2 className="text-lg font-semibold text-text-primary">My Care Tasks</h2>
                            {careTasks?.summary && (
                                <Badge tone="neutral" variant="soft" size="sm">
                                    {careTasks.summary.pending + careTasks.summary.inProgress} active
                                </Badge>
                            )}
                        </div>
                        <Button variant="primary" size="sm" onClick={() => handleOpenTaskDialog()}>
                            + Add Task
                        </Button>
                    </div>
                    <Card variant="elevated" padding="none" className="overflow-hidden">
                        {careTasksLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
                            </div>
                        ) : !careTasks?.tasks?.length ? (
                            <div className="p-8 text-center">
                                <CheckSquare className="h-10 w-10 text-text-muted mx-auto mb-3" />
                                <p className="text-sm font-medium text-text-primary mb-1">No tasks yet</p>
                                <p className="text-xs text-text-secondary mb-4">
                                    Create tasks to track things you need to do for this patient
                                </p>
                                <Button variant="secondary" size="sm" onClick={() => handleOpenTaskDialog()}>
                                    Create your first task
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="divide-y divide-border-light">
                                    {careTasks.tasks.map((task) => {
                                        const isOverdue = task.status !== 'completed' && task.dueDate && new Date(task.dueDate) < new Date();
                                        return (
                                            <div
                                                key={task.id}
                                                className={cn(
                                                    'flex items-start gap-3 px-4 py-3 group hover:bg-hover transition-colors',
                                                    task.status === 'completed' && 'opacity-60',
                                                    isOverdue && 'bg-error/5'
                                                )}
                                            >
                                                <button
                                                    onClick={() => handleToggleTaskStatus(task)}
                                                    className={cn(
                                                        'mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                                                        task.status === 'completed'
                                                            ? 'bg-success border-success text-white'
                                                            : 'border-border-medium hover:border-brand-primary'
                                                    )}
                                                >
                                                    {task.status === 'completed' && <CheckCircle className="h-3 w-3" />}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className={cn(
                                                        'text-sm font-medium',
                                                        task.status === 'completed' ? 'text-text-muted line-through' : 'text-text-primary'
                                                    )}>
                                                        {task.title}
                                                    </p>
                                                    {task.description && (
                                                        <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">
                                                            {task.description}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {task.dueDate && (
                                                            <span className={cn(
                                                                'text-xs',
                                                                isOverdue ? 'text-error-dark font-medium' : 'text-text-muted'
                                                            )}>
                                                                {isOverdue ? 'Overdue: ' : 'Due: '}
                                                                {format(new Date(task.dueDate), 'MMM d')}
                                                            </span>
                                                        )}
                                                        <Badge
                                                            tone={task.priority === 'high' ? 'danger' : task.priority === 'low' ? 'neutral' : 'warning'}
                                                            variant="soft"
                                                            size="sm"
                                                        >
                                                            {task.priority}
                                                        </Badge>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0"
                                                        onClick={() => handleOpenTaskDialog(task)}
                                                    >
                                                        <Activity className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0 text-error hover:text-error-dark"
                                                        onClick={() => handleDeleteTask(task.id)}
                                                    >
                                                        <XCircle className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {(tasksHasMore || careTasksFetching) && (
                                    <div className="px-4 py-3 border-t border-border-light flex justify-center">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={!tasksHasMore || !tasksNextCursor || careTasksFetching}
                                            className="flex items-center gap-2"
                                            onClick={() => {
                                                if (!tasksNextCursor) return;
                                                setTasksCursor(tasksNextCursor);
                                            }}
                                        >
                                            {careTasksFetching && (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            )}
                                            <span>
                                                {careTasksFetching ? 'Loading...' : 'Load more tasks'}
                                            </span>
                                        </Button>
                                    </div>
                                )}
                                {/* Summary footer */}
                                {careTasks.summary && (
                                    <div className="px-4 py-2 bg-background-subtle flex items-center justify-between text-xs border-t border-border-light">
                                        <span className="text-text-muted">
                                            {careTasks.summary.completed} completed
                                            {careTasks.summary.overdue > 0 && (
                                                <span className="text-error-dark font-medium ml-2">
                                                    · {careTasks.summary.overdue} overdue
                                                </span>
                                            )}
                                        </span>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                </section>
            </div>

            {/* Task Dialog */}
            <Dialog open={isTaskDialogOpen} onOpenChange={setIsTaskDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {editingTask ? 'Edit Task' : 'Add Care Task'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="task-title">Title</Label>
                            <Input
                                id="task-title"
                                placeholder="What needs to be done?"
                                value={taskForm.title}
                                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="task-description">Description (optional)</Label>
                            <Textarea
                                id="task-description"
                                placeholder="Add more details..."
                                value={taskForm.description}
                                onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="task-due">Due Date (optional)</Label>
                                <Input
                                    id="task-due"
                                    type="date"
                                    value={taskForm.dueDate}
                                    onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="task-priority">Priority</Label>
                                <Select
                                    value={taskForm.priority}
                                    onValueChange={(value: 'high' | 'medium' | 'low') => setTaskForm({ ...taskForm, priority: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setIsTaskDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveTask}
                            disabled={!taskForm.title.trim() || createTask.isPending || updateTask.isPending}
                        >
                            {createTask.isPending || updateTask.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : editingTask ? (
                                'Save Changes'
                            ) : (
                                'Add Task'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
        brand: 'bg-background-subtle text-text-muted',
        error: 'bg-background-subtle text-text-muted',
        info: 'bg-background-subtle text-text-muted',
        success: 'bg-background-subtle text-text-muted',
        warning: 'bg-background-subtle text-text-muted',
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
        brand: 'bg-background-subtle text-text-muted',
        error: 'bg-background-subtle text-text-muted',
        info: 'bg-background-subtle text-text-muted',
        success: 'bg-background-subtle text-text-muted',
        warning: 'bg-background-subtle text-text-muted',
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
