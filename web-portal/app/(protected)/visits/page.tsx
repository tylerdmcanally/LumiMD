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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { useVisits } from '@/lib/api/hooks';
import { normalizeVisitStatus } from '@/lib/visits/status';
import { format } from 'date-fns';
import { Search, Filter, Calendar, ChevronDown, Folder, MapPin, Stethoscope, Trash2 } from 'lucide-react';
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
  folder: string;
  sortBy: 'date_desc' | 'date_asc';
};

const DEFAULT_FILTERS: VisitFilters = {
  search: '',
  provider: 'all',
  specialty: 'all',
  location: 'all',
  folder: 'all',
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
  const { providers, specialties, locations, folders } = React.useMemo(() => {
    const providerSet = new Set<string>();
    const specialtySet = new Set<string>();
    const locationSet = new Set<string>();
    const folderSet = new Set<string>();

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
      if (Array.isArray(visit.folders)) {
        visit.folders.forEach((folder: unknown) => {
          if (typeof folder === 'string' && folder.trim().length) {
            folderSet.add(folder.trim());
          }
        });
      }
    });

    return {
      providers: Array.from(providerSet).sort(),
      specialties: Array.from(specialtySet).sort(),
      locations: Array.from(locationSet).sort(),
      folders: Array.from(folderSet).sort(),
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

    if (filters.folder !== 'all') {
      result = result.filter((visit: any) => {
        const visitFolders = Array.isArray(visit.folders)
          ? visit.folders
              .filter((folder: unknown): folder is string => typeof folder === 'string')
              .map((folder) => folder.trim())
              .filter((folder) => folder.length > 0)
          : [];

        if (filters.folder === 'none') {
          return visitFolders.length === 0;
        }

        return visitFolders.includes(filters.folder);
      });
    }

    // Sort
    result.sort((a, b) => {
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();
      return filters.sortBy === 'date_desc' ? bTime - aTime : aTime - bTime;
    });

    return result;
  }, [visits, filters]);

  const [viewMode, setViewMode] = React.useState<'list' | 'folders'>('list');
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(
    () => new Set(),
  );
  const groupedVisits = React.useMemo(() => {
    const groups = new Map<
      string,
      {
        label: string;
        visits: any[];
      }
    >();

    filteredVisits.forEach((visit: any) => {
      const visitFolders = Array.isArray(visit.folders)
        ? visit.folders
            .filter((folder: unknown): folder is string => typeof folder === 'string')
            .map((folder) => folder.trim())
            .filter((folder) => folder.length > 0)
        : [];

      if (visitFolders.length === 0) {
        const key = '__unfiled__';
        const entry = groups.get(key);
        if (entry) {
          entry.visits.push(visit);
        } else {
          groups.set(key, {
            label: 'Unfiled visits',
            visits: [visit],
          });
        }
        return;
      }

      visitFolders.forEach((folder) => {
        const entry = groups.get(folder);
        if (entry) {
          entry.visits.push(visit);
        } else {
          groups.set(folder, {
            label: folder,
            visits: [visit],
          });
        }
      });
    });

    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === '__unfiled__') return 1;
        if (b === '__unfiled__') return -1;
        return a.localeCompare(b);
      })
      .map(([key, value]) => ({
        key,
        label: value.label,
        visits: value.visits,
      }));
  }, [filteredVisits]);
  const canShowFolderView = React.useMemo(
    () => groupedVisits.some((group) => group.key !== '__unfiled__' && group.visits.length > 0),
    [groupedVisits],
  );
  const allGroupsCollapsed = React.useMemo(
    () =>
      groupedVisits.length > 0 &&
      groupedVisits.every((group) => collapsedGroups.has(group.key)),
    [groupedVisits, collapsedGroups],
  );
  const toggleGroup = React.useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);
  const handleToggleAllGroups = React.useCallback(() => {
    setCollapsedGroups((prev) => {
      if (groupedVisits.length === 0) {
        return prev;
      }
      const shouldCollapse = groupedVisits.some((group) => !prev.has(group.key));
      if (!shouldCollapse) {
        return new Set<string>();
      }
      const next = new Set<string>();
      groupedVisits.forEach((group) => next.add(group.key));
      return next;
    });
  }, [groupedVisits]);

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

  React.useEffect(() => {
    if (isSelectionMode && viewMode === 'folders') {
      setViewMode('list');
    }
  }, [isSelectionMode, viewMode]);

  React.useEffect(() => {
    if (!canShowFolderView && viewMode === 'folders') {
      setViewMode('list');
    }
  }, [canShowFolderView, viewMode]);

  React.useEffect(() => {
    setCollapsedGroups((prev) => {
      const validKeys = new Set(groupedVisits.map((group) => group.key));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((key) => {
        if (validKeys.has(key)) {
          next.add(key);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [groupedVisits]);

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

  const isFilterActive = React.useMemo(() => {
    return (
      filters.search.trim().length > 0 ||
      filters.provider !== 'all' ||
      filters.specialty !== 'all' ||
      filters.location !== 'all' ||
      filters.folder !== 'all' ||
      filters.sortBy !== DEFAULT_FILTERS.sortBy
    );
  }, [filters]);

  const handleResetFilters = () => {
    setFilters(() => ({ ...DEFAULT_FILTERS }));
  };

  return (
    <TooltipProvider delayDuration={150}>
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

            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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
                <SelectTrigger className="rounded-xl border-border-light/80 bg-surface text-text-primary shadow-sm transition-smooth hover:border-brand-primary/50 focus-visible:ring-brand-primary/30">
                  <SelectValue placeholder="All Providers" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border-light/80 bg-surface shadow-lg">
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
                <SelectTrigger className="rounded-xl border-border-light/80 bg-surface text-text-primary shadow-sm transition-smooth hover:border-brand-primary/50 focus-visible:ring-brand-primary/30">
                  <SelectValue placeholder="All Specialties" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border-light/80 bg-surface shadow-lg">
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
                <SelectTrigger className="rounded-xl border-border-light/80 bg-surface text-text-primary shadow-sm transition-smooth hover:border-brand-primary/50 focus-visible:ring-brand-primary/30">
                  <SelectValue placeholder="All Locations" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border-light/80 bg-surface shadow-lg">
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((location) => (
                    <SelectItem key={location} value={location}>
                      {location}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.folder}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, folder: value }))
                }
              >
                <SelectTrigger className="rounded-xl border-border-light/80 bg-surface text-text-primary shadow-sm transition-smooth hover:border-brand-primary/50 focus-visible:ring-brand-primary/30">
                  <SelectValue placeholder="All Folders" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border-light/80 bg-surface shadow-lg">
                  <SelectItem value="all">All Folders</SelectItem>
                  <SelectItem value="none">No Folder</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder} value={folder}>
                      {folder}
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
                <SelectTrigger className="rounded-xl border-border-light/80 bg-surface text-text-primary shadow-sm transition-smooth hover:border-brand-primary/50 focus-visible:ring-brand-primary/30">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border border-border-light/80 bg-surface shadow-lg">
                  <SelectItem value="date_desc">Newest First</SelectItem>
                  <SelectItem value="date_asc">Oldest First</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-text-secondary">
                Search and filter by provider, specialty, location, or folder. Sorting updates instantly.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="self-start sm:self-auto"
                onClick={handleResetFilters}
                disabled={!isFilterActive}
              >
                Reset filters
              </Button>
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
                    : 'flex flex-col gap-3 md:flex-row md:items-center md:justify-between',
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
                  <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-text-secondary">
                      Showing {filteredVisits.length} visit
                      {filteredVisits.length === 1 ? '' : 's'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isSelectionMode && canShowFolderView ? (
                        <div className="flex items-center gap-1 rounded-full border border-border-light bg-background-subtle p-1">
                          <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={cn(
                              'rounded-full px-3 py-1 text-xs font-semibold transition-smooth',
                              viewMode === 'list'
                                ? 'bg-brand-primary text-white shadow-sm'
                                : 'text-text-secondary hover:text-text-primary',
                            )}
                            aria-pressed={viewMode === 'list'}
                          >
                            List
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode('folders')}
                            className={cn(
                              'rounded-full px-3 py-1 text-xs font-semibold transition-smooth',
                              viewMode === 'folders'
                                ? 'bg-brand-primary text-white shadow-sm'
                                : 'text-text-secondary hover:text-text-primary',
                            )}
                            aria-pressed={viewMode === 'folders'}
                          >
                            By folder
                          </button>
                        </div>
                      ) : null}
                      {viewMode === 'folders' && groupedVisits.length > 0 ? (
                        <button
                          type="button"
                          onClick={handleToggleAllGroups}
                          className="rounded-full px-3 py-1 text-xs font-semibold text-text-secondary transition-smooth hover:text-text-primary"
                        >
                          {allGroupsCollapsed ? 'Expand all' : 'Collapse all'}
                        </button>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleToggleSelectionMode}
                        className="w-full justify-center sm:w-auto"
                      >
                        Select visits
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden md:block">
                {viewMode === 'list' ? (
                  <>
                    <div
                      className={cn(
                        'grid items-center gap-4 border-b border-border-light bg-background-subtle px-6 py-4 text-sm font-semibold text-text-secondary',
                        isSelectionMode
                          ? 'grid-cols-[90px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_96px] lg:grid-cols-[120px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]'
                          : 'grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_96px] lg:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]',
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
                      <div className="hidden lg:block">Location</div>
                      <div>Status</div>
                      <div className="text-right">Actions</div>
                    </div>

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
                  </>
                ) : (
                  <div className="space-y-4 px-6 pb-6">
                    {groupedVisits.map((group) => {
                      const collapsed = collapsedGroups.has(group.key);
                      return (
                        <div
                          key={group.key}
                          className="rounded-3xl border border-border-light bg-background-subtle/40"
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.key)}
                            className="flex w-full items-center justify-between gap-3 rounded-3xl px-5 py-4 text-left transition-smooth hover:bg-background-subtle/80"
                          >
                            <div className="flex items-center gap-3">
                              <Folder className="h-4 w-4 text-brand-primary" />
                              <div>
                                <p className="font-semibold text-text-primary">{group.label}</p>
                                <p className="text-xs text-text-secondary">
                                  {group.visits.length} visit
                                  {group.visits.length === 1 ? '' : 's'}
                                </p>
                              </div>
                            </div>
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 text-text-secondary transition-transform',
                                collapsed ? '-rotate-90' : 'rotate-0',
                              )}
                              aria-hidden="true"
                            />
                          </button>
                          {!collapsed ? (
                            <>
                              <div
                                className={cn(
                                  'grid items-center gap-4 border-t border-border-light bg-background-subtle px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary',
                                  isSelectionMode
                                    ? 'grid-cols-[90px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_96px] lg:grid-cols-[120px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]'
                                    : 'grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_96px] lg:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]',
                                )}
                              >
                                {isSelectionMode && (
                                  <div className="flex items-center justify-center pr-8 text-[11px] font-semibold">
                                    Select
                                  </div>
                                )}
                                <div>Provider & Specialty</div>
                                <div>Date</div>
                                <div className="hidden lg:block">Location</div>
                                <div>Status</div>
                                <div className="text-right">Actions</div>
                              </div>
                              <div className="divide-y divide-border-light">
                                {group.visits.map((visit: any) => (
                                  <VisitRow
                                    key={`${group.key}-${visit.id}`}
                                    visit={visit}
                                    selectionMode={isSelectionMode}
                                    selected={selectedVisitIds.has(visit.id)}
                                    onToggleSelect={() => toggleSelectVisit(visit.id)}
                                    onDelete={() => openDeleteDialogFor([visit.id])}
                                    onView={() => router.push(`/visits/${visit.id}`)}
                                  />
                                ))}
                              </div>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mobile Cards */}
              <div className="space-y-3 px-4 pb-5 md:hidden">
                {viewMode === 'list'
                  ? filteredVisits.map((visit: any) => (
                      <VisitCard
                        key={visit.id}
                        visit={visit}
                        selectionMode={isSelectionMode}
                        selected={selectedVisitIds.has(visit.id)}
                        onToggleSelect={() => toggleSelectVisit(visit.id)}
                        onDelete={() => openDeleteDialogFor([visit.id])}
                        onView={() => router.push(`/visits/${visit.id}`)}
                      />
                    ))
                  : groupedVisits.map((group) => {
                      const collapsed = collapsedGroups.has(group.key);
                      return (
                        <div
                          key={group.key}
                          className="rounded-3xl border border-border-light bg-background-subtle/50"
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroup(group.key)}
                            className="flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-3 text-left transition-smooth hover:bg-background-subtle/80"
                          >
                            <div className="flex items-center gap-3">
                              <Folder className="h-4 w-4 text-brand-primary" />
                              <div>
                                <p className="font-semibold text-text-primary">{group.label}</p>
                                <p className="text-xs text-text-secondary">
                                  {group.visits.length} visit
                                  {group.visits.length === 1 ? '' : 's'}
                                </p>
                              </div>
                            </div>
                            <ChevronDown
                              className={cn(
                                'h-4 w-4 text-text-secondary transition-transform',
                                collapsed ? '-rotate-90' : 'rotate-0',
                              )}
                              aria-hidden="true"
                            />
                          </button>
                          {!collapsed ? (
                            <div className="space-y-3 px-2 pb-4 pt-1">
                              {group.visits.map((visit: any) => (
                                <VisitCard
                                  key={`${group.key}-${visit.id}`}
                                  visit={visit}
                                  selectionMode={isSelectionMode}
                                  selected={selectedVisitIds.has(visit.id)}
                                  onToggleSelect={() => toggleSelectVisit(visit.id)}
                                  onDelete={() => openDeleteDialogFor([visit.id])}
                                  onView={() => router.push(`/visits/${visit.id}`)}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
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
    </TooltipProvider>
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
    ? 'grid grid-cols-[90px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_96px] lg:grid-cols-[120px_minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]'
    : 'grid grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_96px] lg:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,1fr)_96px]';

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

  const providerName =
    typeof visit.provider === 'string' && visit.provider.trim().length
      ? visit.provider.trim()
      : 'Unknown Provider';
  const specialtyLabel =
    typeof visit.specialty === 'string' && visit.specialty.trim().length
      ? visit.specialty.trim()
      : 'General';
  const locationLabel =
    typeof visit.location === 'string' && visit.location.trim().length
      ? visit.location.trim()
      : '—';
  const tooltipClassName =
    'max-w-xs text-sm font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2';
  const showProviderTooltip = providerName.length > 28;
  const showSpecialtyTooltip = specialtyLabel.length > 28;
  const showLocationTooltip = locationLabel.length > 32;
  const visitFolders = React.useMemo(() => getVisitFolders(visit), [visit]);
  const displayFolders = React.useMemo(() => visitFolders.slice(0, 3), [visitFolders]);
  const remainingFolderCount = visitFolders.length - displayFolders.length;

  const providerLabel = (
    <p className="font-semibold text-text-primary truncate" title={providerName}>
      {providerName}
    </p>
  );

  const specialtyLabelNode = (
    <p className="text-sm text-text-secondary truncate" title={specialtyLabel}>
      {specialtyLabel}
    </p>
  );

  const locationLabelNode = (
    <span className="truncate text-sm" title={locationLabel}>
      {locationLabel}
    </span>
  );

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
          {showProviderTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>{providerLabel}</TooltipTrigger>
              <TooltipContent className={tooltipClassName}>{providerName}</TooltipContent>
            </Tooltip>
          ) : (
            providerLabel
          )}
          {showSpecialtyTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>{specialtyLabelNode}</TooltipTrigger>
              <TooltipContent className={tooltipClassName}>{specialtyLabel}</TooltipContent>
            </Tooltip>
          ) : (
            specialtyLabelNode
          )}
          <p className="mt-1 line-clamp-1 text-xs text-text-muted lg:hidden" title={locationLabel}>
            {locationLabel}
          </p>
        </div>
      </div>

      {/* Date */}
      <div className="flex items-center gap-2 text-text-secondary">
        <Calendar className="h-4 w-4" />
        <span>{date}</span>
      </div>

      {/* Location */}
      <div className="hidden lg:flex items-center gap-2 text-text-secondary">
        <MapPin className="h-4 w-4" />
        {showLocationTooltip ? (
          <Tooltip>
            <TooltipTrigger asChild>{locationLabelNode}</TooltipTrigger>
            <TooltipContent className={tooltipClassName}>{locationLabel}</TooltipContent>
          </Tooltip>
        ) : (
          locationLabelNode
        )}
      </div>

      {/* Status & Folders */}
      <div className="flex flex-col items-end gap-2 text-right">
        <Badge
          tone={VISIT_STATUS_STYLES[status]?.tone ?? 'neutral'}
          variant={VISIT_STATUS_STYLES[status]?.variant ?? 'outline'}
          size="sm"
        >
          {status}
        </Badge>
        {visitFolders.length ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            {displayFolders.map((folder) => {
              const folderBadge = (
                <Badge
                  size="sm"
                  tone="neutral"
                  variant="outline"
                  className="max-w-[140px] truncate bg-background-subtle/90 text-text-secondary"
                  leftIcon={<Folder className="h-3 w-3 text-text-tertiary" aria-hidden="true" />}
                  title={folder}
                >
                  <span className="truncate">{folder}</span>
                </Badge>
              );

              if (folder.length > 18) {
                return (
                  <Tooltip key={folder}>
                    <TooltipTrigger asChild>{folderBadge}</TooltipTrigger>
                    <TooltipContent className={tooltipClassName}>{folder}</TooltipContent>
                  </Tooltip>
                );
              }

              return <React.Fragment key={folder}>{folderBadge}</React.Fragment>;
            })}
            {remainingFolderCount > 0 ? (
              <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                +{remainingFolderCount}
              </span>
            ) : null}
          </div>
        ) : null}
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

  const providerName =
    typeof visit.provider === 'string' && visit.provider.trim().length
      ? visit.provider.trim()
      : 'Unknown provider';
  const specialtyLabel =
    typeof visit.specialty === 'string' && visit.specialty.trim().length
      ? visit.specialty.trim()
      : 'General';
  const locationLabel =
    typeof visit.location === 'string' && visit.location.trim().length
      ? visit.location.trim()
      : 'No location noted';

  const summarySnippet =
    typeof visit.summary === 'string' && visit.summary.trim().length
      ? truncateText(visit.summary.trim(), 220)
      : null;
  const visitFolders = React.useMemo(() => getVisitFolders(visit), [visit]);
  const displayedFolders = React.useMemo(() => visitFolders.slice(0, 3), [visitFolders]);
  const remainingFolderCount = visitFolders.length - displayedFolders.length;
  const folderTooltipClassName =
    'max-w-xs text-sm font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2';

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
            <h3 className="text-lg font-semibold text-text-primary line-clamp-2" title={providerName}>
              {providerName}
            </h3>
            <p className="text-sm text-text-secondary line-clamp-1" title={specialtyLabel}>
              {specialtyLabel}
            </p>
            {visitFolders.length ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {displayedFolders.map((folder) => {
                  const badge = (
                    <Badge
                      size="sm"
                      tone="neutral"
                      variant="soft"
                      className="max-w-[160px] truncate bg-background-subtle text-text-secondary"
                      leftIcon={<Folder className="h-3 w-3 text-text-tertiary" aria-hidden="true" />}
                      title={folder}
                    >
                      <span className="truncate">{folder}</span>
                    </Badge>
                  );

                  if (folder.length > 20) {
                    return (
                      <Tooltip key={folder}>
                        <TooltipTrigger asChild>{badge}</TooltipTrigger>
                        <TooltipContent className={folderTooltipClassName}>{folder}</TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <React.Fragment key={folder}>{badge}</React.Fragment>;
                })}
                {remainingFolderCount > 0 ? (
                  <span className="rounded-full bg-background-subtle px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    +{remainingFolderCount}
                  </span>
                ) : null}
              </div>
            ) : null}
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
        <span className="flex-1 line-clamp-2" title={locationLabel}>
          {locationLabel}
        </span>
      </div>

      {summarySnippet ? (
        <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-text-secondary/90" title={summarySnippet}>
          {summarySnippet}
        </p>
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

function getVisitFolders(visit: any): string[] {
  if (!visit || !Array.isArray(visit.folders)) {
    return [];
  }

  return visit.folders
    .filter((folder: unknown): folder is string => typeof folder === 'string')
    .map((folder) => folder.trim())
    .filter((folder) => folder.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}
