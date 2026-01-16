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
import { useCareHealthLogs, type HealthLogEntry } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

// Brand colors from design tokens
const BRAND_COLORS = {
  primary: '#40C9D0',
  primaryDark: '#078A94',
  secondary: '#89D8C6',
  accent: '#0A99A4',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
};

type MetricType = 'bp' | 'glucose' | 'weight';

export default function HealthMetricsPage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;

  const [selectedMetric, setSelectedMetric] = React.useState<MetricType>('bp');
  const [dateRange, setDateRange] = React.useState<number>(30);

  const { data, isLoading, error } = useCareHealthLogs(patientId, { days: dateRange });

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

  const { logs, summary, alerts } = data || { logs: [], summary: null, alerts: null };

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
        <div className="rounded-2xl bg-hero-brand p-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2">
            <Link href={`/care/${patientId}`} className="inline-flex items-center gap-2 text-brand-primary-dark hover:text-brand-primary">
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Overview</span>
            </Link>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-brand-primary-dark uppercase tracking-wider">
                Health Tracking
              </span>
              <h1 className="text-3xl font-bold text-text-primary lg:text-4xl">
                Health Metrics
              </h1>
              <p className="text-text-secondary mt-1">
                Track blood pressure, glucose, and weight trends
              </p>
            </div>
            <Select value={String(dateRange)} onValueChange={(v) => setDateRange(Number(v))}>
              <SelectTrigger className="w-40 bg-surface">
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
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 35, 50, 0.08)" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#9CA3AF" 
                      fontSize={12}
                      tickLine={false}
                    />
                    <YAxis 
                      stroke="#9CA3AF" 
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
                          stroke={BRAND_COLORS.error}
                          strokeWidth={2}
                          dot={{ fill: BRAND_COLORS.error, strokeWidth: 0, r: 4 }}
                          name="Systolic"
                        />
                        <Line
                          type="monotone"
                          dataKey="diastolic"
                          stroke={BRAND_COLORS.primary}
                          strokeWidth={2}
                          dot={{ fill: BRAND_COLORS.primary, strokeWidth: 0, r: 4 }}
                          name="Diastolic"
                        />
                        <ReferenceLine y={120} stroke={BRAND_COLORS.warning} strokeDasharray="5 5" />
                        <ReferenceLine y={80} stroke={BRAND_COLORS.warning} strokeDasharray="5 5" />
                      </>
                    )}
                    {selectedMetric === 'glucose' && (
                      <>
                        <Line
                          type="monotone"
                          dataKey="reading"
                          stroke={BRAND_COLORS.accent}
                          strokeWidth={2}
                          dot={{ fill: BRAND_COLORS.accent, strokeWidth: 0, r: 4 }}
                          name="Glucose"
                        />
                        <ReferenceLine y={100} stroke={BRAND_COLORS.success} strokeDasharray="5 5" />
                        <ReferenceLine y={140} stroke={BRAND_COLORS.warning} strokeDasharray="5 5" />
                      </>
                    )}
                    {selectedMetric === 'weight' && (
                      <Line
                        type="monotone"
                        dataKey="weight"
                        stroke={BRAND_COLORS.secondary}
                        strokeWidth={2}
                        dot={{ fill: BRAND_COLORS.secondary, strokeWidth: 0, r: 4 }}
                        name="Weight"
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary-pale text-brand-primary mx-auto mb-3">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <p>No {selectedMetric === 'bp' ? 'blood pressure' : selectedMetric} readings in this period</p>
                </div>
              </div>
            )}
          </Card>
        </section>

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
    brand: 'bg-brand-primary-pale text-brand-primary',
    error: 'bg-error-light text-error-dark',
    info: 'bg-info-light text-info-dark',
    success: 'bg-success-light text-success-dark',
    warning: 'bg-warning-light text-warning-dark',
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
          <p className="text-sm"><span className="text-brand-primary">Diastolic:</span> {data.diastolic}</p>
        </>
      )}
      {metric === 'glucose' && (
        <p className="text-sm"><span className="text-brand-accent">Glucose:</span> {data.reading} mg/dL</p>
      )}
      {metric === 'weight' && (
        <p className="text-sm"><span className="text-brand-secondary">Weight:</span> {data.weight} {data.unit}</p>
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
