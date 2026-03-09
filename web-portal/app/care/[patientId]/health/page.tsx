'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Heart,
  Droplets,
  Scale,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Calendar,
  ArrowRight,
  Bot,
  CheckCircle,
  XCircle,
  Clock,
  MessageCircle,
  Pill,
  Info,
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
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCareHealthLogs, useCareNudgeHistory, type HealthLogEntry, type CareTrendInsight, type NudgeHistoryItem } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

const chartTheme = {
  primary: 'var(--color-brand-primary)',
  accent: 'var(--color-brand-accent)',
  secondary: 'var(--color-brand-secondary)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  grid: 'var(--color-border)',
  tick: 'var(--color-text-tertiary)',
};

type MetricType = 'bp' | 'glucose' | 'weight';

export default function HealthMetricsPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;

  const [selectedMetric, setSelectedMetric] = React.useState<MetricType>('bp');
  const [dateRange, setDateRange] = React.useState<number>(30);

  const { data, isLoading, error } = useCareHealthLogs(patientId, { days: dateRange });
  const { data: nudgeData } = useCareNudgeHistory(patientId, { days: dateRange });

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
          <p className="text-sm text-text-secondary">Loading health metrics...</p>
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
            Unable to load health metrics
          </h2>
          <p className="text-text-secondary mb-4">
            {error.message || 'An error occurred while loading health data.'}
          </p>
          <Button variant="secondary" asChild>
            <Link href={`/care/${patientId}`} className="inline-flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Overview</span>
            </Link>
          </Button>
        </Card>
      </PageContainer>
    );
  }

  const { logs, summary, alerts, insights } = data || { logs: [], summary: null, alerts: null, insights: [] };

  // Filter logs by selected metric
  const filteredLogs = logs.filter((log) => log.type === selectedMetric);

  // Prepare chart data (reverse to show oldest first for chart)
  const chartData = [...filteredLogs].reverse().map((log) => {
    const date = new Date(log.createdAt);
    return {
      date: format(date, 'MMM d'),
      fullDate: format(date, 'MMM d, yyyy h:mm a'),
      ...getChartValue(log),
    };
  });

  const hasAlerts = alerts && (alerts.emergency > 0 || alerts.warning > 0);

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-8 animate-fade-in-up">
        {/* Hero Header */}
        <div className="rounded-2xl bg-hero-brand p-6">
          <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
            <Link href={`/care/${patientId}`} className="inline-flex items-center gap-2 text-text-secondary hover:text-brand-primary">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Overview</span>
            </Link>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Health Tracking
              </span>
              <h1 className="text-2xl font-bold text-text-primary sm:text-3xl lg:text-4xl">
                Health Metrics
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                Track blood pressure, glucose, and weight trends
              </p>
            </div>
            <Select value={String(dateRange)} onValueChange={(v) => setDateRange(Number(v))}>
              <SelectTrigger className="w-full sm:w-40 bg-surface">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Alert Banner */}
        {hasAlerts && (
          <Card variant="flat" padding="md" className="bg-warning-light border-warning/30">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
                <AlertTriangle className="h-5 w-5 text-warning-dark" />
              </div>
              <div>
                <p className="font-semibold text-warning-dark">
                  {alerts.emergency > 0 && `${alerts.emergency} emergency alert${alerts.emergency > 1 ? 's' : ''}`}
                  {alerts.emergency > 0 && alerts.warning > 0 && ', '}
                  {alerts.warning > 0 && `${alerts.warning} warning${alerts.warning > 1 ? 's' : ''}`}
                </p>
                <p className="text-sm text-warning-dark/80">
                  Review flagged readings below
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Summary Cards */}
        <section>
          <h2 className="text-lg font-semibold text-text-primary mb-4">Overview</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard
              title="Blood Pressure"
              icon={<Heart className="h-5 w-5" />}
              value={summary?.bp.latest ? `${summary.bp.latest.systolic}/${summary.bp.latest.diastolic}` : null}
              unit="mmHg"
              trend={summary?.bp.trend}
              alertLevel={summary?.bp.latestAlertLevel}
              lastUpdated={summary?.bp.latestDate}
              subtitle={summary?.bp.avgSystolic ? `Avg: ${summary.bp.avgSystolic}/${summary.bp.avgDiastolic}` : undefined}
              count={summary?.bp.count || 0}
              isSelected={selectedMetric === 'bp'}
              onClick={() => setSelectedMetric('bp')}
              variant="error"
            />
            <MetricCard
              title="Blood Glucose"
              icon={<Droplets className="h-5 w-5" />}
              value={summary?.glucose.latest?.reading ?? null}
              unit="mg/dL"
              trend={summary?.glucose.trend}
              alertLevel={summary?.glucose.latestAlertLevel}
              lastUpdated={summary?.glucose.latestDate}
              subtitle={summary?.glucose.avg ? `Avg: ${summary.glucose.avg} (${summary.glucose.min}-${summary.glucose.max})` : undefined}
              count={summary?.glucose.count || 0}
              isSelected={selectedMetric === 'glucose'}
              onClick={() => setSelectedMetric('glucose')}
              variant="info"
            />
            <MetricCard
              title="Weight"
              icon={<Scale className="h-5 w-5" />}
              value={summary?.weight.latest?.weight ?? null}
              unit={summary?.weight.latest?.unit || 'lbs'}
              trend={summary?.weight.trend}
              lastUpdated={summary?.weight.latestDate}
              subtitle={summary?.weight.change ? `${summary.weight.change > 0 ? '+' : ''}${summary.weight.change} ${summary.weight.latest?.unit || 'lbs'} change` : undefined}
              count={summary?.weight.count || 0}
              isSelected={selectedMetric === 'weight'}
              onClick={() => setSelectedMetric('weight')}
              variant="brand"
            />
          </div>
        </section>

        {/* Chart */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">
              {selectedMetric === 'bp' && 'Blood Pressure Trend'}
              {selectedMetric === 'glucose' && 'Blood Glucose Trend'}
              {selectedMetric === 'weight' && 'Weight Trend'}
            </h2>
            <Badge tone="neutral" variant="soft">
              {filteredLogs.length} reading{filteredLogs.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <Card variant="elevated" padding="lg">
            {chartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
                    <XAxis 
                      dataKey="date" 
                      stroke={chartTheme.tick} 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke={chartTheme.tick} 
                      fontSize={12}
                      tickLine={false}
                      domain={getYAxisDomain(selectedMetric)}
                    />
                    <Tooltip 
                      content={<CustomTooltip metric={selectedMetric} />}
                    />
                    {selectedMetric === 'bp' && (
                      <>
                        <Line
                          type="monotone"
                          dataKey="systolic"
                          stroke={chartTheme.error}
                          strokeWidth={2}
                          dot={{ fill: chartTheme.error, strokeWidth: 0, r: 4 }}
                          name="Systolic"
                        />
                        <Line
                          type="monotone"
                          dataKey="diastolic"
                          stroke={chartTheme.primary}
                          strokeWidth={2}
                          dot={{ fill: chartTheme.primary, strokeWidth: 0, r: 4 }}
                          name="Diastolic"
                        />
                        <ReferenceLine y={120} stroke={chartTheme.warning} strokeDasharray="5 5" />
                        <ReferenceLine y={80} stroke={chartTheme.warning} strokeDasharray="5 5" />
                      </>
                    )}
                    {selectedMetric === 'glucose' && (
                      <>
                        <Line
                          type="monotone"
                          dataKey="reading"
                          stroke={chartTheme.accent}
                          strokeWidth={2}
                          dot={{ fill: chartTheme.accent, strokeWidth: 0, r: 4 }}
                          name="Glucose"
                        />
                        <ReferenceLine y={100} stroke={chartTheme.success} strokeDasharray="5 5" />
                        <ReferenceLine y={140} stroke={chartTheme.warning} strokeDasharray="5 5" />
                      </>
                    )}
                    {selectedMetric === 'weight' && (
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke={chartTheme.secondary}
                        strokeWidth={2}
                        dot={{ fill: chartTheme.secondary, strokeWidth: 0, r: 4 }}
                        name="Weight"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background-subtle text-text-muted mx-auto mb-3">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <p>No {selectedMetric === 'bp' ? 'blood pressure' : selectedMetric} readings in this period</p>
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* Trend Insights */}
        {insights && insights.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-brand-primary" />
              Trend Insights
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {insights.map((insight, idx) => (
                <InsightCard key={`${insight.type}-${insight.pattern}-${idx}`} insight={insight} />
              ))}
            </div>
            <p className="text-xs text-text-muted mt-3">
              Based on logged data. Share with the care team for clinical interpretation.
            </p>
          </section>
        )}

        {/* LumiBot Check-ins */}
        {nudgeData && nudgeData.nudges.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Bot className="h-5 w-5 text-brand-primary" />
                LumiBot Check-ins
              </h2>
              {nudgeData.stats.total > 0 && (
                <Badge tone="neutral" variant="soft">
                  {nudgeData.stats.responseRate}% response rate
                </Badge>
              )}
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-background-subtle rounded-lg p-3 text-center">
                <p className="text-xl font-semibold text-text-primary">{nudgeData.stats.total}</p>
                <p className="text-xs text-text-muted">Total</p>
              </div>
              <div className="bg-background-subtle rounded-lg p-3 text-center">
                <p className="text-xl font-semibold text-success">{nudgeData.stats.responded}</p>
                <p className="text-xs text-text-muted">Responded</p>
              </div>
              <div className="bg-background-subtle rounded-lg p-3 text-center">
                <p className="text-xl font-semibold text-text-secondary">{nudgeData.stats.dismissed}</p>
                <p className="text-xs text-text-muted">Dismissed</p>
              </div>
              <div className="bg-background-subtle rounded-lg p-3 text-center">
                <p className="text-xl font-semibold text-warning">{nudgeData.stats.pending}</p>
                <p className="text-xs text-text-muted">Pending</p>
              </div>
            </div>

            {/* Recent nudge history */}
            <Card variant="elevated" padding="none" className="overflow-hidden">
              <div className="divide-y divide-border-light">
                {nudgeData.nudges.slice(0, 8).map((nudge) => (
                  <NudgeHistoryRow key={nudge.id} nudge={nudge} />
                ))}
              </div>
            </Card>
          </section>
        )}

        {/* Symptom Check Timeline */}
        <SymptomTimeline nudges={nudgeData?.nudges} />

        {/* Side Effects Timeline */}
        <SideEffectsTimeline nudges={nudgeData?.nudges} />

        {/* Recent Readings Table */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Recent Readings</h2>
          </div>
          <Card variant="elevated" padding="none" className="overflow-hidden">
            <div className="divide-y divide-border-light">
              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-text-muted">
                  No readings recorded in this period
                </div>
              ) : (
                filteredLogs.slice(0, 10).map((log) => (
                  <ReadingRow key={log.id} log={log} />
                ))
              )}
            </div>
          </Card>
        </section>
      </div>
    </PageContainer>
  );
}

