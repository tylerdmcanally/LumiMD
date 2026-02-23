'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { format, isAfter, isBefore, parseISO, startOfDay, endOfDay } from 'date-fns';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Calendar,
  MapPin,
  ChevronRight,
  Stethoscope,
  Search,
  Filter,
  X,
  Pin,
  PinOff,
  StickyNote,
  MoreVertical,
  Download,
  FileText,
  Copy,
  Check,
} from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  useCareVisitsPage,
  useCaregiverNotes,
  useSaveCaregiverNote,
  useDeleteCaregiverNote,
  useCareSummaryExport,
  type CaregiverNote,
  type CareSummaryExport,
  type Visit,
} from '@/lib/api/hooks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type VisitFilters = {
  search: string;
  specialty: string;
  provider: string;
  dateFrom: string;
  dateTo: string;
};

const DEFAULT_FILTERS: VisitFilters = {
  search: '',
  specialty: 'all',
  provider: 'all',
  dateFrom: '',
  dateTo: '',
};

const CARE_VISITS_PAGE_SIZE = 50;

function extractDiagnosisLabels(visit: any): string[] {
  const legacyDiagnoses = Array.isArray(visit?.diagnoses)
    ? visit.diagnoses
        .map((value: unknown) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value: string) => value.length > 0)
    : [];

  if (legacyDiagnoses.length > 0) {
    return legacyDiagnoses;
  }

  const detailedDiagnoses = Array.isArray(visit?.diagnosesDetailed)
    ? visit.diagnosesDetailed
        .map((value: unknown) => {
          if (!value || typeof value !== 'object') return '';
          const name = (value as Record<string, unknown>).name;
          return typeof name === 'string' ? name.trim() : '';
        })
        .filter((value: string) => value.length > 0)
    : [];

  return detailedDiagnoses;
}

