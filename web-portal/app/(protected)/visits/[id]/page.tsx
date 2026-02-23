'use client';

import { useCallback, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';

import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Copy,
  HelpCircle,
  Sparkles,
  Stethoscope,
  Calendar as CalendarIcon,
  Info,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageContainer } from '@/components/layout/PageContainer';
import { ManageTagsDialog } from '@/components/visits/ManageTagsDialog';
import { VisitDetailHeader } from '@/components/visits/VisitDetailHeader';
import { EditVisitMetadataDialog } from '@/components/visits/EditVisitMetadataDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, type ApiError } from '@/lib/api/client';
import { queryKeys, useUserProfile, useVisit } from '@/lib/api/hooks';
import type { Visit } from '@/lib/api/hooks';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import {
  isVisitSummaryReady,
  normalizeVisitStatus,
} from '@/lib/visits/status';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';

type DiagnosisInsight = {
  shortSummary?: string;
  detailedSummary?: string;
  fetchedAt?: string;
  source?: string;
};

const toTrimmedText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const formatFollowUpForDisplay = (item: unknown): string | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const record = item as Record<string, unknown>;
  const task = toTrimmedText(record.task) || toTrimmedText(record.type) || 'Follow up';
  const timeframe = toTrimmedText(record.timeframe);
  const dueAt = toTrimmedText(record.dueAt);

  if (timeframe) {
    return `${task} — ${timeframe}`;
  }

  if (dueAt) {
    const formattedDate = formatDateDisplay(dueAt) ?? dueAt;
    return `${task} — by ${formattedDate}`;
  }

  return task;
};

const formatOrderedTestForDisplay = (item: unknown): string | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const record = item as Record<string, unknown>;
  const name = toTrimmedText(record.name);
  if (!name) {
    return null;
  }
  const category = toTrimmedText(record.category);
  if (!category || category.toLowerCase() === 'other') {
    return name;
  }
  return `${name} (${category})`;
};

