'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatISO,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import {
  Plus,
  CheckCircle2,
  Circle,
  Calendar,
  ExternalLink,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Pencil,
} from 'lucide-react';

import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useActions, queryKeys } from '@/lib/api/hooks';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

export default function ActionsPage() {
  const user = useCurrentUser();
  const { data: actions = [], isLoading } = useActions(user?.uid);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const queryClient = useQueryClient();
  const [updatingActionId, setUpdatingActionId] = React.useState<string | null>(null);

  const { pendingActions, completedActions } = React.useMemo(() => {
    const pending: any[] = [];
    const completed: any[] = [];

    actions.forEach((action: any) => {
      if (action.completed) {
        completed.push(action);
      } else {
        pending.push(action);
      }
    });

    const sortByDueDate = (list: any[]) =>
      list.sort((a, b) => {
        const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
        const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
        return aTime - bTime;
      });

    return {
      pendingActions: sortByDueDate(pending),
      completedActions: sortByDueDate(completed),
    };
  }, [actions]);

  // Stats
  const [stats, setStats] = React.useState(() => computeStats(actions));
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [createDefaultDate, setCreateDefaultDate] = React.useState<Date | null>(null);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [actionBeingEdited, setActionBeingEdited] = React.useState<any | null>(null);
  const [deleteDialogState, setDeleteDialogState] = React.useState<{ open: boolean; action: any | null }>({
    open: false,
    action: null,
  });

  React.useEffect(() => {
    setStats(computeStats(actions));
  }, [actions]);

  const updateActionMutation = useMutation({
    mutationFn: async ({
      id,
      completed,
    }: {
      id: string;
      completed: boolean;
    }) => {
      const payload: Record<string, any> = { completed };
      if (completed) {
        payload.completedAt = new Date().toISOString();
      }
      return api.actions.update(id, payload);
    },
    onMutate: async (variables) => {
      if (!user?.uid) return;
      setUpdatingActionId(variables.id);
      await queryClient.cancelQueries({ queryKey: queryKeys.actions(user.uid) });
      const previous = queryClient.getQueryData<any[]>(queryKeys.actions(user.uid)) ?? [];
      const updated = previous.map((action) =>
        action.id === variables.id
          ? {
              ...action,
              completed: variables.completed,
              completedAt: variables.completed ? new Date().toISOString() : null,
            }
          : action,
      );
      queryClient.setQueryData(queryKeys.actions(user.uid), updated);
      setStats(computeStats(updated));
      return { previous };
    },
    onSuccess: async (_, variables) => {
      if (user?.uid) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.actions(user.uid) });
      }
      toast.success(
        variables.completed ? 'Marked action as completed.' : 'Marked action as pending.',
      );
    },
    onError: (error: any, _variables, context) => {
      if (user?.uid && context?.previous) {
        queryClient.setQueryData(queryKeys.actions(user.uid), context.previous);
        setStats(computeStats(context.previous));
      }
      toast.error(error?.message || 'Unable to update action item. Please try again.');
    },
    onSettled: () => {
      setUpdatingActionId(null);
    },
  });

  const handleToggleComplete = async (action: any) => {
    if (!action?.id || updateActionMutation.isPending) return;
    const targetCompleted = !(action.completed === true);
    updateActionMutation.mutate({ id: action.id, completed: targetCompleted });
  };
  const handleEdit = (action: any) => {
    setActionBeingEdited(action);
    setEditDialogOpen(true);
  };
  const handleDeleteRequest = (action: any) => {
    setDeleteDialogState({ open: true, action });
  };

  const createActionMutation = useMutation({
    mutationFn: async ({
      description,
      notes,
      dueDate,
    }: {
      description: string;
      notes?: string;
      dueDate?: string;
    }) => {
      if (!user?.uid) {
        throw new Error('You need to be signed in to add an action item.');
      }
      const sanitizedNotes = sanitizeOptionalString(notes);
      const payload: Record<string, any> = {
        userId: user.uid,
        description: description.trim(),
        completed: false,
        completedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        source: 'manual',
      };
      if (sanitizedNotes !== undefined) {
        payload.notes = sanitizedNotes;
      }
      payload.dueAt = toDueAtISO(dueDate) ?? null;
      await addDoc(collection(db, 'actions'), payload);
    },
    onMutate: async (variables) => {
      if (!user?.uid) return;
      await queryClient.cancelQueries({ queryKey: queryKeys.actions(user.uid) });
      const previous = queryClient.getQueryData<any[]>(queryKeys.actions(user.uid)) ?? [];
      const optimisticAction = {
        id: `temp-${Date.now()}`,
        description: variables.description.trim(),
        notes: sanitizeOptionalString(variables.notes) ?? '',
        dueAt: toDueAtISO(variables.dueDate) ?? null,
        userId: user.uid,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        source: 'manual',
      };
      const updated = [optimisticAction, ...previous];
      queryClient.setQueryData(queryKeys.actions(user.uid), updated);
      setStats(computeStats(updated));
      return { previous };
    },
    onSuccess: async () => {
      if (user?.uid) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.actions(user.uid) });
      }
      toast.success('Action item added.');
      setCreateDialogOpen(false);
      setCreateDefaultDate(null);
    },
    onError: (error: any, _variables, context) => {
      if (user?.uid && context?.previous) {
        queryClient.setQueryData(queryKeys.actions(user.uid), context.previous);
        setStats(computeStats(context.previous));
      }
      toast.error(error?.message || 'Unable to add action item. Please try again.');
    },
  });
  const updateActionDetailsMutation = useMutation({
    mutationFn: async ({
      id,
      description,
      notes,
      dueDate,
    }: {
      id: string;
      description: string;
      notes?: string;
      dueDate?: string;
    }) => {
      const payload: Record<string, any> = {
        description: description.trim(),
        notes: sanitizeOptionalString(notes) ?? '',
        updatedAt: new Date().toISOString(),
      };
      if (dueDate) {
        payload.dueAt = toDueAtISO(dueDate) ?? null;
      } else {
        payload.dueAt = null;
      }
      return api.actions.update(id, payload);
    },
    onMutate: async (variables) => {
      if (!user?.uid) return;
      await queryClient.cancelQueries({ queryKey: queryKeys.actions(user.uid) });
      const previous = queryClient.getQueryData<any[]>(queryKeys.actions(user.uid)) ?? [];
      const updated = previous.map((action) =>
        action.id === variables.id
          ? {
              ...action,
              description: variables.description.trim(),
              notes: sanitizeOptionalString(variables.notes) ?? '',
              dueAt: toDueAtISO(variables.dueDate) ?? null,
              updatedAt: new Date().toISOString(),
            }
          : action,
      );
      queryClient.setQueryData(queryKeys.actions(user.uid), updated);
      setStats(computeStats(updated));
      return { previous };
    },
    onSuccess: async () => {
      if (user?.uid) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.actions(user.uid) });
      }
      toast.success('Action item updated.');
      setEditDialogOpen(false);
      setActionBeingEdited(null);
    },
    onError: (error: any, _variables, context) => {
      if (user?.uid && context?.previous) {
        queryClient.setQueryData(queryKeys.actions(user.uid), context.previous);
        setStats(computeStats(context.previous));
      }
      toast.error(error?.message || 'Unable to update action item. Please try again.');
    },
  });
  const deleteActionMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'actions', id));
    },
    onMutate: async (id) => {
      if (!user?.uid) return;
      await queryClient.cancelQueries({ queryKey: queryKeys.actions(user.uid) });
      const previous = queryClient.getQueryData<any[]>(queryKeys.actions(user.uid)) ?? [];
      const updated = previous.filter((action) => action.id !== id);
      queryClient.setQueryData(queryKeys.actions(user.uid), updated);
      setStats(computeStats(updated));
      return { previous };
    },
    onSuccess: async () => {
      if (user?.uid) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.actions(user.uid) });
      }
      toast.success('Action item deleted.');
      setDeleteDialogState({ open: false, action: null });
    },
    onError: (error: any, _variables, context) => {
      if (user?.uid && context?.previous) {
        queryClient.setQueryData(queryKeys.actions(user.uid), context.previous);
        setStats(computeStats(context.previous));
      }
      toast.error(error?.message || 'Unable to delete action item. Please try again.');
    },
  });

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-8 animate-fade-in-up">
        <PageHeader
          title="Action Items"
          subtitle="Track tasks and follow-ups from your medical visits"
          actions={
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Plus className="h-5 w-5" />}
              onClick={() => {
                setCreateDefaultDate(null);
                setCreateDialogOpen(true);
              }}
            >
              Add Action Item
            </Button>
          }
        />

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Pending" value={stats.pending} variant="warning" />
          <StatCard label="Completed" value={stats.completed} variant="success" />
          </div>

        {/* Actions List */}
        {isLoading ? (
          <Card variant="elevated" padding="lg">
            <div className="p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
              <p className="mt-4 text-text-secondary">Loading action items...</p>
        </div>
          </Card>
        ) : actions.length === 0 ? (
          <Card variant="elevated" padding="lg">
            <div className="p-12 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-text-tertiary" />
              <h3 className="mt-4 font-semibold text-text-primary">No action items yet</h3>
              <p className="mt-2 text-sm text-text-secondary">
                You&apos;re all caught up. Add a new action item to get started.
              </p>
        </div>
          </Card>
        ) : (
          <div className="space-y-8">
            <ActionSection
              title="Pending"
              actions={pendingActions}
              emptyMessage="You're all caught up! Create a new action item to get started."
              onToggleComplete={handleToggleComplete}
              updatingActionId={updatingActionId}
              onEditAction={handleEdit}
              onDeleteAction={handleDeleteRequest}
            />
            <ActionSection
              title="Completed"
              actions={completedActions}
              emptyMessage="No completed action items yet."
              onToggleComplete={handleToggleComplete}
              collapsible
              collapsed={!showCompleted}
              onToggleCollapse={() => setShowCompleted((prev) => !prev)}
              updatingActionId={updatingActionId}
              onEditAction={handleEdit}
              onDeleteAction={handleDeleteRequest}
            />
          </div>
        )}
        <ActionCalendar
          actions={actions}
          onAddAction={() => {
            setCreateDefaultDate(null);
            setCreateDialogOpen(true);
          }}
          onSelectDate={(date) => {
            setCreateDefaultDate(date);
            setCreateDialogOpen(true);
          }}
          onSelectAction={(action) => {
            setActionBeingEdited(action);
            setEditDialogOpen(true);
          }}
        />
        <CreateActionDialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (!open) {
              setCreateDefaultDate(null);
            }
          }}
          defaultDate={createDefaultDate}
          onSubmit={(values) => createActionMutation.mutate(values)}
          isSaving={createActionMutation.isPending}
        />
        <EditActionDialog
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) {
              setActionBeingEdited(null);
            }
          }}
          action={actionBeingEdited}
          onSubmit={(values) =>
            updateActionDetailsMutation.mutate({ id: actionBeingEdited.id, ...values })
          }
          isSaving={updateActionDetailsMutation.isPending}
        />
        <DeleteActionDialog
          open={deleteDialogState.open}
          action={deleteDialogState.action}
          onCancel={() => setDeleteDialogState({ open: false, action: null })}
          onConfirm={() => {
            if (deleteDialogState.action?.id) {
              deleteActionMutation.mutate(deleteDialogState.action.id);
            }
          }}
          isDeleting={deleteActionMutation.isPending}
        />
      </div>
    </PageContainer>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function StatCard({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: number;
  variant?: 'success' | 'warning' | 'neutral';
}) {
  const variantClasses = {
    success: 'text-success-dark',
    warning: 'text-warning-dark',
    neutral: 'text-text-primary',
  };

  return (
    <Card variant="flat" padding="md" className="border-l-4 border-l-brand-primary">
      <div>
        <p className="text-sm font-medium text-text-secondary">{label}</p>
        <p className={cn('text-3xl font-bold mt-2', variantClasses[variant])}>
          {value}
        </p>
      </div>
    </Card>
  );
}

