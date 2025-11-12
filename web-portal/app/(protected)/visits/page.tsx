'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useVisits } from '@/lib/api/hooks';
import { normalizeVisitStatus } from '@/lib/visits/status';
import { format } from 'date-fns';
import { Search, Filter, Calendar, MapPin, Stethoscope, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteDoc, doc } from 'firebase/firestore';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';

type VisitFilters = {
  search: string;
  provider: string;
  specialty: string;
  location: string;
  sortBy: 'date_desc' | 'date_asc';
};

const DEFAULT_FILTERS: VisitFilters = {
  search: '',
  provider: 'all',
  specialty: 'all',
  location: 'all',
  sortBy: 'date_desc',
};

const VISIT_STATUS_STYLES: Record<
  string,
  {
    tone: 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'info';
    variant: 'soft' | 'solid' | 'outline';
  }
> = {
  completed: { tone: 'success', variant: 'soft' },
  processing: { tone: 'warning', variant: 'soft' },
  pending: { tone: 'neutral', variant: 'outline' },
  failed: { tone: 'danger', variant: 'soft' },
};

export default function VisitsPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [filters, setFilters] = React.useState<VisitFilters>(DEFAULT_FILTERS);

  const { data: visits = [], isLoading } = useVisits(user?.uid);

  // Extract unique providers and statuses for filters
  const { providers, specialties, locations } = React.useMemo(() => {
    const providerSet = new Set<string>();
    const specialtySet = new Set<string>();
    const locationSet = new Set<string>();

    visits.forEach((visit: any) => {
      if (typeof visit.provider === 'string' && visit.provider.trim().length) {
        providerSet.add(visit.provider.trim());
      }
      if (typeof visit.specialty === 'string' && visit.specialty.trim().length) {
        specialtySet.add(visit.specialty.trim());
      }
      if (typeof visit.location === 'string' && visit.location.trim().length) {
        locationSet.add(visit.location.trim());
      }
    });

    return {
      providers: Array.from(providerSet).sort(),
      specialties: Array.from(specialtySet).sort(),
      locations: Array.from(locationSet).sort(),
    };
  }, [visits]);

  // Filter and sort visits
  const filteredVisits = React.useMemo(() => {
    let result = [...visits];

    // Search filter
    if (filters.search) {
      const query = filters.search.toLowerCase();
      result = result.filter((visit: any) =>
        [visit.provider, visit.specialty, visit.location, visit.summary]
          .filter(Boolean)
          .some((field) => field.toLowerCase().includes(query))
      );
    }

    // Provider filter
    if (filters.provider !== 'all') {
      result = result.filter(
        (visit: any) =>
          (typeof visit.provider === 'string' ? visit.provider.trim() : '') ===
          filters.provider,
      );
    }

    // Specialty filter
    if (filters.specialty !== 'all') {
      result = result.filter(
        (visit: any) =>
          (typeof visit.specialty === 'string' ? visit.specialty.trim() : '') ===
          filters.specialty,
      );
    }

    // Location filter
    if (filters.location !== 'all') {
      result = result.filter(
        (visit: any) =>
          (typeof visit.location === 'string' ? visit.location.trim() : '') ===
          filters.location,
      );
    }

    // Sort
    result.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return filters.sortBy === 'date_desc' ? bTime - aTime : aTime - bTime;
    });

    return result;
  }, [visits, filters]);

  type VisitStats = { total: number } & Record<string, number>;

  // Stats
  const stats = React.useMemo<VisitStats>(() => {
    const statusMap: Record<string, number> = {};
    filteredVisits.forEach((visit: any) => {
      const status = normalizeVisitStatus(visit);
      statusMap[status] = (statusMap[status] || 0) + 1;
    });
    return {
      total: filteredVisits.length,
      ...statusMap,
    };
  }, [filteredVisits]);

  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedVisitIds, setSelectedVisitIds] = React.useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

  const visitIds = React.useMemo(
    () => filteredVisits.map((visit: any) => visit.id),
    [filteredVisits],
  );

  const allSelected =
    visitIds.length > 0 && visitIds.every((id) => selectedVisitIds.has(id));
  const hasSelection = selectedVisitIds.size > 0;

  const toggleSelectVisit = (id: string) => {
    setSelectedVisitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedVisitIds(checked ? new Set(visitIds) : new Set());
  };

  const openDeleteDialogFor = (ids?: string[]) => {
    if (ids && ids.length) {
      setSelectedVisitIds(new Set(ids));
    }
    setDeleteDialogOpen(true);
  };

  const clearSelection = () => setSelectedVisitIds(new Set());

  const handleToggleSelectionMode = () => {
    if (isSelectionMode) {
      clearSelection();
      setDeleteDialogOpen(false);
      setIsSelectionMode(false);
    } else {
      setIsSelectionMode(true);
    }
  };

  const handleConfirmDelete = async () => {
    const ids = Array.from(selectedVisitIds);
    if (ids.length === 0) {
      setDeleteDialogOpen(false);
      return;
    }

    try {
      await Promise.all(ids.map((id) => deleteDoc(doc(db, 'visits', id))));
      toast.success(
        ids.length === 1
          ? 'Visit deleted successfully.'
          : `${ids.length} visits deleted.`,
      );
      setSelectedVisitIds(new Set());
    } catch (error) {
      console.error('[visits] Failed to delete visit(s)', error);
      toast.error('Unable to delete visit(s). Please try again.');
    } finally {
      setDeleteDialogOpen(false);
    }
  };

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-8 animate-fade-in-up">
        <PageHeader
          title="Visits"
          subtitle="View and manage your medical visit history"
        />

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          <StatCard label="Total Visits" value={stats.total} />
          <div className="hidden xl:block">
            <StatCard
              label="Completed"
              value={stats.completed || 0}
              variant="success"
            />
          </div>
          <div className="hidden xl:block">
            <StatCard
              label="Processing"
              value={stats.processing || 0}
              variant="warning"
            />
          </div>
          <div className="hidden xl:block">
            <StatCard
              label="Pending"
              value={stats.pending || 0}
              variant="neutral"
            />
          </div>
        </div>

        {/* Filters */}
        <Card variant="elevated" padding="lg">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-text-tertiary" />
              <h3 className="font-semibold text-text-primary">Filters</h3>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
              <Input
                placeholder="Search visits..."
                value={filters.search}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, search: e.target.value }))
                }
                leftIcon={<Search className="h-4 w-4" />}
              />

              <Select
                value={filters.provider}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, provider: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  {providers.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {provider}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.specialty}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, specialty: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Specialties" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Specialties</SelectItem>
                  {specialties.map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>
                      {specialty}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.location}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, location: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.sortBy}
                onValueChange={(value: any) =>
                  setFilters((prev) => ({ ...prev, sortBy: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Newest First</SelectItem>
                  <SelectItem value="date_asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Visits Table/List */}
        <Card variant="elevated" padding="none">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
              <p className="mt-4 text-text-secondary">Loading visits...</p>
            </div>
          ) : filteredVisits.length === 0 ? (
            <div className="p-12 text-center">
              <Stethoscope className="mx-auto h-12 w-12 text-text-tertiary" />
              <h3 className="mt-4 font-semibold text-text-primary">
                No visits found
              </h3>
              <p className="mt-2 text-sm text-text-secondary">
                {filters.search ||
                filters.provider !== 'all' ||
                filters.specialty !== 'all' ||
                filters.location !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Record your first visit to get started'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className={cn(
                  'px-4 pt-4 text-sm transition-smooth sm:px-6',
                  isSelectionMode
                    ? 'rounded-t-3xl border border-border-light bg-background-subtle/70 pb-4'
                    : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
                )}
              >
                {isSelectionMode ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p
                      className={cn(
                        'text-text-secondary',
                        hasSelection && 'text-text-primary',
                      )}
                    >
                      {hasSelection
                        ? `${selectedVisitIds.size} selected`
                        : 'Tap visits to select them'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
                        size="sm"
                        onClick={clearSelection}
                        className="text-text-secondary hover:text-text-primary"
                        disabled={!hasSelection}
                      >
                        Clear selection
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => openDeleteDialogFor()}
                        disabled={!hasSelection}
                      >
                        Delete selected
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleToggleSelectionMode}
                      >
                        Cancel
          </Button>
        </div>
                  </div>
                ) : (
                  <>
                    <p className="text-text-secondary">
                      Showing {filteredVisits.length} visit
                      {filteredVisits.length === 1 ? '' : 's'}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleToggleSelectionMode}
                      className="w-full justify-center sm:w-auto"
                    >
                      Select visits
                    </Button>
                  </>
                )}
              </div>

              <div className="hidden md:block">
                {/* Table Header */}
                <div
                  className={cn(
                    'grid items-center gap-4 border-b border-border-light bg-background-subtle px-6 py-4 text-sm font-semibold text-text-secondary',
                    isSelectionMode
                      ? 'grid-cols-[120px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]'
                      : 'grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_96px]',
                  )}
                >
                  {isSelectionMode && (
                    <div className="flex items-center justify-center pr-8">
                      <button
                        type="button"
                        onClick={() => toggleSelectAll(!allSelected)}
                        aria-pressed={allSelected}
                        className={cn(
                          'rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-wide transition-smooth shadow-sm',
                          allSelected
                            ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
                            : 'border-brand-primary/40 bg-brand-primary/8 text-brand-primary hover:bg-brand-primary/12',
                        )}
                      >
                        {allSelected ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                  )}
                  <div>Provider & Specialty</div>
                  <div>Date</div>
                  <div>Location</div>
                  <div>Status</div>
                  <div className="text-right">Actions</div>
                </div>

                {/* Table Body */}
                <div className="divide-y divide-border-light">
                  {filteredVisits.map((visit: any) => (
                    <VisitRow
                      key={visit.id}
                      visit={visit}
                      selectionMode={isSelectionMode}
                      selected={selectedVisitIds.has(visit.id)}
                      onToggleSelect={() => toggleSelectVisit(visit.id)}
                      onDelete={() => openDeleteDialogFor([visit.id])}
                      onView={() => router.push(`/visits/${visit.id}`)}
                    />
                  ))}
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="space-y-3 px-4 pb-5 md:hidden">
                {filteredVisits.map((visit: any) => (
                  <VisitCard
                    key={visit.id}
                    visit={visit}
                    selectionMode={isSelectionMode}
                    selected={selectedVisitIds.has(visit.id)}
                    onToggleSelect={() => toggleSelectVisit(visit.id)}
                    onDelete={() => openDeleteDialogFor([visit.id])}
                    onView={() => router.push(`/visits/${visit.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </Card>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                Delete {selectedVisitIds.size > 1 ? 'visits' : 'visit'}?
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. The selected visit
                {selectedVisitIds.size > 1 ? 's will' : ' will'} be removed permanently.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleConfirmDelete}>
                Confirm delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

function VisitRow({
  visit,
  selectionMode,
  selected,
  onToggleSelect,
  onDelete,
  onView,
}: {
  visit: any;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const status = normalizeVisitStatus(visit);
  const date = visit.createdAt
    ? format(new Date(visit.createdAt), 'MMM d, yyyy')
    : '—';

  const columnsClass = selectionMode
    ? 'grid grid-cols-[120px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]'
    : 'grid grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_96px]';

  const handleRowClick = () => {
    if (selectionMode) {
      onToggleSelect();
    } else {
      onView();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleRowClick();
    }
  };

  return (
    <div
      className={cn(
        'group cursor-pointer items-center gap-4 px-6 py-5 transition-smooth hover:bg-hover',
        columnsClass,
        selectionMode && selected && 'bg-brand-primary-pale/25 ring-1 ring-brand-primary/30',
      )}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      {selectionMode && (
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
            checked={selected}
            aria-label="Select visit"
            onChange={(event) => {
              event.stopPropagation();
              onToggleSelect();
            }}
          />
        </div>
      )}

      {/* Provider & Specialty */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary-pale">
          <Stethoscope className="h-5 w-5 text-brand-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-text-primary truncate">
            {visit.provider || 'Unknown Provider'}
          </p>
          <p className="text-sm text-text-secondary truncate">
            {visit.specialty || 'General'}
          </p>
        </div>
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 text-text-secondary">
        <Calendar className="h-4 w-4" />
        <span>{date}</span>
      </div>

      {/* Location */}
      <div className="flex items-center gap-2 text-text-secondary">
        <MapPin className="h-4 w-4" />
        <span className="truncate text-sm">{visit.location || '—'}</span>
      </div>

      {/* Status */}
      <div className="flex items-center">
        <Badge
          tone={VISIT_STATUS_STYLES[status]?.tone ?? 'neutral'}
          variant={VISIT_STATUS_STYLES[status]?.variant ?? 'outline'}
          size="sm"
        >
          {status}
        </Badge>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-error hover:text-error focus-visible:ring-error"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function VisitCard({
  visit,
  selectionMode,
  selected,
  onToggleSelect,
  onDelete,
  onView,
}: {
  visit: any;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onView: () => void;
}) {
  const status = normalizeVisitStatus(visit);
  const visitDate = visit.createdAt ? new Date(visit.createdAt) : null;
  const formattedDate = visitDate ? format(visitDate, 'MMM d, yyyy') : '—';
  const formattedTime = visitDate ? format(visitDate, 'h:mm a') : null;

  const locationLabel =
    typeof visit.location === 'string' && visit.location.trim().length
      ? visit.location.trim()
      : 'No location noted';

  const summarySnippet =
    typeof visit.summary === 'string' && visit.summary.trim().length
      ? truncateText(visit.summary.trim(), 220)
      : null;

  const handleCardClick = () => {
    if (selectionMode) {
      onToggleSelect();
    } else {
      onView();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCardClick();
    }
  };

  return (
    <div
      className={cn(
        'relative rounded-3xl border border-border-light bg-surface px-5 py-5 shadow-soft transition-smooth',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
        selectionMode ? 'cursor-pointer' : 'cursor-pointer hover:shadow-hover',
        selectionMode && selected && 'border-brand-primary ring-2 ring-brand-primary/40 shadow-elevated',
      )}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {formattedDate}
            {formattedTime ? ` • ${formattedTime}` : ''}
          </p>
          <div>
            <h3 className="text-lg font-semibold text-text-primary">
              {visit.provider || 'Unknown provider'}
            </h3>
            <p className="text-sm text-text-secondary">
              {visit.specialty || 'General'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge
            tone={VISIT_STATUS_STYLES[status]?.tone ?? 'neutral'}
            variant={VISIT_STATUS_STYLES[status]?.variant ?? 'outline'}
            size="sm"
          >
            {status}
          </Badge>
          {selectionMode && (
            <span
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide',
                selected
                  ? 'bg-brand-primary text-white'
                  : 'bg-brand-primary/10 text-brand-primary',
              )}
            >
              {selected ? 'Selected' : 'Tap to select'}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 text-sm text-text-secondary">
        <MapPin className="mt-0.5 h-4 w-4 text-brand-primary/80" />
        <span className="flex-1">
          {locationLabel}
        </span>
      </div>

      {summarySnippet ? (
        <p className="mt-4 text-sm leading-relaxed text-text-secondary/90">{summarySnippet}</p>
      ) : null}

      <div className="mt-5 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 justify-center"
          onClick={(event) => {
            event.stopPropagation();
            onView();
          }}
          disabled={selectionMode}
        >
          View details
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-error hover:text-error focus-visible:ring-error"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          disabled={selectionMode}
          aria-label="Delete visit"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}