// Helper Components

function MetricCard({
  title,
  icon,
  value,
  unit,
  trend,
  alertLevel,
  lastUpdated,
  subtitle,
  count,
  isSelected,
  onClick,
  variant,
}: {
  title: string;
  icon: React.ReactNode;
  value: number | string | null;
  unit: string;
  trend?: 'up' | 'down' | 'stable' | null;
  alertLevel?: string | null;
  lastUpdated?: string | null;
  subtitle?: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
  variant: 'brand' | 'error' | 'info' | 'success' | 'warning';
}) {
  const isAlert = alertLevel === 'warning' || alertLevel === 'emergency';

  const variantClasses = {
    brand: 'bg-background-subtle text-text-muted',
    error: 'bg-background-subtle text-text-muted',
    info: 'bg-background-subtle text-text-muted',
    success: 'bg-background-subtle text-text-muted',
    warning: 'bg-background-subtle text-text-muted',
  };

  return (
    <Card
      variant="elevated"
      padding="none"
      className={cn(
        'overflow-hidden cursor-pointer transition-all duration-150',
        isSelected 
          ? 'ring-2 ring-brand-primary shadow-hover' 
          : 'hover:shadow-hover hover:-translate-y-0.5',
        isAlert && 'ring-2 ring-error/50'
      )}
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            variantClasses[variant]
          )}>
            {icon}
          </div>
          <span className="text-sm font-medium text-text-secondary">{title}</span>
          {isAlert && <AlertTriangle className="h-4 w-4 text-error ml-auto" />}
        </div>

        {value !== null ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-text-primary">{value}</span>
              <span className="text-sm text-text-muted">{unit}</span>
              {trend && <TrendIndicator trend={trend} />}
            </div>
            {subtitle && (
              <p className="text-sm text-text-muted mt-1">{subtitle}</p>
            )}
            {lastUpdated && (
              <p className="text-xs text-text-muted mt-2">
                {formatDistanceToNow(new Date(lastUpdated), { addSuffix: true })}
              </p>
            )}
          </>
        ) : (
          <p className="text-lg text-text-muted">No data</p>
        )}
      </div>
      <div className="px-5 py-3 bg-background-subtle border-t border-border-light">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>{count} reading{count !== 1 ? 's' : ''} in period</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </Card>
  );
}

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return <TrendingUp className="h-4 w-4 text-error" />;
  }
  if (trend === 'down') {
    return <TrendingDown className="h-4 w-4 text-success" />;
  }
  return <Minus className="h-4 w-4 text-text-muted" />;
}

