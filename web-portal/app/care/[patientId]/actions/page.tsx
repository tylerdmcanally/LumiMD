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
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCareActionsPage, type ActionItem } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

const CARE_ACTIONS_PAGE_SIZE = 50;

export default function PatientActionsPage() {
    const params = useParams<{ patientId: string }>();
    const patientId = params.patientId;

    const [cursor, setCursor] = React.useState<string | null>(null);
    const [actions, setActions] = React.useState<ActionItem[]>([]);
    const [hasMore, setHasMore] = React.useState(false);
    const [nextCursor, setNextCursor] = React.useState<string | null>(null);

    const {
        data: actionsPage,
        isLoading,
        isFetching,
        error,
    } = useCareActionsPage(patientId, {
        limit: CARE_ACTIONS_PAGE_SIZE,
        cursor,
    });

    React.useEffect(() => {
        setCursor(null);
        setActions([]);
        setHasMore(false);
        setNextCursor(null);
    }, [patientId]);

    React.useEffect(() => {
        if (!actionsPage) return;
        setActions((previous) => {
            const byId = new Map<string, ActionItem>();
            previous.forEach((item) => byId.set(item.id, item));
            actionsPage.items.forEach((item) => byId.set(item.id, item));
            return Array.from(byId.values());
        });
        setHasMore(actionsPage.hasMore);
        setNextCursor(actionsPage.nextCursor);
    }, [actionsPage]);

    if (isLoading && actions.length === 0) {
        return (
            <PageContainer maxWidth="lg">
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                </div>
            </PageContainer>
        );
    }

    if (error && actions.length === 0) {
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
                        <Link href={`/care/${patientId}`} className="flex items-center">
                            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
                            <span>Back to Overview</span>
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
                <Link href={`/care/${patientId}`} className="flex items-center text-text-secondary hover:text-brand-primary">
                    <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
                    <span>Back to Overview</span>
                </Link>
            </Button>

            {/* Header */}
            <PageHeader
                title="Action Items"
                subtitle={`${pendingActions.length} pending action${pendingActions.length !== 1 ? 's' : ''}`}
                className="mb-8"
            />

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

                    {(hasMore || isFetching) && (
                        <div className="pt-2 flex justify-center">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={!hasMore || !nextCursor || isFetching}
                                onClick={() => {
                                    if (!nextCursor) return;
                                    setCursor(nextCursor);
                                }}
                                className="flex items-center gap-2"
                            >
                                {isFetching && <Loader2 className="h-4 w-4 animate-spin" />}
                                <span>{isFetching ? 'Loading...' : 'Load more actions'}</span>
                            </Button>
                        </div>
                    )}

                    {error && actions.length > 0 && (
                        <p className="text-sm text-error text-center">
                            Unable to load more action items right now.
                        </p>
                    )}
                </div>
            )}
        </PageContainer>
    );
}
