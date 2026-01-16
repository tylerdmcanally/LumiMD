'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Activity,
  Calendar,
  ChevronRight,
  ChevronDown,
  Stethoscope,
  TrendingUp,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCareVisits } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

type ConditionInfo = {
  name: string;
  visitCount: number;
  firstMentioned: Date | null;
  lastMentioned: Date | null;
  relatedVisits: Array<{
    id: string;
    visitDate: Date | null;
    provider: string | null;
    specialty: string | null;
    summary: string | null;
  }>;
};

export default function ConditionsPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const patientId = params.patientId;

  const { data: visits, isLoading, error } = useCareVisits(patientId);

  // State for expanded conditions
  const [expandedConditions, setExpandedConditions] = React.useState<Set<string>>(new Set());

  // Extract and aggregate conditions from visits
  const conditions = React.useMemo(() => {
    if (!visits) return [];

    const conditionMap = new Map<string, ConditionInfo>();

    visits.forEach((visit: any) => {
      const diagnoses = Array.isArray(visit.diagnoses) ? visit.diagnoses.filter(Boolean) : [];
      const visitDate = visit.visitDate || visit.createdAt;
      const parsedDate = visitDate ? new Date(visitDate) : null;
      const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : null;

      diagnoses.forEach((diagnosis: unknown) => {
        const conditionName = String(diagnosis).trim();
        if (!conditionName) return;

        // Normalize condition name for grouping (lowercase for comparison)
        const normalizedName = conditionName.toLowerCase();
        
        const existing = conditionMap.get(normalizedName);
        
        const visitInfo = {
          id: visit.id,
          visitDate: validDate,
          provider: visit.provider?.trim() || null,
          specialty: visit.specialty?.trim() || null,
          summary: visit.summary?.substring(0, 150) || null,
        };

        if (existing) {
          existing.visitCount += 1;
          existing.relatedVisits.push(visitInfo);
          
          // Update first/last mentioned dates
          if (validDate) {
            if (!existing.firstMentioned || validDate < existing.firstMentioned) {
              existing.firstMentioned = validDate;
            }
            if (!existing.lastMentioned || validDate > existing.lastMentioned) {
              existing.lastMentioned = validDate;
            }
          }
          
          // Keep the original case from the first occurrence
        } else {
          conditionMap.set(normalizedName, {
            name: conditionName, // Use original case
            visitCount: 1,
            firstMentioned: validDate,
            lastMentioned: validDate,
            relatedVisits: [visitInfo],
          });
        }
      });
    });

    // Sort related visits by date (most recent first)
    conditionMap.forEach((condition) => {
      condition.relatedVisits.sort((a, b) => {
        if (!a.visitDate && !b.visitDate) return 0;
        if (!a.visitDate) return 1;
        if (!b.visitDate) return -1;
        return b.visitDate.getTime() - a.visitDate.getTime();
      });
    });

    // Sort conditions by visit count (most frequent first), then alphabetically
    return Array.from(conditionMap.values()).sort((a, b) => {
      if (b.visitCount !== a.visitCount) {
        return b.visitCount - a.visitCount;
      }
      return a.name.localeCompare(b.name);
    });
  }, [visits]);

  const toggleCondition = (conditionName: string) => {
    setExpandedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(conditionName)) {
        next.delete(conditionName);
      } else {
        next.add(conditionName);
      }
      return next;
    });
  };

  const handleViewVisits = (conditionName: string) => {
    // Navigate to visits page with search filter for this condition
    const encodedCondition = encodeURIComponent(conditionName);
    router.push(`/care/${patientId}/visits?q=${encodedCondition}`);
  };

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
          <p className="text-sm text-text-secondary">Loading conditions...</p>
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
            Unable to load conditions
          </h2>
          <p className="text-text-secondary mb-4">
            {error.message || 'An error occurred while loading condition information.'}
          </p>
          <Button variant="secondary" asChild>
            <Link href={`/care/${patientId}`} className="flex items-center">
              <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
              <span>Back to Overview</span>
            </Link>
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/care/${patientId}`} className="flex items-center text-brand-primary hover:text-brand-primary-dark">
            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
            <span>Back to Overview</span>
          </Link>
        </Button>

        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
            Conditions & Diagnoses
          </h1>
          <p className="text-text-secondary">
            {conditions.length} condition{conditions.length !== 1 ? 's' : ''} tracked across {visits?.length ?? 0} visit{(visits?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </header>

        {/* Empty State */}
        {conditions.length === 0 ? (
          <Card variant="elevated" padding="lg" className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-pale mx-auto mb-4">
              <Activity className="h-8 w-8 text-brand-primary" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              No conditions tracked yet
            </h2>
            <p className="text-text-secondary max-w-sm mx-auto">
              Conditions and diagnoses will appear here as they are mentioned in visit summaries.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {conditions.map((condition) => {
              const isExpanded = expandedConditions.has(condition.name);
              const timeSinceFirst = condition.firstMentioned
                ? formatDistanceToNow(condition.firstMentioned, { addSuffix: true })
                : null;
              const timeSinceLast = condition.lastMentioned
                ? formatDistanceToNow(condition.lastMentioned, { addSuffix: true })
                : null;

              return (
                <Card
                  key={condition.name}
                  variant="elevated"
                  padding="none"
                  className="overflow-hidden"
                >
                  {/* Condition Header */}
                  <button
                    onClick={() => toggleCondition(condition.name)}
                    className="w-full p-5 text-left hover:bg-background-subtle/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-text-primary text-lg">
                            {condition.name}
                          </h3>
                          <Badge tone="brand" variant="soft" size="sm">
                            {condition.visitCount} visit{condition.visitCount !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-text-muted">
                          {condition.firstMentioned && (
                            <span className="flex items-center gap-1">
                              <TrendingUp className="h-3.5 w-3.5" />
                              First: {format(condition.firstMentioned, 'MMM d, yyyy')}
                            </span>
                          )}
                          {condition.lastMentioned && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              Last: {timeSinceLast}
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronDown
                        className={cn(
                          "h-5 w-5 text-text-muted transition-transform shrink-0",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                  </button>

                  {/* Expanded Content - Visit Timeline */}
                  {isExpanded && (
                    <div className="border-t border-border-light bg-background-subtle/30">
                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-text-secondary">
                            Visit Timeline
                          </h4>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewVisits(condition.name)}
                          >
                            View all visits
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>

                        {/* Timeline */}
                        <div className="relative">
                          {/* Timeline line */}
                          <div className="absolute left-3 top-3 bottom-3 w-px bg-border-light" />

                          <div className="space-y-4">
                            {condition.relatedVisits.slice(0, 5).map((visit, idx) => (
                              <Link
                                key={visit.id}
                                href={`/care/${patientId}/visits/${visit.id}`}
                                className="block group"
                              >
                                <div className="relative flex items-start gap-4 pl-8">
                                  {/* Timeline dot */}
                                  <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-brand-primary border-2 border-white shadow-sm" />

                                  <div className="flex-1 min-w-0 p-3 rounded-lg bg-white border border-border-light/60 shadow-sm group-hover:shadow-md group-hover:border-brand-primary/30 transition-all">
                                    <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                                      <Calendar className="h-3 w-3" />
                                      {visit.visitDate
                                        ? format(visit.visitDate, 'MMMM d, yyyy')
                                        : 'Date unknown'}
                                    </div>
                                    <p className="font-medium text-text-primary group-hover:text-brand-primary transition-colors">
                                      {visit.provider || 'Unknown Provider'}
                                      {visit.specialty && (
                                        <span className="font-normal text-text-secondary">
                                          {' '}• {visit.specialty}
                                        </span>
                                      )}
                                    </p>
                                    {visit.summary && (
                                      <p className="text-sm text-text-secondary mt-1 line-clamp-2">
                                        {visit.summary}...
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            ))}

                            {condition.relatedVisits.length > 5 && (
                              <div className="relative pl-8">
                                <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-text-muted/30 border-2 border-white" />
                                <p className="text-sm text-text-muted py-2">
                                  + {condition.relatedVisits.length - 5} more visit{condition.relatedVisits.length - 5 !== 1 ? 's' : ''}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