function ReadingRow({ log }: { log: HealthLogEntry }) {
  const date = new Date(log.createdAt);
  const isAlert = log.alertLevel === 'warning' || log.alertLevel === 'emergency';
  const isCaution = log.alertLevel === 'caution';

  const getValueDisplay = () => {
    switch (log.type) {
      case 'bp':
        return `${log.value.systolic}/${log.value.diastolic} mmHg`;
      case 'glucose':
        return `${log.value.reading} mg/dL`;
      case 'weight':
        return `${log.value.weight} ${log.value.unit || 'lbs'}`;
      default:
        return 'Unknown';
    }
  };

  const getAlertBadge = () => {
    if (log.alertLevel === 'emergency') {
      return <Badge tone="danger" variant="soft" size="sm">Emergency</Badge>;
    }
    if (log.alertLevel === 'warning') {
      return <Badge tone="warning" variant="soft" size="sm">Warning</Badge>;
    }
    if (log.alertLevel === 'caution') {
      return <Badge tone="warning" variant="soft" size="sm">Caution</Badge>;
    }
    return <Badge tone="success" variant="soft" size="sm">Normal</Badge>;
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between px-5 py-4 transition-colors',
        isAlert && 'bg-error-light/50',
        isCaution && !isAlert && 'bg-warning-light/50'
      )}
    >
      <div className="flex items-center gap-4">
        <div className="text-sm text-text-muted w-32">
          {format(date, 'MMM d, h:mm a')}
        </div>
        <div className="font-medium text-text-primary">
          {getValueDisplay()}
        </div>
      </div>
      {getAlertBadge()}
    </div>
  );
}

