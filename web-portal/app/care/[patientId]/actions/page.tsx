'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    AlertCircle,
    CheckSquare,
    Calendar,
    CheckCircle,
    Circle,
    Clock,
} from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useActions } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

export default function PatientActionsPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const { data: actions, isLoading, error } = useActions(patientId);

    if (isLoading) {
        return (
            <PageContainer maxWidth="lg">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
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
                        Unable to load actions
                    </h2>
                    <p className="text-text-secondary mb-4">
                        {error.message || 'An error occurred while loading action items.'}
                    </p>
                    <Button variant="secondary" asChild>
                        <Link href={`/care/${patientId}`}>
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to Overview
                        </Link>
                    </Button>
                </Card>
            </PageContainer>
        );
    }

    const pendingActions = actions?.filter((a) => !a.completed) ?? [];
    const completedActions = actions?.filter((a) => a.completed) ?? [];

    // Check for overdue
    const now = new Date();
    const isOverdue = (dueAt?: string | null) => {
        if (!dueAt) return false;
        return new Date(dueAt) < now;
    };

    return (
        <PageContainer maxWidth="lg">
            {/* Back Button */}
            <Button variant="ghost" size="sm" className="mb-4" asChild>
                <Link href={`/care/${patientId}`}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Overview
                </Link>
            </Button>

            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">
                    Action Items
                </h1>
                <p className="text-text-secondary mt-1">
                    {pendingActions.length} pending action{pendingActions.length !== 1 ? 's' : ''}
                </p>
            </div>

            {actions?.length === 0 ? (
                <Card variant="elevated" padding="lg" className="text-center py-12">
                    <CheckSquare className="h-12 w-12 text-text-muted mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                        No action items
                    </h2>
                    <p className="text-text-secondary">
                        Action items from visit summaries will appear here.
                    </p>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* Pending Actions */}
                    {pendingActions.length > 0 && (
                        <section>
                            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">
                                Pending
                            </h2>
                            <div className="space-y-3">
                                {pendingActions.map((action) => {
                                    const overdue = isOverdue(action.dueAt);
                                    return (
                                        <Card
                                            key={action.id}
                                            variant="elevated"
                                            padding="md"
                                            className={cn(overdue && 'border-l-4 border-l-error')}
                                        >
                                            <div className="flex items-start gap-3">
                                                <Circle
                                                    className={cn(
                                                        'h-5 w-5 shrink-0 mt-0.5',
                                                        overdue ? 'text-error' : 'text-text-muted'
                                                    )}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-text-primary">
                                                        {action.description}
                                                    </p>
                                                    {action.dueAt && (
                                                        <div
                                                            className={cn(
                                                                'flex items-center gap-1 text-sm mt-2',
                                                                overdue
                                                                    ? 'text-error font-medium'
                                                                    : 'text-text-muted'
                                                            )}
                                                        >
                                                            {overdue ? (
                                                                <Clock className="h-3 w-3" />
                                                            ) : (
                                                                <Calendar className="h-3 w-3" />
                                                            )}
                                                            {overdue ? 'Overdue - ' : 'Due '}
                                                            {new Date(action.dueAt).toLocaleDateString()}
                                                        </div>
                                                    )}
                                                    {action.notes && (
                                                        <p className="text-xs text-text-muted mt-2 italic">
                                                            {action.notes}
                                                        </p>
                                                    )}
                                                </div>
                                                {action.source === 'visit' && (
                                                    <span className="text-xs px-2 py-1 rounded-full bg-background-subtle text-text-muted shrink-0">
                                                        From visit
                                                    </span>
                                                )}
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* Completed Actions */}
                    {completedActions.length > 0 && (
                        <section>
                            <h2 className="text-sm font-medium text-text-muted uppercase tracking-wide mb-3">
                                Completed
                            </h2>
                            <div className="space-y-3">
                                {completedActions.map((action) => (
                                    <Card
                                        key={action.id}
                                        variant="elevated"
                                        padding="md"
                                        className="opacity-60"
                                    >
                                        <div className="flex items-start gap-3">
                                            <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-text-secondary line-through">
                                                    {action.description}
                                                </p>
                                                {action.completedAt && (
                                                    <div className="flex items-center gap-1 text-xs text-text-muted mt-2">
                                                        <CheckCircle className="h-3 w-3" />
                                                        Completed{' '}
                                                        {new Date(action.completedAt).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </PageContainer>
    );
}
