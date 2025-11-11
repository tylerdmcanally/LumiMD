'use client';

import { format } from 'date-fns';
import { CheckCircle2, Edit3, ExternalLink, Trash2, Undo2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ActionItem } from '@/lib/api/hooks';
import { cn } from '@/lib/utils';

type ActionTableProps = {
  actions: ActionItem[];
  isLoading?: boolean;
  onToggle: (action: ActionItem) => void;
  onEdit: (action: ActionItem) => void;
  onDelete: (action: ActionItem) => void;
  onOpenVisit?: (visitId: string) => void;
};

export function ActionTable({
  actions,
  isLoading,
  onToggle,
  onEdit,
  onDelete,
  onOpenVisit,
}: ActionTableProps) {
  if (isLoading) {
    return (
      <div className="rounded-[32px] border border-border/70 bg-card/95 p-6 shadow-soft">
        <div className="space-y-3">
          <Skeleton className="h-12 w-full animate-soft-pulse rounded-2xl" />
          <Skeleton className="h-12 w-full animate-soft-pulse rounded-2xl" />
          <Skeleton className="h-12 w-3/4 animate-soft-pulse rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!actions.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-[32px] border border-dashed border-border/70 bg-card/95 px-12 py-16 text-center shadow-soft">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/15 text-2xl text-primary">
          ✅
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground">
            Nothing pending
          </p>
          <p className="text-sm text-muted-foreground">
            Action items created from visit summaries or added manually will show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[32px] border border-border/70 bg-card/95 shadow-soft transition-glide hover:shadow-floating">
      <Table>
        <TableHeader className="bg-surface/60">
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Completed</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-[200px] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {actions.map((action) => {
            const due = formatDate(action.dueAt);
            const created = formatDate(action.createdAt);
            const completed = formatDate(action.completedAt);
            const status = action.completed ? 'completed' : 'pending';
            const source =
              typeof action.source === 'string'
                ? action.source
                : action.visitId
                  ? 'visit'
                  : 'manual';

            return (
              <TableRow
                key={action.id}
                className="transition-glide hover:bg-primary/5"
              >
                <TableCell>
                  <Button
                    variant={action.completed ? 'secondary' : 'outline'}
                    size="sm"
                    className="gap-2 font-semibold"
                    onClick={() => onToggle(action)}
                  >
                    {action.completed ? (
                      <>
                        <Undo2 className="h-4 w-4" />
                        Mark pending
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Mark complete
                      </>
                    )}
                  </Button>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <span
                      className={cn(
                        'font-semibold text-foreground',
                        action.completed && 'line-through text-muted-foreground',
                      )}
                    >
                      {action.description || 'Action item'}
                    </span>
                    {action.notes ? (
                      <span className="text-xs text-muted-foreground">
                        {action.notes}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {due || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {created || '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {completed || '—'}
                </TableCell>
                <TableCell>
                  <Badge
                    tone={source === 'manual' ? 'brand' : 'neutral'}
                    variant={source === 'manual' ? 'soft' : 'outline'}
                    size="sm"
                    className="capitalize"
                  >
                    {source}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    {action.visitId && onOpenVisit ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-muted-foreground hover:text-primary"
                        onClick={() => onOpenVisit(action.visitId!)}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Visit
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => onEdit(action)}
                    >
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => onDelete(action)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(value: unknown) {
  if (!value || typeof value !== 'string') return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return format(parsed, 'MMM d, yyyy');
}