export default function PatientVisitsPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = params.patientId;

  const [cursor, setCursor] = React.useState<string | null>(null);
  const [visits, setVisits] = React.useState<Visit[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  const {
    data: visitsPage,
    isLoading,
    isFetching,
    error,
  } = useCareVisitsPage(patientId, {
    limit: CARE_VISITS_PAGE_SIZE,
    cursor,
  });
  const { data: notes = [] } = useCaregiverNotes(patientId);

  React.useEffect(() => {
    setCursor(null);
    setVisits([]);
    setHasMore(false);
    setNextCursor(null);
  }, [patientId]);

  React.useEffect(() => {
    if (!visitsPage) return;
    setVisits((previous) => {
      const byId = new Map<string, Visit>();
      previous.forEach((visit) => byId.set(visit.id, visit));
      visitsPage.items.forEach((visit) => byId.set(visit.id, visit));
      return Array.from(byId.values());
    });
    setHasMore(visitsPage.hasMore);
    setNextCursor(visitsPage.nextCursor);
  }, [visitsPage]);

  // Create a map of visitId -> note for quick lookup
  const notesMap = React.useMemo(() => {
    const map = new Map<string, CaregiverNote>();
    notes.forEach((note) => {
      map.set(note.visitId, note);
    });
    return map;
  }, [notes]);

  // Initialize filters from URL params
  const [filters, setFilters] = React.useState<VisitFilters>(() => ({
    search: searchParams.get('q') || '',
    specialty: searchParams.get('specialty') || 'all',
    provider: searchParams.get('provider') || 'all',
    dateFrom: searchParams.get('from') || '',
    dateTo: searchParams.get('to') || '',
  }));

  // Note editing state
  const [noteDialogOpen, setNoteDialogOpen] = React.useState(false);
  const [editingVisitId, setEditingVisitId] = React.useState<string | null>(null);
  const [noteText, setNoteText] = React.useState('');

  // Export state
  const [exportDialogOpen, setExportDialogOpen] = React.useState(false);
  const [exportData, setExportData] = React.useState<CareSummaryExport | null>(null);
  const [isExporting, setIsExporting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const saveCaregiverNote = useSaveCaregiverNote();
  const deleteCaregiverNote = useDeleteCaregiverNote();
  const { refetch: fetchExportSummary } = useCareSummaryExport(patientId);

  // Update URL when filters change
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('q', filters.search);
    if (filters.specialty !== 'all') params.set('specialty', filters.specialty);
    if (filters.provider !== 'all') params.set('provider', filters.provider);
    if (filters.dateFrom) params.set('from', filters.dateFrom);
    if (filters.dateTo) params.set('to', filters.dateTo);
    
    const queryString = params.toString();
    const newUrl = queryString 
      ? `/care/${patientId}/visits?${queryString}`
      : `/care/${patientId}/visits`;
    
    router.replace(newUrl, { scroll: false });
  }, [filters, patientId, router]);

  // Extract unique specialties and providers from visits
  const { specialties, providers } = React.useMemo(() => {
    if (!visits) return { specialties: [], providers: [] };
    
    const specialtySet = new Set<string>();
    const providerSet = new Set<string>();

    visits.forEach((visit: any) => {
      if (typeof visit.specialty === 'string' && visit.specialty.trim()) {
        specialtySet.add(visit.specialty.trim());
      }
      if (typeof visit.provider === 'string' && visit.provider.trim()) {
        providerSet.add(visit.provider.trim());
      }
    });

    return {
      specialties: Array.from(specialtySet).sort(),
      providers: Array.from(providerSet).sort(),
    };
  }, [visits]);

  // Filter and sort visits
  const { pinnedVisits, regularVisits } = React.useMemo(() => {
    if (!visits) return { pinnedVisits: [], regularVisits: [] };
    
    let result = [...visits];

    // Search filter (searches provider, specialty, summary, diagnoses)
    if (filters.search.trim()) {
      const query = filters.search.toLowerCase().trim();
      result = result.filter((visit: any) => {
        const diagnosisLabels = extractDiagnosisLabels(visit);
        const searchableFields = [
          visit.provider,
          visit.specialty,
          visit.location,
          visit.summary,
          ...diagnosisLabels,
        ].filter(Boolean);
        
        return searchableFields.some((field) => 
          String(field).toLowerCase().includes(query)
        );
      });
    }

    // Specialty filter
    if (filters.specialty !== 'all') {
      result = result.filter((visit: any) =>
        (visit.specialty?.trim() || '') === filters.specialty
      );
    }

    // Provider filter
    if (filters.provider !== 'all') {
      result = result.filter((visit: any) =>
        (visit.provider?.trim() || '') === filters.provider
      );
    }

    // Date range filter
    if (filters.dateFrom) {
      const fromDate = startOfDay(parseISO(filters.dateFrom));
      result = result.filter((visit: any) => {
        const visitDate = visit.visitDate || visit.createdAt;
        if (!visitDate) return false;
        return !isBefore(new Date(visitDate), fromDate);
      });
    }

    if (filters.dateTo) {
      const toDate = endOfDay(parseISO(filters.dateTo));
      result = result.filter((visit: any) => {
        const visitDate = visit.visitDate || visit.createdAt;
        if (!visitDate) return false;
        return !isAfter(new Date(visitDate), toDate);
      });
    }

    // Sort by date descending
    result.sort((a, b) => {
      const aDate = new Date(a.visitDate || a.createdAt || 0).getTime();
      const bDate = new Date(b.visitDate || b.createdAt || 0).getTime();
      return bDate - aDate;
    });

    // Separate pinned from regular
    const pinned = result.filter((visit) => notesMap.get(visit.id)?.pinned);
    const regular = result.filter((visit) => !notesMap.get(visit.id)?.pinned);

    return { pinnedVisits: pinned, regularVisits: regular };
  }, [visits, filters, notesMap]);

  const isFilterActive = React.useMemo(() => {
    return (
      filters.search.trim().length > 0 ||
      filters.specialty !== 'all' ||
      filters.provider !== 'all' ||
      filters.dateFrom !== '' ||
      filters.dateTo !== ''
    );
  }, [filters]);

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleOpenNoteDialog = (visitId: string) => {
    const existingNote = notesMap.get(visitId);
    setEditingVisitId(visitId);
    setNoteText(existingNote?.note || '');
    setNoteDialogOpen(true);
  };

  const handleSaveNote = async () => {
    if (!editingVisitId) return;
    
    try {
      await saveCaregiverNote.mutateAsync({
        patientId,
        visitId: editingVisitId,
        note: noteText,
      });
      toast.success('Note saved');
      setNoteDialogOpen(false);
      setEditingVisitId(null);
      setNoteText('');
    } catch (err) {
      toast.error('Failed to save note');
    }
  };

  const handleTogglePin = async (visitId: string) => {
    const existingNote = notesMap.get(visitId);
    const newPinned = !existingNote?.pinned;
    
    try {
      await saveCaregiverNote.mutateAsync({
        patientId,
        visitId,
        pinned: newPinned,
      });
      toast.success(newPinned ? 'Visit pinned' : 'Visit unpinned');
    } catch (err) {
      toast.error('Failed to update pin');
    }
  };

  const handleDeleteNote = async (visitId: string) => {
    try {
      await deleteCaregiverNote.mutateAsync({
        patientId,
        visitId,
      });
      toast.success('Note deleted');
    } catch (err) {
      toast.error('Failed to delete note');
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await fetchExportSummary();
      if (result.data) {
        setExportData(result.data);
        setExportDialogOpen(true);
      }
    } catch (err) {
      toast.error('Failed to generate care summary');
    } finally {
      setIsExporting(false);
    }
  };

  const formatExportText = (data: CareSummaryExport): string => {
    const lines: string[] = [];
    
    lines.push('='.repeat(60));
    lines.push('CARE SUMMARY');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Patient: ${data.patient.name}`);
    lines.push(`Generated: ${new Date(data.generatedAt).toLocaleString()}`);
    lines.push('');
    
    lines.push('-'.repeat(40));
    lines.push('OVERVIEW');
    lines.push('-'.repeat(40));
    lines.push(`Total Visits: ${data.overview.totalVisits}`);
    lines.push(`Conditions Tracked: ${data.overview.totalConditions}`);
    lines.push(`Providers Seen: ${data.overview.totalProviders}`);
    lines.push(`Active Medications: ${data.overview.activeMedications}`);
    lines.push(`Pending Actions: ${data.overview.pendingActions}`);
    lines.push('');

    if (data.conditions.length > 0) {
      lines.push('-'.repeat(40));
      lines.push('CONDITIONS');
      lines.push('-'.repeat(40));
      data.conditions.forEach((c) => lines.push(`  • ${c}`));
      lines.push('');
    }

    if (data.currentMedications.length > 0) {
      lines.push('-'.repeat(40));
      lines.push('CURRENT MEDICATIONS');
      lines.push('-'.repeat(40));
      data.currentMedications.forEach((med) => {
        let line = `  • ${med.name}`;
        if (med.dosage) line += ` - ${med.dosage}`;
        if (med.frequency) line += ` (${med.frequency})`;
        lines.push(line);
      });
      lines.push('');
    }

    if (data.pendingActions.length > 0) {
      lines.push('-'.repeat(40));
      lines.push('PENDING ACTION ITEMS');
      lines.push('-'.repeat(40));
      data.pendingActions.forEach((action) => {
        let line = `  • ${action.title}`;
        if (action.dueDate) {
          line += ` (Due: ${new Date(action.dueDate).toLocaleDateString()})`;
        }
        lines.push(line);
      });
      lines.push('');
    }

    if (data.recentVisits.length > 0) {
      lines.push('-'.repeat(40));
      lines.push('RECENT VISITS');
      lines.push('-'.repeat(40));
      data.recentVisits.forEach((visit) => {
        lines.push('');
        if (visit.date) {
          lines.push(`  Date: ${new Date(visit.date).toLocaleDateString()}`);
        }
        if (visit.provider) {
          lines.push(`  Provider: ${visit.provider}${visit.specialty ? ` (${visit.specialty})` : ''}`);
        }
        if (visit.diagnoses.length > 0) {
          lines.push(`  Diagnoses: ${visit.diagnoses.join(', ')}`);
        }
        if (visit.summary) {
          lines.push(`  Summary: ${visit.summary}`);
        }
      });
    }

    return lines.join('\n');
  };

  const handleCopyToClipboard = async () => {
    if (!exportData) return;
    try {
      await navigator.clipboard.writeText(formatExportText(exportData));
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const handleDownloadText = () => {
    if (!exportData) return;
    const text = formatExportText(exportData);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `care-summary-${exportData.patient.name.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Summary downloaded');
  };

  if (isLoading && visits.length === 0) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
          <p className="text-sm text-text-secondary">Loading visit history...</p>
        </div>
      </PageContainer>
    );
  }

  if (error && visits.length === 0) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">
            Unable to load visits
          </h2>
          <p className="text-text-secondary mb-4">
            {error.message || 'An error occurred while loading visits.'}
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

  const totalVisits = visits.length;
  const filteredCount = pinnedVisits.length + regularVisits.length;

  return (
    <PageContainer maxWidth="2xl">
      <div className="space-y-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/care/${patientId}`} className="flex items-center text-text-secondary hover:text-brand-primary">
            <ArrowLeft className="h-4 w-4 mr-2 shrink-0" />
            <span>Back to Overview</span>
          </Link>
        </Button>

        {/* Header */}
        <PageHeader
          title="Visit History"
          subtitle={
            isFilterActive
              ? `Showing ${filteredCount} of ${totalVisits} visit${totalVisits !== 1 ? 's' : ''}`
              : `${totalVisits} visit${totalVisits !== 1 ? 's' : ''} recorded`
          }
          actions={
            totalVisits > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>Export Summary</span>
              </Button>
            ) : null
          }
        />

        {/* Filters */}
        {totalVisits > 0 && (
          <Card variant="elevated" padding="md">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-text-muted" />
                <span className="text-sm font-medium text-text-secondary">Filter visits</span>
              </div>

              {/* Filter Controls */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {/* Search */}
                <div className="sm:col-span-2 lg:col-span-1">
                  <Input
                    placeholder="Search visits..."
                    value={filters.search}
                    onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                    leftIcon={<Search className="h-4 w-4" />}
                  />
                </div>

                {/* Specialty */}
                <Select
                  value={filters.specialty}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, specialty: value }))}
                >
                  <SelectTrigger className="rounded-xl border-border-light/80 bg-surface text-text-primary shadow-sm">
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

                {/* Provider */}
                <Select
                  value={filters.provider}
                  onValueChange={(value) => setFilters((prev) => ({ ...prev, provider: value }))}
                >
                  <SelectTrigger className="rounded-xl border-border-light/80 bg-surface text-text-primary shadow-sm">
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

                {/* Date range placeholder for grid alignment */}
                <div className="hidden lg:block" />
              </div>

              {/* Date range row */}
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-muted">Date range:</span>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                    className="w-36 h-8 text-xs"
                  />
                  <span className="text-text-muted">to</span>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                    className="w-36 h-8 text-xs"
                  />
                </div>

                {isFilterActive && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetFilters}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear filters
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Empty State */}
        {totalVisits === 0 ? (
          <Card variant="elevated" padding="lg" className="text-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background-subtle mx-auto mb-4">
              <Stethoscope className="h-8 w-8 text-text-muted" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              No visits yet
            </h2>
            <p className="text-text-secondary max-w-sm mx-auto">
              Visit summaries will appear here once the patient records and processes their medical visits.
            </p>
          </Card>
        ) : filteredCount === 0 ? (
          <Card variant="elevated" padding="lg" className="text-center py-12">
            <Search className="h-10 w-10 text-text-muted mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              No matching visits
            </h2>
            <p className="text-text-secondary mb-4">
              Try adjusting your filters to find what you're looking for.
            </p>
            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              Clear all filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Pinned Visits Section */}
            {pinnedVisits.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
                  <Pin className="h-4 w-4" />
                  Pinned ({pinnedVisits.length})
                </h2>
                <div className="space-y-3">
                  {pinnedVisits.map((visit) => (
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      patientId={patientId}
                      searchQuery={filters.search}
                      note={notesMap.get(visit.id)}
                      onTogglePin={() => handleTogglePin(visit.id)}
                      onEditNote={() => handleOpenNoteDialog(visit.id)}
                      onDeleteNote={() => handleDeleteNote(visit.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Regular Visits Section */}
            {regularVisits.length > 0 && (
              <section>
                {pinnedVisits.length > 0 && (
                  <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
                    All Visits ({regularVisits.length})
                  </h2>
                )}
                <div className="space-y-3">
                  {regularVisits.map((visit) => (
                    <VisitCard
                      key={visit.id}
                      visit={visit}
                      patientId={patientId}
                      searchQuery={filters.search}
                      note={notesMap.get(visit.id)}
                      onTogglePin={() => handleTogglePin(visit.id)}
                      onEditNote={() => handleOpenNoteDialog(visit.id)}
                      onDeleteNote={() => handleDeleteNote(visit.id)}
                    />
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
                  <span>{isFetching ? 'Loading...' : 'Load more visits'}</span>
                </Button>
              </div>
            )}

            {error && visits.length > 0 && (
              <p className="text-sm text-error text-center">
                Unable to load more visits right now.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Note Edit Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Add a private note to this visit. Only you can see this note.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Enter your note..."
            rows={4}
            className="resize-none"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveNote}
              disabled={saveCaregiverNote.isPending}
            >
              {saveCaregiverNote.isPending ? 'Saving...' : 'Save Note'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-text-muted" />
              Care Summary Export
            </DialogTitle>
            <DialogDescription>
              A summary of the patient's care history. Copy or download to share.
            </DialogDescription>
          </DialogHeader>
          
          {exportData && (
            <div className="flex-1 overflow-auto">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <StatBox label="Visits" value={exportData.overview.totalVisits} />
                <StatBox label="Conditions" value={exportData.overview.totalConditions} />
                <StatBox label="Providers" value={exportData.overview.totalProviders} />
                <StatBox label="Medications" value={exportData.overview.activeMedications} />
                <StatBox label="Actions" value={exportData.overview.pendingActions} />
              </div>

              {/* Preview */}
              <div className="bg-background-subtle rounded-lg p-4 font-mono text-xs max-h-64 overflow-auto whitespace-pre-wrap border border-border-light">
                {formatExportText(exportData)}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setExportDialogOpen(false)}>
              Close
            </Button>
            <Button variant="outline" onClick={handleCopyToClipboard} className="flex items-center gap-2">
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  <span>Copy to Clipboard</span>
                </>
              )}
            </Button>
            <Button onClick={handleDownloadText} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              <span>Download</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface rounded-lg p-3 text-center border border-border-light">
      <p className="text-2xl font-bold text-text-primary">{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  );
}

function VisitCard({ 
  visit, 
  patientId,
  searchQuery,
  note,
  onTogglePin,
  onEditNote,
  onDeleteNote,
}: { 
  visit: any; 
  patientId: string;
  searchQuery?: string;
  note?: CaregiverNote;
  onTogglePin: () => void;
  onEditNote: () => void;
  onDeleteNote: () => void;
}) {
  const visitDate = visit.visitDate || visit.createdAt;
  const formattedDate = visitDate
    ? format(new Date(visitDate), 'EEEE, MMMM d, yyyy')
    : null;
  const formattedShortDate = visitDate
    ? format(new Date(visitDate), 'MMM d, yyyy')
    : null;

  const providerName = visit.provider || 'Unknown Provider';
  const specialty = visit.specialty || null;
  const location = visit.location || null;
  const summary = visit.summary || null;
  const diagnoses = extractDiagnosisLabels(visit);

  const isPinned = note?.pinned || false;
  const hasNote = Boolean(note?.note?.trim());

  // Check if still processing
  const isProcessing = !(visit.processingStatus === 'completed' || visit.status === 'completed');

  // Highlight matching text
  const highlightMatch = (text: string) => {
    if (!searchQuery?.trim() || !text) return text;
    const query = searchQuery.trim();
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    const queryLower = query.toLowerCase();
    const parts = text.split(regex);
    
    return parts.map((part, i) => 
      part.toLowerCase() === queryLower ? (
        <mark key={i} className="bg-warning-light text-warning-dark rounded px-0.5">
          {part}
        </mark>
      ) : part
    );
  };

  if (isProcessing) {
    return (
      <Card variant="elevated" padding="md" className="opacity-80">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-light shrink-0">
            <Loader2 className="h-5 w-5 animate-spin text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-secondary">
              Visit from {formattedShortDate || 'unknown date'} is being processed
            </p>
            {visit.provider && (
              <p className="text-xs text-text-muted mt-1">
                {visit.provider}
                {visit.specialty && ` • ${visit.specialty}`}
              </p>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      variant="elevated"
      padding="none"
      className={cn(
        "overflow-hidden transition-all duration-200",
        isPinned && "ring-2 ring-brand-primary/20 border-brand-primary/30"
      )}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {/* Main Content - Clickable */}
          <Link href={`/care/${patientId}/visits/${visit.id}`} className="flex-1 min-w-0 space-y-3 group">
            {/* Date and indicators */}
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">{formattedDate || 'Date not recorded'}</span>
              <span className="sm:hidden">{formattedShortDate || 'No date'}</span>
              {isPinned && (
                <Pin className="h-3 w-3 text-brand-primary fill-brand-primary" />
              )}
              {hasNote && (
                <StickyNote className="h-3 w-3 text-warning" />
              )}
            </div>

            {/* Provider & Specialty */}
            <div>
              <h3 className="font-semibold text-text-primary text-lg group-hover:text-brand-primary transition-colors">
                {highlightMatch(providerName)}
              </h3>
              {specialty && (
                <p className="text-sm text-text-secondary">{highlightMatch(specialty)}</p>
              )}
            </div>

            {/* Location */}
            {location && (
              <div className="flex items-center gap-1.5 text-sm text-text-muted">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{highlightMatch(location)}</span>
              </div>
            )}

            {/* Summary Preview */}
            {summary && (
              <p className="text-sm text-text-secondary line-clamp-2 leading-relaxed">
                {highlightMatch(summary)}
              </p>
            )}

            {/* Caregiver Note Preview */}
            {hasNote && (
              <div className="flex items-start gap-2 p-2 rounded-lg bg-warning-light/50 border border-warning/20">
                <StickyNote className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning-dark line-clamp-2">
                  {note?.note}
                </p>
              </div>
            )}

            {/* Diagnoses Tags */}
            {diagnoses.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {diagnoses.slice(0, 3).map((diagnosis: unknown, idx: number) => (
                  <span
                    key={`${visit.id}-dx-${idx}`}
                    className="text-xs px-2.5 py-1 rounded-full bg-brand-primary-pale text-brand-primary font-medium"
                  >
                    {highlightMatch(String(diagnosis))}
                  </span>
                ))}
                {diagnoses.length > 3 && (
                  <span className="text-xs text-text-muted px-2 py-1">
                    +{diagnoses.length - 3} more
                  </span>
                )}
              </div>
            )}
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4 text-text-muted" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={onTogglePin}>
                  {isPinned ? (
                    <>
                      <PinOff className="h-4 w-4 mr-2" />
                      Unpin
                    </>
                  ) : (
                    <>
                      <Pin className="h-4 w-4 mr-2" />
                      Pin visit
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onEditNote}>
                  <StickyNote className="h-4 w-4 mr-2" />
                  {hasNote ? 'Edit note' : 'Add note'}
                </DropdownMenuItem>
                {hasNote && (
                  <DropdownMenuItem onClick={onDeleteNote} className="text-error">
                    <X className="h-4 w-4 mr-2" />
                    Delete note
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            
            <Link 
              href={`/care/${patientId}/visits/${visit.id}`}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-background-subtle hover:bg-brand-primary-pale transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-text-muted hover:text-brand-primary transition-colors" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