function CustomTooltip({ active, payload, metric }: any) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-surface rounded-lg shadow-floating border border-border-light p-3">
      <p className="text-xs text-text-muted mb-1">{data.fullDate}</p>
      {metric === 'bp' && (
        <>
          <p className="text-sm"><span className="text-error">Systolic:</span> {data.systolic}</p>
          <p className="text-sm"><span className="text-info">Diastolic:</span> {data.diastolic}</p>
        </>
      )}
      {metric === 'glucose' && (
        <p className="text-sm"><span className="text-brand-accent">Glucose:</span> {data.reading} mg/dL</p>
      )}
      {metric === 'weight' && (
        <p className="text-sm"><span className="text-text-secondary">Weight:</span> {data.weight} {data.unit}</p>
      )}
    </div>
  );
}

function getChartValue(log: HealthLogEntry) {
  switch (log.type) {
    case 'bp':
      return {
        systolic: log.value.systolic,
        diastolic: log.value.diastolic,
      };
    case 'glucose':
      return { reading: log.value.reading };
    case 'weight':
      return { weight: log.value.weight, unit: log.value.unit };
    default:
      return {};
  }
}

function getYAxisDomain(metric: MetricType): [number, number] | ['auto', 'auto'] {
  switch (metric) {
    case 'bp':
      return [40, 200];
    case 'glucose':
      return [50, 300];
    default:
      return ['auto', 'auto'];
  }
}

// =============================================================================
// Trend Insight Card
// =============================================================================

