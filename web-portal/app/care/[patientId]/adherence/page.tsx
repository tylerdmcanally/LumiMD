'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format, parseISO, startOfWeek, addDays } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Flame,
  Lightbulb,
  Calendar,
  Pill,
  CheckCircle,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
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
import { useCareMedicationAdherence, type MedicationAdherenceData } from '@/lib/api/hooks';
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

export default function MedicationAdherencePage() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;

  const [dateRange, setDateRange] = React.useState<number>(30);

  const { data, isLoading, error } = useCareMedicationAdherence(patientId, { days: dateRange });

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
          <p className="text-sm text-text-secondary">Loading adherence data...</p>
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
            Unable to load adherence data
          </h2>
          <p className="text-text-secondary mb-4">
            {error.message || 'An error occurred while loading medication adherence.'}
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

  const { overall, byMedication, calendar, patterns } = data || {
    overall: { adherenceRate: 0, totalDoses: 0, takenDoses: 0, skippedDoses: 0, missedDoses: 0 },
    byMedication: [],
    calendar: [],
    patterns: { insights: [] },
  };

  // Group calendar data by weeks for the heatmap
  const calendarWeeks = groupByWeeks(calendar);

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
                Compliance Tracking
              </span>
              <h1 className="text-3xl font-bold text-text-primary lg:text-4xl">
                Medication Adherence
              </h1>
              <p className="text-text-secondary mt-1">
                Track medication compliance patterns over time
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
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Overall Score + Calendar Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Overall Score Card */}
          <Card variant="elevated" padding="lg" className="lg:col-span-1">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <h2 className="text-sm font-medium text-text-secondary">Overall Adherence</h2>
              </div>
              
              <div className="relative inline-flex items-center justify-center mb-6">
                <svg className="w-36 h-36 transform -rotate-90">
                  <circle
                    cx="72"
                    cy="72"
                    r="64"
                    stroke="rgba(26, 35, 50, 0.06)"
                    strokeWidth="12"
                    fill="none"
                  />
                  <circle
                    cx="72"
                    cy="72"
                    r="64"
                    stroke={getAdherenceColor(overall.adherenceRate)}
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${(overall.adherenceRate / 100) * 402} 402`}
                    strokeLinecap="round"
                    className="transition-all duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-bold text-text-primary">
                    {overall.adherenceRate}%
                  </span>
                  <span className="text-xs text-text-muted">compliance</span>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-success-light">
                  <p className="text-xl font-bold text-success-dark">{overall.takenDoses}</p>
                  <p className="text-xs text-success-dark">Taken</p>
                </div>
                <div className="p-3 rounded-lg bg-warning-light">
                  <p className="text-xl font-bold text-warning-dark">{overall.skippedDoses}</p>
                  <p className="text-xs text-warning-dark">Skipped</p>
                </div>
                <div className="p-3 rounded-lg bg-error-light">
                  <p className="text-xl font-bold text-error-dark">{overall.missedDoses}</p>
                  <p className="text-xs text-error-dark">Missed</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Calendar Heatmap */}
          <Card variant="elevated" padding="lg" className="lg:col-span-2">
            <div className="flex items-center gap-2 mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary">
                <Calendar className="h-5 w-5" />
              </div>
              <h2 className="text-sm font-medium text-text-secondary">Daily Adherence</h2>
            </div>
            
            {calendar.length > 0 ? (
              <div className="space-y-2">
                {/* Day labels */}
                <div className="flex gap-1 text-xs text-text-muted ml-12">
                  <span className="w-7 text-center">M</span>
                  <span className="w-7 text-center">T</span>
                  <span className="w-7 text-center">W</span>
                  <span className="w-7 text-center">T</span>
                  <span className="w-7 text-center">F</span>
                  <span className="w-7 text-center">S</span>
                  <span className="w-7 text-center">S</span>
                </div>
                {/* Weeks */}
                <div className="space-y-1">
                  {calendarWeeks.map((week, weekIdx) => (
                    <div key={weekIdx} className="flex items-center gap-1">
                      <span className="text-xs text-text-muted w-10 text-right shrink-0">
                        {week[0]?.date ? format(parseISO(week[0].date), 'MMM d') : ''}
                      </span>
                      {week.map((day, dayIdx) => {
                        if (!day) {
                          return <div key={dayIdx} className="w-7 h-7" />;
                        }
                        const rate = day.scheduled > 0
                          ? Math.round((day.taken / day.scheduled) * 100)
                          : 100;
                        return (
                          <div
                            key={day.date}
                            className={cn(
                              'w-7 h-7 rounded-md cursor-pointer transition-all hover:scale-110 hover:shadow-md',
                              getHeatmapColor(rate)
                            )}
                            title={`${format(parseISO(day.date), 'MMM d')}: ${day.taken}/${day.scheduled} taken (${rate}%)`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
                {/* Legend */}
                <div className="flex items-center justify-end gap-2 mt-6 text-xs text-text-muted">
                  <span>Less</span>
                  <div className="flex gap-1">
                    <div className="w-5 h-5 rounded bg-error-light" />
                    <div className="w-5 h-5 rounded bg-warning-light" />
                    <div className="w-5 h-5 rounded bg-success-light" />
                    <div className="w-5 h-5 rounded bg-success" />
                  </div>
                  <span>More</span>
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-text-muted">
                <div className="text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary-pale text-brand-primary mx-auto mb-3">
                    <Calendar className="h-6 w-6" />
                  </div>
                  <p>No adherence data available for this period</p>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* By Medication */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">By Medication</h2>
            <Link 
              href={`/care/${patientId}/medications`}
              className="text-sm font-medium text-brand-primary hover:underline flex items-center gap-1"
            >
              View all
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <Card variant="elevated" padding="none" className="overflow-hidden">
            <div className="divide-y divide-border-light">
              {byMedication.length === 0 ? (
                <div className="p-8 text-center text-text-muted">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary-pale text-brand-primary mx-auto mb-3">
                    <Pill className="h-6 w-6" />
                  </div>
                  <p>No medication data available</p>
                </div>
              ) : (
                byMedication.map((med) => (
                  <MedicationAdherenceRow key={med.medicationId} medication={med} />
                ))
              )}
            </div>
          </Card>
        </section>

        {/* Patterns & Insights */}
        {patterns.insights.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-light text-warning-dark">
                <Lightbulb className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Patterns Detected</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {patterns.insights.map((insight, idx) => (
                <Card
                  key={idx}
                  variant="elevated"
                  padding="md"
                  className="border-l-4 border-l-warning"
                >
                  <div className="flex items-start gap-3">
                    <Lightbulb className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                    <p className="text-sm text-text-primary">{insight}</p>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageContainer>
  );
}

// Helper Components

function MedicationAdherenceRow({
  medication,
}: {
  medication: MedicationAdherenceData['byMedication'][0];
}) {
  const { medicationName, adherenceRate, takenDoses, totalDoses, streak } = medication;

  return (
    <div className="p-5 hover:bg-hover transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary-pale text-brand-primary shrink-0">
          <Pill className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium text-text-primary truncate">{medicationName}</h3>
            <div className="flex items-center gap-2 shrink-0">
              {streak >= 3 && (
                <Badge tone="warning" variant="soft" size="sm" className="gap-1">
                  <Flame className="h-3 w-3" />
                  {streak} day streak
                </Badge>
              )}
              <span
                className={cn(
                  'text-sm font-bold',
                  adherenceRate >= 80 ? 'text-success-dark' : 
                  adherenceRate >= 60 ? 'text-warning-dark' : 'text-error-dark'
                )}
              >
                {adherenceRate}%
              </span>
            </div>
          </div>
          <div className="relative h-2 rounded-full bg-background-subtle overflow-hidden">
            <div
              className={cn(
                'absolute inset-y-0 left-0 rounded-full transition-all duration-500',
                adherenceRate >= 80 ? 'bg-success' : 
                adherenceRate >= 60 ? 'bg-warning' : 'bg-error'
              )}
              style={{ width: `${adherenceRate}%` }}
            />
          </div>
          <p className="text-xs text-text-muted mt-2 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            {takenDoses} of {totalDoses} doses taken
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper Functions

function getAdherenceColor(rate: number): string {
  if (rate >= 80) return BRAND_COLORS.success;
  if (rate >= 60) return BRAND_COLORS.warning;
  return BRAND_COLORS.error;
}

function getHeatmapColor(rate: number): string {
  if (rate >= 90) return 'bg-success';
  if (rate >= 70) return 'bg-success-light';
  if (rate >= 50) return 'bg-warning-light';
  return 'bg-error-light';
}

function groupByWeeks(
  calendar: Array<{ date: string; scheduled: number; taken: number; skipped: number; missed: number }>
): Array<Array<{ date: string; scheduled: number; taken: number; skipped: number; missed: number } | null>> {
  if (calendar.length === 0) return [];

  // Sort by date ascending
  const sorted = [...calendar].sort((a, b) => a.date.localeCompare(b.date));

  // Find the start of the first week (Monday)
  const firstDate = parseISO(sorted[0].date);
  const weekStart = startOfWeek(firstDate, { weekStartsOn: 1 }); // Monday

  // Create a map for quick lookup
  const dateMap = new Map<string, typeof sorted[0]>();
  sorted.forEach((d) => dateMap.set(d.date, d));

  // Build weeks
  const weeks: Array<Array<typeof sorted[0] | null>> = [];
  let currentWeek: Array<typeof sorted[0] | null> = [];
  let currentDate = weekStart;
  const lastDate = parseISO(sorted[sorted.length - 1].date);

  while (currentDate <= lastDate) {
    const dateStr = format(currentDate, 'yyyy-MM-dd');
    currentWeek.push(dateMap.get(dateStr) || null);

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    currentDate = addDays(currentDate, 1);
  }

  // Add remaining days
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}