export default function VisitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const { data: profile } = useUserProfile(user?.uid);
  const profileFolders = useMemo(() => {
    if (!profile?.folders || !Array.isArray(profile.folders)) {
      return [];
    }
    const unique = new Set<string>();
    (profile.folders as unknown[]).forEach((folder: unknown) => {
      if (typeof folder !== 'string') return;
      const trimmed = folder.trim();
      if (trimmed) {
        unique.add(trimmed);
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b));
  }, [profile?.folders]);

  const visitId =
    typeof params?.id === 'string'
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : undefined;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showOrganizeDialog, setShowOrganizeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const fetchingDiagnosesRef = useRef(new Set<string>());
  const [fetchingDiagnoses, setFetchingDiagnoses] = useState<Set<string>>(
    () => new Set<string>(),
  );

  const {
    data: visit,
    isLoading,
    isFetching,
  } = useVisit(user?.uid, visitId, {
    enabled: Boolean(user?.uid && visitId),
  });

  const status = visit ? normalizeVisitStatus(visit) : 'pending';
  const summaryReady = isVisitSummaryReady(visit ?? undefined);

  const updateMetadataMutation = useMutation({
    mutationFn: async ({
      provider,
      location,
      specialty,
      notes,
      visitDate,
    }: {
      provider: string;
      location: string;
      specialty: string;
      notes: string;
      visitDate: string | null;
    }) => {
      if (!visitId) return;
      const ref = doc(db, 'visits', visitId);
      const sanitized = sanitizeVisitMetadata({
        provider,
        location,
        specialty,
        notes,
        visitDate,
      });
      await updateDoc(ref, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      if (!user?.uid || !visitId) return;
      queryClient.invalidateQueries({
        queryKey: queryKeys.visit(user.uid, visitId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.visits(user.uid),
      });
      toast.success('Visit details updated');
    },
    onError: (error: ApiError) => {
      toast.error(error.userMessage ?? 'Failed to update visit');
    },
  });

  const updateTagsMutation = useMutation({
    mutationFn: async (payload: { tags: string[]; folders: string[] }) => {
      if (!visitId) return;
      const ref = doc(db, 'visits', visitId);
      const sanitized = sanitizeVisitOrganization(payload);
      await updateDoc(ref, {
        ...sanitized,
        updatedAt: serverTimestamp(),
      });
    },
    onSuccess: () => {
      if (!user?.uid || !visitId) return;
      queryClient.invalidateQueries({
        queryKey: queryKeys.visit(user.uid, visitId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.visits(user.uid),
      });
      toast.success('Visit organization updated');
    },
    onError: (error: ApiError) => {
      toast.error(error.userMessage ?? 'Failed to update organization');
    },
  });

  const deleteVisitMutation = useMutation({
    mutationFn: async () => {
      if (!visitId) return;
      await api.visits.delete(visitId);
    },
    onSuccess: () => {
      if (user?.uid) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.visits(user.uid),
        });
      }
      toast.success('Visit deleted');
      router.push('/visits');
    },
    onError: (error: ApiError) => {
      toast.error(error.userMessage ?? 'Failed to delete visit');
    },
  });

  const handleMetadataSave = async (values: {
    provider: string;
    location: string;
    specialty: string;
    notes: string;
    visitDate: string | null;
  }) => {
    await updateMetadataMutation.mutateAsync(values);
  };

  const handleOrganizeSave = async (values: {
    tags: string[];
    folders: string[];
  }) => {
    await updateTagsMutation.mutateAsync(values);

    if (!user?.uid) {
      return;
    }

    const mergedMap = new Map<string, string>();
    profileFolders.forEach((folder) => mergedMap.set(folder.toLowerCase(), folder));
    const beforeSize = mergedMap.size;

    values.folders.forEach((folder) => {
      if (typeof folder !== 'string') return;
      const trimmed = folder.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!mergedMap.has(lower)) {
        mergedMap.set(lower, trimmed);
      }
    });

    if (mergedMap.size > beforeSize) {
      const mergedFolders = Array.from(mergedMap.values()).sort((a, b) => a.localeCompare(b));
      try {
        await api.user.updateProfile({ folders: mergedFolders });
        queryClient.invalidateQueries({
          queryKey: queryKeys.userProfile(user.uid),
        });
      } catch (error) {
        console.error('[visits] Failed to sync folders to profile', error);
        toast.error(
          'Visit folders saved, but syncing to your folder library did not complete. Please try again.',
        );
      }
    }
  };

  const handleDeleteConfirm = async () => {
    await deleteVisitMutation.mutateAsync();
    setShowDeleteDialog(false);
  };

  const handleRequestDiagnosisInsight = useCallback(
    async (diagnosis: string) => {
      if (!visitId) {
        toast.error('Visit not found.');
        return false;
      }
      const normalized = diagnosis.trim();
      if (!normalized) {
        toast.error('Diagnosis is missing a name.');
        return false;
      }

      const key = normalizeEducationKey(normalized);
      if (fetchingDiagnosesRef.current.has(key)) {
        return false;
      }

      fetchingDiagnosesRef.current.add(key);
      setFetchingDiagnoses((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });

      try {
        const response = await fetch('/api/diagnoses/insight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: normalized }),
        });

        let data: any = null;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('[visits] Failed to parse diagnosis insight response', parseError);
        }

        if (!response.ok || !data) {
          throw new Error(
            data?.error || 'Unable to fetch diagnosis details. Please try again.',
          );
        }

        const updatePayload: Record<string, any> = {};
        if (typeof data.briefSummary === 'string' && data.briefSummary.trim().length) {
          updatePayload[`diagnosisInsights.${key}.shortSummary`] = data.briefSummary.trim();
        }
        if (typeof data.detailedSummary === 'string' && data.detailedSummary.trim().length) {
          updatePayload[`diagnosisInsights.${key}.detailedSummary`] =
            data.detailedSummary.trim();
        }

        if (Object.keys(updatePayload).length === 0) {
          toast.info('No additional information was returned.');
          return false;
        }

        updatePayload[`diagnosisInsights.${key}.source`] = 'openai';
        updatePayload[`diagnosisInsights.${key}.fetchedAt`] = serverTimestamp();

        await updateDoc(doc(db, 'visits', visitId), updatePayload);
        toast.success('Diagnosis insight saved.');
        return true;
      } catch (error) {
        console.error('[visits] Diagnosis insight fetch failed', error);
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to retrieve diagnosis details. Please try again.';
        toast.error(message);
        return false;
      } finally {
        fetchingDiagnosesRef.current.delete(key);
        setFetchingDiagnoses((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [visitId],
  );

  const diagnoses = useMemo(
    () => {
      const baseDiagnoses = Array.isArray(visit?.diagnoses)
        ? (visit!.diagnoses as string[]).filter(Boolean)
        : [];
      if (baseDiagnoses.length > 0) {
        return baseDiagnoses;
      }

      return Array.isArray((visit as any)?.diagnosesDetailed)
        ? ((visit as any).diagnosesDetailed as Array<Record<string, unknown>>)
          .map((entry) => toTrimmedText(entry?.name))
          .filter((value): value is string => Boolean(value))
        : [];
    },
    [visit, (visit as any)?.diagnosesDetailed],
  );

  const nextSteps = useMemo(() => {
    const followUps = Array.isArray((visit as any)?.followUps)
      ? ((visit as any).followUps as unknown[])
        .map(formatFollowUpForDisplay)
        .filter((value): value is string => Boolean(value))
      : [];
    if (followUps.length > 0) {
      return followUps;
    }

    return Array.isArray(visit?.nextSteps)
      ? (visit!.nextSteps as string[]).filter(Boolean)
      : [];
  }, [visit, (visit as any)?.followUps]);

  const orderedTests = useMemo(() => {
    const structured = Array.isArray((visit as any)?.testsOrdered)
      ? ((visit as any).testsOrdered as unknown[])
        .map(formatOrderedTestForDisplay)
        .filter((value): value is string => Boolean(value))
      : [];

    if (structured.length > 0) {
      return structured;
    }

    return Array.isArray((visit as any)?.imaging)
      ? ((visit as any).imaging as string[]).filter(Boolean)
      : [];
  }, [visit, (visit as any)?.testsOrdered, (visit as any)?.imaging]);

  const medications = useMemo(() => {
    const medData = visit?.medications as Record<string, unknown> | undefined;
    return {
      started: Array.isArray(medData?.started)
        ? (medData!.started as unknown[]).filter(Boolean)
        : [],
      stopped: Array.isArray(medData?.stopped)
        ? (medData!.stopped as unknown[]).filter(Boolean)
        : [],
      changed: Array.isArray(medData?.changed)
        ? (medData!.changed as unknown[]).filter(Boolean)
        : [],
    };
  }, [visit]);

  const medicationReview = useMemo(() => {
    const review = (visit as any)?.medicationReview as Record<string, unknown> | undefined;
    if (!review || typeof review !== 'object') {
      return {
        reviewed: false,
        followUpNeeded: false,
        continuedReviewed: [] as unknown[],
        concerns: [] as string[],
        sideEffects: [] as string[],
        notes: [] as string[],
      };
    }

    const continuedReviewed = Array.isArray(review.continuedReviewed)
      ? (review.continuedReviewed as unknown[]).filter(Boolean)
      : Array.isArray(review.continued)
        ? (review.continued as unknown[]).filter(Boolean)
        : [];
    const adherenceConcerns = Array.isArray(review.adherenceConcerns)
      ? (review.adherenceConcerns as unknown[])
        .map(toTrimmedText)
        .filter((value): value is string => Boolean(value))
      : [];
    const reviewConcerns = Array.isArray(review.reviewConcerns)
      ? (review.reviewConcerns as unknown[])
        .map(toTrimmedText)
        .filter((value): value is string => Boolean(value))
      : [];
    const concerns = Array.from(new Set([...reviewConcerns, ...adherenceConcerns]));
    const sideEffects = Array.isArray(review.sideEffectsDiscussed)
      ? (review.sideEffectsDiscussed as unknown[])
        .map(toTrimmedText)
        .filter((value): value is string => Boolean(value))
      : [];
    const notes = Array.isArray(review.notes)
      ? (review.notes as unknown[])
        .map(toTrimmedText)
        .filter((value): value is string => Boolean(value))
      : [];
    const reviewed = typeof review.reviewed === 'boolean'
      ? review.reviewed
      : continuedReviewed.length > 0 ||
        concerns.length > 0 ||
        sideEffects.length > 0 ||
        notes.length > 0;

    return {
      reviewed,
      followUpNeeded: Boolean(review.followUpNeeded),
      continuedReviewed,
      concerns,
      sideEffects,
      notes,
    };
  }, [visit]);

  const diagnosisEducationMap = useMemo(() => {
    const map = new Map<string, { summary?: string; watchFor?: string }>();
    const entries =
      (visit?.education?.diagnoses as Array<Record<string, unknown>>) ?? [];
    entries.forEach((entry) => {
      const name =
        typeof entry?.name === 'string' ? entry.name.trim() : '';
      if (!name) return;
      const key = normalizeEducationKey(name);
      const summary =
        typeof entry.summary === 'string' ? entry.summary.trim() : undefined;
      const watchFor =
        typeof entry.watchFor === 'string' ? entry.watchFor.trim() : undefined;
      map.set(key, {
        summary: summary || undefined,
        watchFor: watchFor || undefined,
      });
    });
    return map;
  }, [visit?.education?.diagnoses]);

  const medicationEducationMap = useMemo(() => {
    const map = new Map<
      string,
      {
        purpose?: string;
        usage?: string;
        sideEffects?: string;
        whenToCallDoctor?: string;
      }
    >();
    const entries =
      (visit?.education?.medications as Array<Record<string, unknown>>) ?? [];
    entries.forEach((entry) => {
      const name =
        typeof entry?.name === 'string' ? entry.name.trim() : '';
      if (!name) return;
      const key = normalizeEducationKey(name);
      const purpose =
        typeof entry.purpose === 'string' ? entry.purpose.trim() : undefined;
      const usage =
        typeof entry.usage === 'string' ? entry.usage.trim() : undefined;
      const sideEffects =
        typeof entry.sideEffects === 'string'
          ? entry.sideEffects.trim()
          : undefined;
      const whenToCallDoctor =
        typeof entry.whenToCallDoctor === 'string'
          ? entry.whenToCallDoctor.trim()
          : undefined;
      map.set(key, {
        purpose: purpose || undefined,
        usage: usage || undefined,
        sideEffects: sideEffects || undefined,
        whenToCallDoctor: whenToCallDoctor || undefined,
      });
    });
    return map;
  }, [visit?.education?.medications]);

  const diagnosisInsights = useMemo(() => {
    const map = new Map<string, DiagnosisInsight>();
    const insightsRaw = visit?.diagnosisInsights as Record<string, unknown> | undefined;
    if (insightsRaw && typeof insightsRaw === 'object') {
      Object.entries(insightsRaw).forEach(([key, value]) => {
        if (!value || typeof value !== 'object') return;
        const record = value as Record<string, unknown>;
        const shortSummary =
          typeof record.shortSummary === 'string' ? record.shortSummary.trim() : '';
        const detailedSummary =
          typeof record.detailedSummary === 'string' ? record.detailedSummary.trim() : '';
        const fetchedAt =
          typeof record.fetchedAt === 'string' ? record.fetchedAt : undefined;
        const source =
          typeof record.source === 'string' ? record.source : undefined;
        map.set(key, {
          shortSummary: shortSummary || undefined,
          detailedSummary: detailedSummary || undefined,
          fetchedAt,
          source,
        });
      });
    }
    return map;
  }, [visit?.diagnosisInsights]);

  const highlightItems = useMemo(() => {
    if (!visit) return [];
    const items: Array<{ key: string; label: string; icon: ReactNode; content: ReactNode }> = [];
    const visitDateValue = (visit.visitDate as string | undefined) ?? (visit.createdAt as string | undefined) ?? null;
    items.push({
      key: 'date',
      label: 'Visit date',
      icon: <CalendarIcon className="h-4 w-4 text-brand-primary" />,
      content: formatDateDisplay(visitDateValue) ?? 'Not recorded',
    });
    items.push({
      key: 'provider',
      label: 'Provider',
      icon: <Stethoscope className="h-4 w-4 text-brand-primary" />,
      content: visit.provider ? String(visit.provider) : 'Not recorded',
    });
    items.push({
      key: 'specialty',
      label: 'Specialty',
      icon: <Sparkles className="h-4 w-4 text-brand-primary" />,
      content: visit.specialty ? String(visit.specialty) : 'Not recorded',
    });
    return items;
  }, [visit]);

  if (isLoading || isFetching) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
          <Skeleton className="h-72 rounded-3xl" />
        </div>
      </PageContainer>
    );
  }

  if (!visit || !visitId) {
    return (
      <PageContainer maxWidth="lg">
        <Card className="border border-border bg-card shadow-card">
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary-dark">
              🩺
            </div>
            <h1 className="text-2xl font-semibold text-foreground">
              Visit not found
            </h1>
            <p className="text-sm text-muted-foreground">
              The visit you’re looking for may have been removed or you no longer
              have access. Return to the visits overview to continue.
            </p>
            <Button onClick={() => router.push('/visits')} className="mt-2">
              Back to visits
            </Button>
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <div className="flex flex-col gap-8">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/visits')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            className="w-full justify-start text-brand-primary hover:text-brand-primary-dark sm:w-auto"
          >
            Back to visits
          </Button>
        </div>

        <VisitDetailHeader
          visit={visit}
          status={status}
          summaryReady={summaryReady}
          onEditMetadata={() => setShowEditDialog(true)}
          onManageTags={() => setShowOrganizeDialog(true)}
          onDeleteVisit={() => setShowDeleteDialog(true)}
          isDeleting={deleteVisitMutation.isPending}
        />

        {highlightItems.length ? (
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {highlightItems.map((item) => (
              <div
                key={item.key}
                className="rounded-2xl border border-border-light/60 bg-background-subtle/70 p-4 shadow-soft backdrop-blur-sm"
              >
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {item.icon}
                  {item.label}
                </div>
                <div className="mt-2 text-base font-semibold text-text-primary">{item.content}</div>
              </div>
            ))}
          </section>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <SummaryCard summary={summaryReady ? (visit.summary as string | undefined) : undefined} />
          <div className="space-y-6">
            <SimpleListCard
              title="Action items"
              description="Clear next steps captured during your visit."
              items={nextSteps}
            />
            <SimpleListCard
              title="Ordered tests"
              description="Diagnostic tests and studies ordered or recommended."
              items={orderedTests}
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <DiagnosesCard
            diagnoses={diagnoses}
            education={diagnosisEducationMap}
            insights={diagnosisInsights}
            fetchingInsights={fetchingDiagnoses}
            onRequestInsight={handleRequestDiagnosisInsight}
          />
          <MedicationCard
            medications={medications}
            education={medicationEducationMap}
            medicationReview={medicationReview}
          />
        </section>

      <EditVisitMetadataDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        initialValues={{
          provider: visit.provider as string | undefined,
          location: visit.location as string | undefined,
          specialty: visit.specialty as string | undefined,
          notes: (visit.notes as string | undefined) ?? '',
          visitDate:
            (visit.visitDate as string | undefined) ??
            (visit.createdAt as string | undefined) ??
            null,
        }}
        onSave={handleMetadataSave}
        isSaving={updateMetadataMutation.isPending}
      />

      <ManageTagsDialog
        open={showOrganizeDialog}
        onOpenChange={setShowOrganizeDialog}
        initialTags={
          Array.isArray(visit.tags) ? (visit.tags as string[]) : []
        }
        initialFolders={
          Array.isArray(visit.folders) ? (visit.folders as string[]) : []
        }
        onSave={handleOrganizeSave}
        isSaving={updateTagsMutation.isPending}
        suggestedFolders={profileFolders}
        currentSpecialty={
          typeof visit.specialty === 'string' ? visit.specialty : null
        }
      />

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete visit</DialogTitle>
            <DialogDescription>
              This will permanently remove the summary, transcript, and any
              associated data. You won’t be able to recover it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              onClick={handleDeleteConfirm}
              disabled={deleteVisitMutation.isPending}
            >
              {deleteVisitMutation.isPending ? 'Deleting…' : 'Delete visit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </PageContainer>
  );
}

function SummaryCard({ summary }: { summary?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!summary || !summary.trim()) {
      toast.info('Summary will appear here once it has finished processing.');
      return;
    }
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      toast.success('Summary copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[visits] Failed to copy summary', error);
      toast.error('Unable to copy summary. Please try again.');
    }
  }, [summary]);

  return (
    <Card className="relative overflow-hidden border-none bg-gradient-to-br from-brand-primary/10 via-card to-card shadow-floating">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.45),_transparent_60%)]" />
      <CardHeader className="relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-brand-primary shadow-sm">
              <Sparkles className="h-3 w-3" />
              AI summary
            </span>
            <h2 className="text-2xl font-semibold text-text-primary">Visit highlights</h2>
            <p className="text-sm text-text-secondary">
              A concise overview generated from your visit transcript.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-center rounded-full border-white/70 bg-white/80 text-text-primary shadow-sm hover:bg-white sm:w-auto"
            onClick={handleCopy}
            disabled={!summary || !summary.trim()}
            leftIcon={<Copy className="h-4 w-4" />}
          >
            {copied ? 'Copied!' : 'Copy summary'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <SummaryContent summary={summary} />
      </CardContent>
    </Card>
  );
}

