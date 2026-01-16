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
            <Link href={`/care/${patientId}`} className="flex items-center gap-2">
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <Button variant="ghost" size="sm" asChild className="mb-2">
              <Link href={`/care/${patientId}`} className="flex items-center gap-2 text-brand-primary">
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Overview</span>
              </Link>
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
              Health Metrics
            </h1>
            <p className="text-text-secondary mt-1">
              Track blood pressure, glucose, and weight trends
            </p>
          </div>
          <Select value={String(dateRange)} onValueChange={(v) => setDateRange(Number(v))}>
            <SelectTrigger className="w-40">
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

        {/* Alert Banner */}
        {hasAlerts && (
          <Card className="bg-warning-light border-warning/30 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-medium text-warning-dark">
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
          />
        </div>

        {/* Chart */}
        <Card variant="elevated" padding="lg">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-text-primary">
              {selectedMetric === 'bp' && 'Blood Pressure Trend'}
              {selectedMetric === 'glucose' && 'Blood Glucose Trend'}
              {selectedMetric === 'weight' && 'Weight Trend'}
            </h2>
            <Badge tone="neutral" variant="soft">
              {filteredLogs.length} reading{filteredLogs.length !== 1 ? 's' : ''}
            </Badge>
          </div>

          {chartData.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    stroke="#64748b" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#64748b" 
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
                        stroke="#ef4444"
                        strokeWidth={2}
                        dot={{ fill: '#ef4444', strokeWidth: 0, r: 4 }}
                        name="Systolic"
                      />
                      <Line
                        type="monotone"
                        dataKey="diastolic"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                        name="Diastolic"
                      />
                      <ReferenceLine y={120} stroke="#fbbf24" strokeDasharray="5 5" />
                      <ReferenceLine y={80} stroke="#fbbf24" strokeDasharray="5 5" />
                    </>
                  )}
                  {selectedMetric === 'glucose' && (
                    <>
                      <Line
                        type="monotone"
                        dataKey="reading"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ fill: '#8b5cf6', strokeWidth: 0, r: 4 }}
                        name="Glucose"
                      />
                      <ReferenceLine y={100} stroke="#22c55e" strokeDasharray="5 5" />
                      <ReferenceLine y={140} stroke="#fbbf24" strokeDasharray="5 5" />
                    </>
                  )}
                  {selectedMetric === 'weight' && (
                    <Line
                      type="monotone"
                      dataKey="weight"
                      stroke="#14b8a6"
                      strokeWidth={2}
                      dot={{ fill: '#14b8a6', strokeWidth: 0, r: 4 }}
                      name="Weight"
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-72 flex items-center justify-center text-text-muted">
              <div className="text-center">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No {selectedMetric === 'bp' ? 'blood pressure' : selectedMetric} readings in this period</p>
              </div>
            </div>
          )}
        </Card>

        {/* Recent Readings Table */}
        <Card variant="elevated" padding="none" className="overflow-hidden">
          <div className="border-b border-border-light bg-background-subtle/50 px-5 py-4">
            <h2 className="text-lg font-semibold text-text-primary">Recent Readings</h2>
          </div>
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
}) {
  const isAlert = alertLevel === 'warning' || alertLevel === 'emergency';
  const isCaution = alertLevel === 'caution';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-5 rounded-2xl border-2 transition-all',
        isSelected
          ? 'border-brand-primary bg-brand-primary/5 shadow-md'
          : 'border-border-light bg-white hover:border-brand-primary/30 hover:shadow-sm',
        isAlert && 'border-error/50 bg-error-light/30',
        isCaution && !isAlert && 'border-warning/50 bg-warning-light/30'
      )}
    >
      <div className="flex items-center gap-2 text-text-secondary mb-3">
        <span className={cn(isSelected ? 'text-brand-primary' : 'text-text-muted')}>
          {icon}
        </span>
        <span className="text-sm font-medium">{title}</span>
        {isAlert && <AlertTriangle className="h-4 w-4 text-error" />}
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

      <div className="mt-3 text-xs text-text-muted">
        {count} reading{count !== 1 ? 's' : ''} in period
      </div>
    </button>
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
        'flex items-center justify-between px-5 py-4',
        isAlert && 'bg-error-light/30',
        isCaution && !isAlert && 'bg-warning-light/30'
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
    <div className="bg-white rounded-lg shadow-lg border border-border-light p-3">
      <p className="text-xs text-text-muted mb-1">{data.fullDate}</p>
      {metric === 'bp' && (
        <>
          <p className="text-sm"><span className="text-error">Systolic:</span> {data.systolic}</p>
          <p className="text-sm"><span className="text-blue-500">Diastolic:</span> {data.diastolic}</p>
        </>
      )}
      {metric === 'glucose' && (
        <p className="text-sm"><span className="text-purple-500">Glucose:</span> {data.reading} mg/dL</p>
      )}
      {metric === 'weight' && (
        <p className="text-sm"><span className="text-teal-500">Weight:</span> {data.weight} {data.unit}</p>
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
