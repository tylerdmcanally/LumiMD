'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
    Stethoscope,
    Calendar,
    FileText,
    ArrowRight,
    Pill,
    ClipboardCheck,
} from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LatestVisitCardProps {
    visit: {
        id: string;
        provider?: string | null;
        specialty?: string | null;
        createdAt?: string | null;
        summary?: string | null;
        status?: string | null;
    } | null;
    medicationChanges?: number;
    actionItems?: number;
    isLoading?: boolean;
}

export function LatestVisitCard({
    visit,
    medicationChanges = 0,
    actionItems = 0,
    isLoading = false,
}: LatestVisitCardProps) {
    if (isLoading) {
        return (
            <Card variant="elevated" padding="lg" className="relative overflow-hidden">
                <div className="space-y-4">
                    <div className="flex items-start justify-between">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-5 w-24" />
                    </div>
                    <Skeleton className="h-4 w-32" />
                    <div className="space-y-2 pt-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                    </div>
                    <div className="flex gap-3 pt-4">
                        <Skeleton className="h-10 w-28" />
                        <Skeleton className="h-10 w-28" />
                    </div>
                </div>
            </Card>
        );
    }

    if (!visit) {
        return (
            <Card
                variant="elevated"
                padding="lg"
                className="relative overflow-hidden border-2 border-dashed border-border bg-background-subtle/50"
            >
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-pale mb-4">
                        <Stethoscope className="h-8 w-8 text-brand-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-text-primary mb-2">
                        No visits recorded yet
                    </h3>
                    <p className="text-sm text-text-secondary max-w-sm mb-4">
                        Record your first medical visit using the LumiMD app to see your visit summary here.
                    </p>
                </div>
            </Card>
        );
    }

    const formattedDate = visit.createdAt
        ? format(new Date(visit.createdAt), 'MMMM d, yyyy')
        : 'Unknown date';

    const statusColor = {
        processing: 'warning',
        completed: 'success',
        error: 'danger',
    }[visit.status || 'completed'] as 'warning' | 'success' | 'danger';

    // Truncate summary for preview
    const summaryPreview = visit.summary
        ? visit.summary.length > 250
            ? visit.summary.slice(0, 250) + '...'
            : visit.summary
        : 'Summary being generated...';

    return (
        <Card
            variant="elevated"
            padding="lg"
            className="relative overflow-hidden group transition-all duration-200 hover:shadow-hover hover:-translate-y-1"
        >
            {/* Gradient accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-primary via-brand-secondary to-brand-accent" />

            <div className="space-y-5">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-primary-pale text-brand-primary">
                            <Stethoscope className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-text-primary">
                                {visit.provider || 'Medical Visit'}
                            </h2>
                            <p className="text-sm text-text-secondary">
                                {visit.specialty || 'General'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-sm text-text-muted">
                            <Calendar className="h-4 w-4" />
                            <span>{formattedDate}</span>
                        </div>
                        {visit.status && visit.status !== 'completed' && (
                            <Badge tone={statusColor} size="sm">
                                {visit.status === 'processing' ? 'Processing' : visit.status}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Summary Preview */}
                <div className="rounded-xl bg-background-subtle/60 p-4">
                    <div className="flex items-start gap-2 mb-2">
                        <FileText className="h-4 w-4 text-brand-primary mt-0.5" />
                        <span className="text-sm font-semibold text-text-primary">Summary</span>
                    </div>
                    <p className="text-sm text-text-secondary leading-relaxed">
                        {summaryPreview}
                    </p>
                </div>

                {/* Quick Stats */}
                {(medicationChanges > 0 || actionItems > 0) && (
                    <div className="flex flex-wrap gap-4">
                        {medicationChanges > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-light">
                                    <Pill className="h-4 w-4 text-info-dark" />
                                </div>
                                <span className="text-text-secondary">
                                    <span className="font-semibold text-text-primary">{medicationChanges}</span> medication{medicationChanges !== 1 ? 's' : ''} changed
                                </span>
                            </div>
                        )}
                        {actionItems > 0 && (
                            <div className="flex items-center gap-2 text-sm">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-warning-light">
                                    <ClipboardCheck className="h-4 w-4 text-warning-dark" />
                                </div>
                                <span className="text-text-secondary">
                                    <span className="font-semibold text-text-primary">{actionItems}</span> action item{actionItems !== 1 ? 's' : ''}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Actions */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2 border-t border-border-light">
                    <Link
                        href={`/visits/${visit.id}`}
                        className="inline-flex items-center gap-2 text-brand-primary font-semibold text-sm hover:underline"
                    >
                        Read full summary
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link href="/visits">
                        <Button variant="secondary" size="sm">
                            View all visits
                        </Button>
                    </Link>
                </div>
            </div>
        </Card>
    );
}