function SummaryContent({ summary }: { summary?: string }) {
  if (!summary || !summary.trim()) {
    return (
      <div className="rounded-2xl border border-dashed border-border-light/80 bg-background-subtle/70 p-6 text-sm text-muted-foreground shadow-inner">
        This summary is still processing. You’ll receive a push notification on the LumiMD app once it’s ready.
      </div>
    );
  }

  const blocks = summary
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .filter((lines) => lines.length > 0);

  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
      {blocks.map((lines, blockIndex) => {
        const isList = lines.every((line) => /^[-•]/.test(line));
        if (isList) {
          return (
            <div
              key={`summary-block-${blockIndex}`}
              className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-sm"
            >
              <ul className="ml-4 list-disc space-y-1 text-sm text-text-primary">
                {lines.map((line, lineIndex) => (
                  <li key={`summary-item-${blockIndex}-${lineIndex}`}>
                    {line.replace(/^[-•]\s*/, '')}
                  </li>
                ))}
              </ul>
            </div>
          );
        }

        const headingLine =
          lines.length > 1 && /[:：]$/.test(lines[0]) ? lines[0].slice(0, -1) : null;

        return (
          <div
            key={`summary-block-${blockIndex}`}
            className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-sm"
          >
            {headingLine ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {headingLine}
              </p>
            ) : null}
            <p className="text-sm text-text-primary">
              {headingLine ? lines.slice(1).join(' ') : lines.join(' ')}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function DiagnosesCard({
  diagnoses,
  education,
  insights,
  fetchingInsights,
  onRequestInsight,
}: {
  diagnoses: string[];
  education: Map<string, { summary?: string; watchFor?: string }>;
  insights: Map<string, DiagnosisInsight>;
  fetchingInsights: Set<string>;
  onRequestInsight: (diagnosis: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  return (
    <Card className="border border-border-light/60 bg-card shadow-soft">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg font-semibold text-foreground">Diagnoses</CardTitle>
        <p className="text-sm text-text-secondary">
          Conditions discussed or updated during this visit.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TooltipProvider>
          {diagnoses.length ? (
            diagnoses.map((diagnosis) => {
              const key = normalizeEducationKey(diagnosis);
              const insight = insights.get(key);
              const edu = education.get(key);
              const isExpanded = expanded.has(key);
              const isFetching = fetchingInsights.has(key);
              const showInfoCta = !insight?.detailedSummary;

              const handleInfoClick = async (event: MouseEvent<HTMLButtonElement>) => {
                event.stopPropagation();
                const success = await onRequestInsight(diagnosis);
                if (success) {
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    next.add(key);
                    return next;
                  });
                }
              };

              return (
                <div
                  key={diagnosis}
                  className="rounded-2xl border border-border-light/60 bg-background-subtle/70 shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(key)}
                  className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left sm:px-5"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold text-text-primary">{diagnosis}</span>
                      {insight?.shortSummary ? (
                        <span className="text-sm text-text-secondary">{insight.shortSummary}</span>
                      ) : edu?.summary ? (
                        <span className="text-sm text-text-secondary">{edu.summary}</span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {showInfoCta ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={handleInfoClick}
                              disabled={isFetching}
                              className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full border border-border-light bg-background-subtle text-text-secondary transition-smooth hover:border-brand-primary hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40',
                                isFetching && 'cursor-progress opacity-80',
                              )}
                              aria-label={`Get more information about ${diagnosis}`}
                            >
                              {isFetching ? (
                                <Loader2 className="h-4 w-4 animate-spin text-brand-primary" />
                              ) : (
                                <Info className="h-4 w-4" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[240px] text-xs font-medium text-text-primary bg-background-subtle shadow-lg border border-border-light/80 rounded-xl px-3 py-2">
                            Need a quick summary? Click for a patient-friendly explanation. We’ll
                            add it here for next time.
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 text-text-tertiary transition-transform',
                          isExpanded ? '-rotate-180' : 'rotate-0',
                        )}
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                  {isExpanded ? (
                    <div className="space-y-3 border-t border-border-light/60 bg-white/70 px-4 py-3 text-sm leading-relaxed text-text-primary">
                      {insight?.detailedSummary ? (
                        <p>{insight.detailedSummary}</p>
                      ) : edu?.summary ? (
                        <p>{edu.summary}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {isFetching
                            ? 'Fetching a patient-friendly explanation…'
                            : 'Click the info icon above to add a patient-friendly explanation.'}
                        </p>
                      )}
                      {edu?.watchFor ? (
                        <div className="rounded-xl border border-dashed border-border-light bg-background-subtle/60 p-3 text-xs text-text-secondary">
                          <p className="font-semibold uppercase tracking-wide text-text-primary">
                            What to watch for
                          </p>
                          <p className="mt-1 leading-relaxed">{edu.watchFor}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No diagnoses recorded.</p>
          )}
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function SimpleListCard({
  title,
  items,
  description,
}: {
  title: string;
  items: string[];
  description?: string;
}) {
  return (
    <Card className="border border-border-light/60 bg-card shadow-soft">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg font-semibold text-foreground">{title}</CardTitle>
        {description ? <p className="text-sm text-text-secondary">{description}</p> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length ? (
          items.map((item, index) => (
            <div
              key={`${title}-${item}-${index}`}
              className="flex items-start gap-3 rounded-2xl border border-border-light/60 bg-background-subtle/70 px-4 py-3 text-sm text-foreground shadow-sm"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary/15 text-xs font-semibold text-brand-primary">
                {index + 1}
              </span>
              <p className="leading-relaxed">{item}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No items recorded.</p>
        )}
      </CardContent>
    </Card>
  );
}

function MedicationCard({
  medications,
  education,
  medicationReview,
}: {
  medications: {
    started: unknown[];
    stopped: unknown[];
    changed: unknown[];
  };
  education?: Map<
    string,
    {
      purpose?: string;
      usage?: string;
      sideEffects?: string;
      whenToCallDoctor?: string;
    }
  >;
  medicationReview?: {
    reviewed: boolean;
    followUpNeeded: boolean;
    continuedReviewed: unknown[];
    concerns: string[];
    sideEffects: string[];
    notes: string[];
  };
}) {
  type MedicationListItem = { key: string; label: string; name?: string };

  const formatEntry = (entry: unknown): MedicationListItem | null => {
    if (!entry) return null;
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return null;
      return { key: trimmed, label: trimmed, name: trimmed };
    }

    if (typeof entry === 'object') {
      const record = entry as Record<string, unknown>;
      const name =
        typeof record.name === 'string' ? record.name.trim() : undefined;
      const display =
        typeof record.display === 'string' ? record.display.trim() : undefined;
      const original =
        typeof record.original === 'string' ? record.original.trim() : undefined;
      const text =
        display ||
        original ||
        (typeof record.text === 'string' ? record.text.trim() : undefined) ||
        name;
      if (!text) return null;
      const key = [name || text, original || ''].filter(Boolean).join('::');
      return {
        key,
        label: text,
        name: name || undefined,
      };
    }

    const stringified = String(entry).trim();
    if (!stringified) return null;
    return { key: stringified, label: stringified, name: stringified };
  };

  const renderList = (list: unknown[]) =>
    list
      .map((entry, index) => {
        const parsed = formatEntry(entry);
        if (!parsed) return null;
        const educationEntry =
          parsed.name && education
            ? education.get(normalizeEducationKey(parsed.name))
            : undefined;
        const content = (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-text-primary">{parsed.label}</span>
            {educationEntry ? <HelpCircle className="h-4 w-4 text-brand-primary" /> : null}
          </div>
        );
        return (
          <li
            key={`${parsed.key}-${index}`}
            className="rounded-2xl border border-border-light/60 bg-background-subtle/70 px-4 py-3 text-sm text-text-primary shadow-sm"
          >
            {educationEntry ? (
              <Tooltip>
                <TooltipTrigger asChild>{content}</TooltipTrigger>
                <TooltipContent className="max-w-xs space-y-2 text-left text-sm text-text-primary">
                  {educationEntry.purpose ? (
                    <p className="font-medium text-text-primary">{educationEntry.purpose}</p>
                  ) : null}
                  {educationEntry.usage ? (
                    <p className="text-xs text-muted-foreground">{educationEntry.usage}</p>
                  ) : null}
                  {educationEntry.sideEffects ? (
                    <p className="text-xs text-muted-foreground">
                      Side effects: {educationEntry.sideEffects}
                    </p>
                  ) : null}
                  {educationEntry.whenToCallDoctor ? (
                    <p className="text-xs font-medium text-destructive">
                      {educationEntry.whenToCallDoctor}
                    </p>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            ) : (
              content
            )}
          </li>
        );
      })
      .filter(Boolean) as ReactNode[];

  const startedItems = renderList(medications.started);
  const changedItems = renderList(medications.changed);
  const stoppedItems = renderList(medications.stopped);
  const continuedItems = renderList(medicationReview?.continuedReviewed ?? []);
  const hasReviewDetails = Boolean(
    medicationReview?.reviewed ||
      (continuedItems && continuedItems.length) ||
      (medicationReview?.concerns && medicationReview.concerns.length) ||
      (medicationReview?.sideEffects && medicationReview.sideEffects.length) ||
      (medicationReview?.notes && medicationReview.notes.length) ||
      medicationReview?.followUpNeeded,
  );
  const hasChanges = Boolean(
    (startedItems && startedItems.length) ||
      (changedItems && changedItems.length) ||
      (stoppedItems && stoppedItems.length),
  );

  return (
    <Card className="border border-border-light/60 bg-card shadow-soft">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg font-semibold text-foreground">Medication changes</CardTitle>
        <p className="text-sm text-text-secondary">What was started, adjusted, or stopped as a result of this visit.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <TooltipProvider>
          <MedicationSection
            label="Started"
            items={startedItems}
            tone="success"
            emptyMessage="No new medications were started."
          />
          <MedicationSection
            label="Adjusted"
            items={changedItems}
            tone="warning"
            emptyMessage="No medication adjustments were made."
          />
          <MedicationSection
            label="Stopped"
            items={stoppedItems}
            tone="danger"
            emptyMessage="No medications were stopped."
          />
        </TooltipProvider>
        {!hasChanges && !hasReviewDetails ? (
          <div className="rounded-2xl border border-dashed border-border-light/60 bg-background-subtle/70 p-4 text-sm text-muted-foreground text-center">
            No medication changes were recorded in this visit.
          </div>
        ) : null}

        {hasReviewDetails ? (
          <div className="rounded-2xl border border-border-light/60 bg-background-subtle/60 p-4">
            <p className="text-sm font-semibold text-text-primary">Medication review</p>
            <div className="mt-3 space-y-3">
              {continuedItems.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Reviewed/continued
                  </p>
                  <ul className="space-y-2">{continuedItems}</ul>
                </div>
              ) : null}

              {medicationReview?.concerns?.length ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Review concerns
                  </p>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-text-primary">
                    {medicationReview.concerns.map((item, index) => (
                      <li key={`review-concern-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {medicationReview?.sideEffects?.length ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Side effects discussed
                  </p>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-text-primary">
                    {medicationReview.sideEffects.map((item, index) => (
                      <li key={`review-side-effect-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {medicationReview?.notes?.length ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Notes
                  </p>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-text-primary">
                    {medicationReview.notes.map((item, index) => (
                      <li key={`review-note-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {medicationReview?.followUpNeeded ? (
                <p className="text-sm font-medium text-warning-dark">
                  Medication follow-up is needed.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MedicationSection({
  label,
  items,
  tone,
  emptyMessage,
}: {
  label: string;
  items: ReactNode[];
  tone: 'success' | 'warning' | 'danger';
  emptyMessage: string;
}) {
  const toneStyles = {
    success: 'bg-success-light/80 text-success-dark border-success-light/80',
    warning: 'bg-warning-light/80 text-warning-dark border-warning-light/80',
    danger: 'bg-error-light/80 text-error-dark border-error-light/80',
  };

  const badgeStyles = {
    success: 'bg-success text-white',
    warning: 'bg-warning text-white',
    danger: 'bg-error text-white',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', badgeStyles[tone])}>
          {label}
        </span>
        <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </span>
      </div>
      {items.length ? (
        <ul className="space-y-3">{items}</ul>
      ) : (
        <div
          className={cn(
            'rounded-2xl border px-4 py-3 text-sm shadow-sm',
            toneStyles[tone],
          )}
        >
          {emptyMessage}
        </div>
      )}
    </div>
  );
}

function sanitizeVisitMetadata({
  provider,
  location,
  specialty,
  notes,
  visitDate,
}: {
  provider: string;
  location: string;
  specialty: string;
  notes: string;
  visitDate: string | null;
}) {
  return {
    provider: sanitizeOptionalString(provider),
    location: sanitizeOptionalString(location),
    specialty: sanitizeOptionalString(specialty),
    notes: sanitizeOptionalString(notes),
    visitDate: sanitizeVisitDate(visitDate),
  };
}

function sanitizeVisitOrganization({
  tags,
  folders,
}: {
  tags: string[];
  folders: string[];
}) {
  return {
    tags: sanitizeStringArray(tags),
    folders: sanitizeStringArray(folders),
  };
}

function sanitizeOptionalString(value: string | null | undefined) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeVisitDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function sanitizeStringArray(values: unknown[]) {
  if (!Array.isArray(values)) return [];
  const uniq = new Set<string>();
  values.forEach((value) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    uniq.add(trimmed);
  });
  return Array.from(uniq);
}

function formatDateDisplay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, 'MMM d, yyyy');
}

function normalizeEducationKey(value: string) {
  return value.trim().toLowerCase();
}
