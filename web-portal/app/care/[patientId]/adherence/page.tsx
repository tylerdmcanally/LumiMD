'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { format, parseISO, startOfWeek, addDays } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
  Lightbulb,
  Calendar,
  Pill,
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
            <Link href={`/care/${patientId}`} className="flex items-center gap-2">
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
              Medication Adherence
            </h1>
            <p className="text-text-secondary mt-1">
              Track medication compliance patterns over time
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
            </SelectContent>
          </Select>
        </div>

        {/* Overall Score Card */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card variant="elevated" padding="lg" className="lg:col-span-1">
            <div className="text-center">
              <h2 className="text-sm font-medium text-text-secondary mb-4">Overall Adherence</h2>
              <div className="relative inline-flex items-center justify-center">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="#e2e8f0"
                    strokeWidth="12"
                    fill="none"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke={getAdherenceColor(overall.adherenceRate)}
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={`${(overall.adherenceRate / 100) * 352} 352`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-text-primary">
                    {overall.adherenceRate}%
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold text-success">{overall.takenDoses}</p>
                  <p className="text-xs text-text-muted">Taken</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-warning">{overall.skippedDoses}</p>
                  <p className="text-xs text-text-muted">Skipped</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-error">{overall.missedDoses}</p>
                  <p className="text-xs text-text-muted">Missed</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Calendar Heatmap */}
          <Card variant="elevated" padding="lg" className="lg:col-span-2">
            <h2 className="text-sm font-medium text-text-secondary mb-4 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Daily Adherence
            </h2>
            {calendar.length > 0 ? (
              <div className="space-y-2">
                {/* Day labels */}
                <div className="flex gap-1 text-xs text-text-muted ml-10">
                  <span className="w-6 text-center">M</span>
                  <span className="w-6 text-center">T</span>
                  <span className="w-6 text-center">W</span>
                  <span className="w-6 text-center">T</span>
                  <span className="w-6 text-center">F</span>
                  <span className="w-6 text-center">S</span>
                  <span className="w-6 text-center">S</span>
                </div>
                {/* Weeks */}
                <div className="space-y-1">
                  {calendarWeeks.map((week, weekIdx) => (
                    <div key={weekIdx} className="flex items-center gap-1">
                      <span className="text-xs text-text-muted w-8 text-right">
                        {week[0]?.date ? format(parseISO(week[0].date), 'MMM d') : ''}
                      </span>
                      {week.map((day, dayIdx) => {
                        if (!day) {
                          return <div key={dayIdx} className="w-6 h-6" />;
                        }
                        const rate = day.scheduled > 0
                          ? Math.round((day.taken / day.scheduled) * 100)
                          : 100;
                        return (
                          <div
                            key={day.date}
                            className={cn(
                              'w-6 h-6 rounded-sm cursor-pointer transition-transform hover:scale-110',
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
                <div className="flex items-center justify-end gap-2 mt-4 text-xs text-text-muted">
                  <span>Less</span>
                  <div className="flex gap-0.5">
                    <div className="w-4 h-4 rounded-sm bg-error-light" />
                    <div className="w-4 h-4 rounded-sm bg-warning-light" />
                    <div className="w-4 h-4 rounded-sm bg-success-light" />
                    <div className="w-4 h-4 rounded-sm bg-success" />
                  </div>
                  <span>More</span>
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-text-muted">
                No adherence data available for this period
              </div>
            )}
          </Card>
        </div>

        {/* By Medication */}
        <Card variant="elevated" padding="none" className="overflow-hidden">
          <div className="border-b border-border-light bg-background-subtle/50 px-5 py-4">
            <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
              <Pill className="h-5 w-5 text-brand-primary" />
              By Medication
            </h2>
          </div>
          <div className="p-5 space-y-4">
            {byMedication.length === 0 ? (
              <p className="text-center text-text-muted py-8">
                No medication data available
              </p>
            ) : (
              byMedication.map((med) => (
                <MedicationAdherenceRow key={med.medicationId} medication={med} />
              ))
            )}
          </div>
        </Card>

        {/* Patterns & Insights */}
        {patterns.insights.length > 0 && (
          <Card variant="elevated" padding="lg">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-warning" />
              Patterns Detected
            </h2>
            <div className="space-y-3">
              {patterns.insights.map((insight, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3 rounded-lg bg-warning-light/50 border border-warning/20"
                >
                  <Lightbulb className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                  <p className="text-sm text-text-primary">{insight}</p>
                </div>
              ))}
            </div>
          </Card>
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
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-text-primary truncate">{medicationName}</h3>
          <div className="flex items-center gap-2">
            {streak >= 3 && (
              <Badge tone="warning" variant="soft" size="sm" className="gap-1">
                <Flame className="h-3 w-3" />
                {streak} day streak
              </Badge>
            )}
            <span
              className={cn(
                'text-sm font-semibold',
                adherenceRate >= 80 ? 'text-success' : adherenceRate >= 60 ? 'text-warning' : 'text-error'
              )}
            >
              {adherenceRate}%
            </span>
          </div>
        </div>
        <div className="relative h-3 rounded-full bg-background-subtle overflow-hidden">
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all',
              adherenceRate >= 80 ? 'bg-success' : adherenceRate >= 60 ? 'bg-warning' : 'bg-error'
            )}
            style={{ width: `${adherenceRate}%` }}
          />
        </div>
        <p className="text-xs text-text-muted mt-1">
          {takenDoses} of {totalDoses} doses taken
        </p>
      </div>
    </div>
  );
}

// Helper Functions

function getAdherenceColor(rate: number): string {
  if (rate >= 80) return '#22c55e'; // success
  if (rate >= 60) return '#f59e0b'; // warning
  return '#ef4444'; // error
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