function InsightCard({ insight }: { insight: CareTrendInsight }) {
  const severityConfig = {
    positive: { bg: 'bg-success/10', border: 'border-success/20', icon: 'text-success', iconBg: 'bg-success/20' },
    info: { bg: 'bg-brand-primary/10', border: 'border-brand-primary/20', icon: 'text-brand-primary', iconBg: 'bg-brand-primary/20' },
    attention: { bg: 'bg-warning/10', border: 'border-warning/20', icon: 'text-warning-dark', iconBg: 'bg-warning/20' },
    concern: { bg: 'bg-error/10', border: 'border-error/20', icon: 'text-error', iconBg: 'bg-error/20' },
  };

  const config = severityConfig[insight.severity] || severityConfig.info;

  const trendIcon = insight.data.trend === 'up'
    ? <TrendingUp className="h-4 w-4" />
    : insight.data.trend === 'down'
    ? <TrendingDown className="h-4 w-4" />
    : <Minus className="h-4 w-4" />;

  return (
    <Card variant="flat" padding="md" className={cn('border', config.bg, config.border)}>
      <div className="flex items-start gap-3">
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg shrink-0', config.iconBg, config.icon)}>
          {trendIcon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-text-primary">{insight.title}</p>
          <p className="text-sm text-text-secondary mt-0.5">{insight.message}</p>
        </div>
      </div>
    </Card>
  );
}

// =============================================================================
// Nudge History Row
// =============================================================================

function NudgeHistoryRow({ nudge }: { nudge: NudgeHistoryItem }) {
  const date = new Date(nudge.createdAt);
  const isCompleted = nudge.status === 'completed';
  const isDismissed = nudge.status === 'dismissed';
  const isPending = nudge.status === 'pending' || nudge.status === 'active';

  const getStatusIcon = () => {
    if (isCompleted) return <CheckCircle className="h-4 w-4 text-success" />;
    if (isDismissed) return <XCircle className="h-4 w-4 text-text-muted" />;
    return <Clock className="h-4 w-4 text-warning" />;
  };

  const getResponseLabel = () => {
    if (!nudge.responseValue) return null;
    const val = typeof nudge.responseValue === 'string'
      ? nudge.responseValue
      : (nudge.responseValue as Record<string, unknown>)?.response as string | undefined;

    if (!val) return null;
    const labels: Record<string, { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
      got_it: { text: 'Got it', tone: 'success' },
      taking_it: { text: 'Taking it', tone: 'success' },
      good: { text: 'Feeling good', tone: 'success' },
      okay: { text: 'Feeling okay', tone: 'neutral' },
      not_yet: { text: 'Not yet', tone: 'warning' },
      having_trouble: { text: 'Having trouble', tone: 'danger' },
      issues: { text: 'Issues reported', tone: 'danger' },
      none: { text: 'No side effects', tone: 'success' },
      mild: { text: 'Mild side effects', tone: 'warning' },
      concerning: { text: 'Concerning effects', tone: 'danger' },
      took_it: { text: 'Took it', tone: 'success' },
      skipped_it: { text: 'Skipped', tone: 'warning' },
    };
    const label = labels[val];
    if (!label) return <Badge tone="neutral" variant="soft" size="sm">{val}</Badge>;
    return <Badge tone={label.tone} variant="soft" size="sm">{label.text}</Badge>;
  };

  const getNudgeTypeIcon = () => {
    switch (nudge.actionType) {
      case 'log_bp':
      case 'log_glucose':
      case 'log_weight':
        return <Heart className="h-4 w-4 text-brand-primary" />;
      case 'symptom_check':
        return <MessageCircle className="h-4 w-4 text-warning" />;
      case 'side_effects':
        return <AlertTriangle className="h-4 w-4 text-error" />;
      case 'pickup_check':
      case 'started_check':
      case 'feeling_check':
        return <Pill className="h-4 w-4 text-info" />;
      default:
        return <Bot className="h-4 w-4 text-text-muted" />;
    }
  };

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="shrink-0">{getNudgeTypeIcon()}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{nudge.title}</p>
        <p className="text-xs text-text-muted truncate">{nudge.message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {getResponseLabel()}
        {getStatusIcon()}
      </div>
      <div className="text-xs text-text-muted shrink-0 w-20 text-right">
        {format(date, 'MMM d')}
      </div>
    </div>
  );
}

// =============================================================================
// Symptom Check Timeline
// =============================================================================

function SymptomTimeline({ nudges }: { nudges?: NudgeHistoryItem[] }) {
  const symptomNudges = (nudges || []).filter(
    (n) => n.actionType === 'symptom_check' && n.status === 'completed' && n.responseValue
  );

  if (symptomNudges.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-warning" />
        Symptom Check History
      </h2>
      <Card variant="elevated" padding="none" className="overflow-hidden">
        <div className="divide-y divide-border-light">
          {symptomNudges.slice(0, 10).map((nudge) => {
            const date = new Date(nudge.completedAt || nudge.createdAt);
            const response = nudge.responseValue;
            const data = typeof response === 'object' ? response as Record<string, unknown> : null;

            return (
              <div key={nudge.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-text-primary">{nudge.title}</p>
                  <span className="text-xs text-text-muted">{format(date, 'MMM d, h:mm a')}</span>
                </div>
                {data && (
                  <div className="flex flex-wrap gap-2">
                    {data.breathingDifficulty != null && (
                      <Badge tone={Number(data.breathingDifficulty) >= 4 ? 'danger' : Number(data.breathingDifficulty) >= 3 ? 'warning' : 'success'} variant="soft" size="sm">
                        Breathing: {String(data.breathingDifficulty)}/5
                      </Badge>
                    )}
                    {data.swelling != null && data.swelling !== 'none' && (
                      <Badge tone={data.swelling === 'severe' ? 'danger' : 'warning'} variant="soft" size="sm">
                        Swelling: {String(data.swelling)}
                      </Badge>
                    )}
                    {data.energyLevel != null && (
                      <Badge tone={Number(data.energyLevel) <= 2 ? 'danger' : Number(data.energyLevel) <= 3 ? 'warning' : 'success'} variant="soft" size="sm">
                        Energy: {String(data.energyLevel)}/5
                      </Badge>
                    )}
                    {data.cough === true && (
                      <Badge tone="warning" variant="soft" size="sm">Cough present</Badge>
                    )}
                    {data.orthopnea === true && (
                      <Badge tone="danger" variant="soft" size="sm">Orthopnea</Badge>
                    )}
                  </div>
                )}
                {typeof response === 'string' && (
                  <p className="text-sm text-text-secondary">{response}</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
}

// =============================================================================
// Side Effects Timeline
// =============================================================================

function SideEffectsTimeline({ nudges }: { nudges?: NudgeHistoryItem[] }) {
  const sideEffectNudges = (nudges || []).filter(
    (n) => n.actionType === 'side_effects' && n.status === 'completed' && n.responseValue
  );

  // Also include feeling_check with "issues" and medication trouble responses
  const troubleNudges = (nudges || []).filter((n) => {
    if (n.status !== 'completed' || !n.responseValue) return false;
    const val = typeof n.responseValue === 'string'
      ? n.responseValue
      : (n.responseValue as Record<string, unknown>)?.response;
    return val === 'having_trouble' || val === 'issues' || val === 'concerning';
  });

  const allRelevant = [...sideEffectNudges, ...troubleNudges]
    .filter((v, i, a) => a.findIndex((t) => t.id === v.id) === i) // deduplicate
    .sort((a, b) => new Date(b.completedAt || b.createdAt).getTime() - new Date(a.completedAt || a.createdAt).getTime());

  if (allRelevant.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-error" />
        Side Effects &amp; Medication Issues
      </h2>
      <Card variant="elevated" padding="none" className="overflow-hidden">
        <div className="divide-y divide-border-light">
          {allRelevant.slice(0, 10).map((nudge) => {
            const date = new Date(nudge.completedAt || nudge.createdAt);
            const medName = nudge.context?.medicationName as string | undefined;
            const response = typeof nudge.responseValue === 'string'
              ? nudge.responseValue
              : (nudge.responseValue as Record<string, unknown>)?.response as string | undefined;

            const severityLabel = response === 'concerning'
              ? { text: 'Concerning', tone: 'danger' as const }
              : response === 'mild'
              ? { text: 'Mild', tone: 'warning' as const }
              : { text: 'Issues', tone: 'warning' as const };

            return (
              <div key={nudge.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-error/10 shrink-0">
                  <Pill className="h-4 w-4 text-error" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary">
                    {medName || nudge.title}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {nudge.message}
                  </p>
                </div>
                <Badge tone={severityLabel.tone} variant="soft" size="sm">
                  {severityLabel.text}
                </Badge>
                <span className="text-xs text-text-muted shrink-0">
                  {format(date, 'MMM d')}
                </span>
              </div>
            );
          })}
        </div>
      </Card>
      <p className="text-xs text-text-muted mt-3 flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Medication side effects reported through LumiBot check-ins. Discuss with the care team.
      </p>
    </section>
  );
}