function ActionCalendar({
  actions,
  onSelectDate,
  onAddAction,
  onSelectAction,
}: {
  actions: any[];
  onSelectDate?: (date: Date) => void;
  onAddAction?: () => void;
  onSelectAction?: (action: any) => void;
}) {
  const [currentMonth, setCurrentMonth] = React.useState(() => startOfMonth(new Date()));

  const actionsByDate = React.useMemo(() => {
    const map = new Map<string, any[]>();
    actions.forEach((action) => {
      if (!action?.dueAt) return;
      let date: Date;
      try {
        date = parseISO(action.dueAt as string);
      } catch {
        return;
      }
      if (Number.isNaN(date.getTime())) return;
      const key = formatISO(date, { representation: 'date' });
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)!.push(action);
    });
    return map;
  }, [actions]);

  const calendarDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const today = React.useMemo(() => new Date(), []);
  const monthLabel = format(currentMonth, 'MMMM yyyy');
  const weekDayLabels = React.useMemo(
    () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    [],
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 rounded-full p-0"
            onClick={() => setCurrentMonth((prev) => subMonths(prev, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold text-text-primary">{monthLabel}</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 rounded-full p-0"
            onClick={() => setCurrentMonth((prev) => addMonths(prev, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full rounded-full px-4 text-xs font-semibold sm:w-auto"
          onClick={onAddAction}
        >
          Add calendar item
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-wide text-text-secondary">
        {weekDayLabels.map((label) => (
          <div key={label} className="py-2">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {calendarDays.map((day) => {
          const key = formatISO(day, { representation: 'date' });
          const dayActions = actionsByDate.get(key) ?? [];
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, today);
          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate?.(day)}
              className={cn(
                'flex min-h-[110px] flex-col rounded-xl border p-3 text-left transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                isCurrentMonth ? 'border-border-light bg-surface' : 'border-border-light/60 bg-background-subtle/60',
                isToday && 'border-brand-primary/60 shadow-soft',
              )}
            >
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                  isToday ? 'bg-brand-primary text-white' : 'text-text-primary',
                )}
              >
                {format(day, 'd')}
              </span>
              <div className="mt-3 space-y-1">
                {dayActions.slice(0, 3).map((action) => {
                  const pending = action.completed !== true;
                  return (
                    <button
                      type="button"
                      key={action.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectAction?.(action);
                      }}
                      className={cn(
                        'w-full truncate rounded-full px-2 py-1 text-left text-[11px] font-medium transition-smooth hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                        pending
                          ? 'bg-brand-primary-pale text-brand-primary'
                          : 'bg-background-subtle text-text-secondary',
                      )}
                    >
                      {action.description || 'Action item'}
                    </button>
                  );
                })}
                {dayActions.length > 3 ? (
                  <div className="text-[11px] font-medium text-text-muted">
                    +{dayActions.length - 3} more
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CreateActionDialog({
  open,
  onOpenChange,
  defaultDate,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: Date | null;
  onSubmit: (values: { description: string; notes?: string; dueDate?: string }) => void;
  isSaving: boolean;
}) {
  const [description, setDescription] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [dueDate, setDueDate] = React.useState<string>('');

  React.useEffect(() => {
    if (open) {
      setDescription('');
      setNotes('');
      setDueDate(defaultDate ? formatDateInput(defaultDate) : '');
    }
  }, [defaultDate, open]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!description.trim()) {
      toast.error('Description is required.');
      return;
    }
    onSubmit({
      description,
      notes,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add action item</DialogTitle>
          <DialogDescription>
            Create a follow-up task and set when it should be completed.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="action-description">
              Description
            </label>
            <Input
              id="action-description"
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Schedule follow-up with cardiologist"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="action-notes">
              Notes (optional)
            </label>
            <textarea
              id="action-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-24 w-full resize-none rounded-lg border border-border-light bg-background-subtle px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
              placeholder="Add context or reminders"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="action-due-date">
              Due date (optional)
            </label>
            <Input
              id="action-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              min={formatDateInput(new Date())}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSaving}>
              {isSaving ? 'Saving…' : 'Add action item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionSection({
  title,
  actions,
  emptyMessage,
  onToggleComplete,
  collapsible = false,
  collapsed = false,
  onToggleCollapse,
  updatingActionId,
  onEditAction,
  onDeleteAction,
}: {
  title: string;
  actions: any[];
  emptyMessage: string;
  onToggleComplete: (action: any) => void;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  updatingActionId?: string | null;
  onEditAction?: (action: any) => void;
  onDeleteAction?: (action: any) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
          {collapsible && actions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-10 rounded-full px-5 text-xs font-semibold text-text-secondary border-border-light hover:text-brand-primary hover:border-brand-primary/60"
              onClick={() => onToggleCollapse?.()}
            >
              {collapsed ? 'Show completed' : 'Hide completed'}
            </Button>
          )}
        </div>
        <p className="text-sm font-medium text-text-secondary sm:text-right">
          {actions.length} {actions.length === 1 ? 'item' : 'items'}
        </p>
      </div>
      {actions.length === 0 ? (
        <Card variant="flat" padding="lg" className="text-center text-sm text-text-secondary">
          {emptyMessage}
        </Card>
      ) : collapsed ? null : (
        <div className="grid gap-4">
          {actions.map((action: any) => (
            <ActionCard
              key={action.id}
              action={action}
              onToggleComplete={() => onToggleComplete(action)}
              isUpdating={updatingActionId === action.id}
              onEdit={() => onEditAction?.(action)}
              onDelete={() => onDeleteAction?.(action)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ActionCard({
  action,
  onToggleComplete,
  isUpdating,
  onEdit,
  onDelete,
}: {
  action: any;
  onToggleComplete: () => void;
  isUpdating?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const isCompleted = action.completed === true;
  const dueDate = action.dueAt ? new Date(action.dueAt) : null;
  const isOverdue = dueDate && dueDate < new Date() && !isCompleted;

  return (
    <Card
      variant="elevated"
      padding="none"
      className={cn(
        'transition-smooth hover:shadow-hover',
        isCompleted && 'opacity-80'
      )}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-6">
        {/* Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isUpdating) {
              onToggleComplete();
            }
          }}
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
            isCompleted
              ? 'border-success bg-success text-white'
              : 'border-border hover:border-brand-primary/60',
            isUpdating && 'cursor-wait opacity-60'
          )}
          aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <Circle className="h-6 w-6 text-text-tertiary/30" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-2">
            <h3
              className={cn(
                'text-lg font-semibold text-text-primary',
                isCompleted && 'line-through text-text-secondary'
              )}
            >
              {action.description || 'Action item'}
            </h3>
            {action.notes && (
              <p className="text-sm leading-relaxed text-text-secondary/90">{action.notes}</p>
            )}
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            {dueDate && (
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full bg-background-subtle px-3 py-1',
                  isOverdue ? 'text-error' : 'text-text-tertiary'
                )}
              >
                <Calendar className="h-4 w-4" />
                <span className="font-medium">
                  Due {format(dueDate, 'MMM d, yyyy')}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>
            )}

            {action.visitId && (
              <Badge tone="brand" variant="soft" size="sm" leftIcon={<ExternalLink className="h-3 w-3" />}>
                From Visit
              </Badge>
            )}

            {action.completedAt && (
              <span className="rounded-full bg-background-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Completed {format(new Date(action.completedAt), 'MMM d')}
              </span>
            )}
          </div>

          {/* Actions Menu */}
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onEdit?.();
              }}
              className="w-full justify-center sm:w-auto"
              leftIcon={<Pencil className="h-4 w-4" />}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-center text-error hover:text-error focus-visible:ring-error sm:w-auto"
              onClick={(event) => {
                event.stopPropagation();
                onDelete?.();
              }}
              leftIcon={<Trash2 className="h-4 w-4" />}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EditActionDialog({
  open,
  onOpenChange,
  action,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: any | null;
  onSubmit: (values: { description: string; notes?: string; dueDate?: string }) => void;
  isSaving: boolean;
}) {
  const [description, setDescription] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [dueDate, setDueDate] = React.useState<string>('');

  React.useEffect(() => {
    if (open && action) {
      setDescription(action.description || '');
      setNotes(action.notes || '');
      setDueDate(action.dueAt ? formatDateInput(new Date(action.dueAt)) : '');
    }
  }, [action, open]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!description.trim() || !action?.id) {
      toast.error('Description is required.');
      return;
    }
    onSubmit({
      description,
      notes,
      dueDate: dueDate || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit action item</DialogTitle>
          <DialogDescription>Update the task details or due date.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="edit-action-description">
              Description
            </label>
            <Input
              id="edit-action-description"
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="edit-action-notes">
              Notes (optional)
            </label>
            <textarea
              id="edit-action-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="h-24 w-full resize-none rounded-lg border border-border-light bg-background-subtle px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-primary" htmlFor="edit-action-due-date">
              Due date (optional)
            </label>
            <Input
              id="edit-action-due-date"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              min={formatDateInput(new Date())}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSaving}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteActionDialog({
  open,
  action,
  onCancel,
  onConfirm,
  isDeleting,
}: {
  open: boolean;
  action: any | null;
  onCancel: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete action item</DialogTitle>
          <DialogDescription>
            This will permanently remove{' '}
            <span className="font-medium text-text-primary">
              {action?.description || 'this action item'}
            </span>{' '}
            from your list.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={isDeleting}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function computeStats(actions: any[]): { pending: number; completed: number } {
  const pending = actions.filter((action) => !action.completed).length;
  return {
    pending,
    completed: actions.length - pending,
  };
}

function sanitizeOptionalString(value?: string | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function formatDateInput(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function toDueAtISO(dateString?: string): string | null {
  if (!dateString) return null;
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
