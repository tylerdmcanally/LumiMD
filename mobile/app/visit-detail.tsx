/**
 * Visit Detail Screen
 * Summary-first single-scroll layout with inline education content.
 * The AI-generated summary is the hero element; structured data follows
 * with expandable patient education. Transcript and medication review
 * are collapsed by default as secondary content.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  LayoutAnimation,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, Card, spacing, Radius } from '../components/ui';
import { useVisit, queryKeys } from '../lib/api/hooks';
import { api } from '../lib/api/client';
import { openWebDashboard } from '../lib/linking';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { MedicationReviewSheet } from '../components/MedicationReviewSheet';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { DiagnosisEducationCard, MedicationEducationCard } from '../components/EducationCard';
import {
  normalizeEducationKey,
  buildDiagnosisEducationMap,
  buildMedicationEducationMap,
} from '../lib/utils/educationHelpers';
import { trackEvent } from '../lib/telemetry';
import { getMedlinePlusUrl } from '../lib/utils/medlineplus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VisitWalkthrough } from '../components/VisitWalkthrough';
import type { VisitWalkthrough as VisitWalkthroughType } from '@lumimd/sdk';
import { useCompleteAction, useCreateMedication, useUpdateMedication } from '../lib/api/mutations';
import { EditMedicationSheet } from '../components/EditMedicationSheet';
import firestore from '@react-native-firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import type { Medication } from '@lumimd/sdk';

dayjs.extend(relativeTime);

type VisitDetailRefreshSource = 'pull_to_refresh' | 'error_fallback';

function getStatusBadge(status: string | undefined) {
  switch (status) {
    case 'completed':
      return { label: 'Completed', color: Colors.success };
    case 'transcribing':
      return { label: 'Transcribing', color: Colors.warning };
    case 'summarizing':
      return { label: 'Summarizing', color: Colors.warning };
    case 'processing':
      return { label: 'Processing', color: Colors.warning };
    case 'pending':
      return { label: 'Pending', color: Colors.textMuted };
    case 'failed':
      return { label: 'Failed', color: Colors.error };
    default:
      return { label: 'Pending', color: Colors.textMuted };
  }
}

function formatList(items: string[] | undefined) {
  return (items ?? []).filter(item => item.trim().length > 0);
}

type MedicationListEntry = {
  primary: string;
  secondary?: string;
};

const sanitizeMedicationText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const buildMedicationEntry = (item: any): MedicationListEntry | null => {
  if (!item) return null;

  if (typeof item === 'string') {
    const text = item.trim();
    if (!text) return null;
    return { primary: text };
  }

  if (typeof item === 'object') {
    const name = sanitizeMedicationText(item.name);
    const display = sanitizeMedicationText(item.display);
    const note = sanitizeMedicationText(item.note);
    const original = sanitizeMedicationText(item.original);
    const dose = sanitizeMedicationText(item.dose);
    const frequency = sanitizeMedicationText(item.frequency);

    const primary = name ?? display ?? original ?? note ?? 'Medication';

    let secondary: string | undefined;

    if (
      display &&
      display !== primary &&
      !display.toLowerCase().startsWith(primary.toLowerCase())
    ) {
      secondary = display;
    } else {
      const parts = [dose, frequency].filter(Boolean) as string[];
      if (note && !parts.includes(note)) {
        parts.push(note);
      }
      if (parts.length > 0) {
        secondary = parts.join(' \u2022 ');
      } else if (original && original !== primary) {
        secondary = original;
      }
    }

    return {
      primary,
      secondary,
    };
  }

  return null;
};

const buildMedicationEntries = (items: any): MedicationListEntry[] => {
  if (!Array.isArray(items)) return [];
  return items
    .map(buildMedicationEntry)
    .filter((entry): entry is MedicationListEntry => entry !== null);
};

const formatFollowUpEntry = (item: any): string | null => {
  if (!item || typeof item !== 'object') return null;
  const task = sanitizeMedicationText(item.task) || sanitizeMedicationText(item.type) || 'Follow up';
  const timeframe = sanitizeMedicationText(item.timeframe);
  const dueAt = sanitizeMedicationText(item.dueAt);

  if (timeframe) {
    return `${task} \u2014 ${timeframe}`;
  }

  if (dueAt) {
    const parsed = dayjs(dueAt);
    const dateLabel = parsed.isValid() ? parsed.format('MMM D, YYYY') : dueAt;
    return `${task} \u2014 by ${dateLabel}`;
  }

  return task;
};

const formatOrderedTestEntry = (item: any): string | null => {
  if (!item || typeof item !== 'object') return null;
  const name = sanitizeMedicationText(item.name);
  if (!name) return null;
  const category = sanitizeMedicationText(item.category);
  if (!category || category.toLowerCase() === 'other') {
    return name;
  }
  return `${name} (${category})`;
};

function SummarySection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        {icon && <Ionicons name={icon} size={18} color={Colors.primary} style={{ marginRight: spacing(2) }} />}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <Card style={styles.sectionCard}>{children}</Card>
    </View>
  );
}

export default function VisitDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const visitId = params.id;

  const [retrying, setRetrying] = useState(false);
  const [showMedicationReview, setShowMedicationReview] = useState(false);
  const [walkthroughVisible, setWalkthroughVisible] = useState(false);
  const [walkthroughDismissed, setWalkthroughDismissed] = useState(false);
  const walkthroughCheckedRef = useRef(false);
  const hadLoadFailureRef = useRef(false);
  const processingStates = ['pending', 'processing', 'transcribing', 'summarizing'];
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { mutate: toggleAction } = useCompleteAction();
  const createMedication = useCreateMedication();

  // Edit medication sheet state
  const [editSheetMed, setEditSheetMed] = useState<Medication | null>(null);

  // Medications linked to this visit (from the medications collection)
  const [visitMedications, setVisitMedications] = useState<Map<string, Medication>>(new Map());
  useEffect(() => {
    if (!visitId || !user?.uid) return;
    const unsubscribe = firestore()
      .collection('medications')
      .where('userId', '==', user.uid)
      .where('deletedAt', '==', null)
      .onSnapshot((snapshot) => {
        const map = new Map<string, Medication>();
        snapshot?.docs.forEach((doc) => {
          const data = doc.data();
          const name = (data.name ?? '').trim().toLowerCase();
          if (name) {
            map.set(name, { id: doc.id, ...data } as Medication);
          }
        });
        setVisitMedications(map);
      });
    return () => unsubscribe();
  }, [visitId, user?.uid]);

  // Actions linked to this visit (from the actions collection)
  const [visitActions, setVisitActions] = useState<Map<string, { id: string; completed: boolean }>>(new Map());
  useEffect(() => {
    if (!visitId || !user?.uid) return;
    const unsubscribe = firestore()
      .collection('actions')
      .where('userId', '==', user.uid)
      .where('visitId', '==', visitId)
      .where('deletedAt', '==', null)
      .onSnapshot((snapshot) => {
        const map = new Map<string, { id: string; completed: boolean }>();
        snapshot?.docs.forEach((doc) => {
          const data = doc.data();
          const desc = (data.description ?? '').trim();
          if (desc) {
            map.set(desc, { id: doc.id, completed: Boolean(data.completed) });
          }
        });
        setVisitActions(map);
      });
    return () => unsubscribe();
  }, [visitId, user?.uid]);

  const handleToggleActionItem = useCallback((actionId: string, currentlyCompleted: boolean) => {
    // Optimistic UI update
    setVisitActions((prev) => {
      const next = new Map(prev);
      for (const [key, val] of next) {
        if (val.id === actionId) {
          next.set(key, { ...val, completed: !currentlyCompleted });
          break;
        }
      }
      return next;
    });
    toggleAction(
      { id: actionId, completed: !currentlyCompleted },
      {
        onError: () => {
          // Revert on failure
          setVisitActions((prev) => {
            const next = new Map(prev);
            for (const [key, val] of next) {
              if (val.id === actionId) {
                next.set(key, { ...val, completed: currentlyCompleted });
                break;
              }
            }
            return next;
          });
          Alert.alert('Error', 'Could not update this action item. Please try again.');
        },
      },
    );
  }, [toggleAction]);

  const handleEditExtractedMed = useCallback((medName: string, medDose?: string, medFrequency?: string) => {
    const key = medName.trim().toLowerCase();
    const existing = visitMedications.get(key);
    if (existing) {
      setEditSheetMed(existing);
    } else {
      // Create the medication doc first, then open edit sheet
      createMedication.mutate(
        {
          name: medName,
          dose: medDose,
          frequency: medFrequency,
          source: 'visit',
        },
        {
          onSuccess: (created) => {
            setEditSheetMed(created as Medication);
          },
          onError: () => {
            Alert.alert('Error', 'Could not load this medication for editing.');
          },
        },
      );
    }
  }, [visitMedications, createMedication]);

  const {
    data: visit,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useVisit(visitId ?? '', {
    enabled: Boolean(visitId),
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      const currentData: any = query.state.data;
      if (
        currentData?.processingStatus &&
        processingStates.includes(currentData.processingStatus)
      ) {
        return 5000;
      }
      if (
        currentData?.processingStatus === 'completed' &&
        (!currentData?.summary || `${currentData.summary}`.trim().length === 0)
      ) {
        return 5000;
      }
      return false;
    },
  });

  const statusBadge = useMemo(() => getStatusBadge(visit?.processingStatus), [visit]);

  const medications = useMemo(
    () => ({
      started: buildMedicationEntries(visit?.medications?.started),
      stopped: buildMedicationEntries(visit?.medications?.stopped),
      changed: buildMedicationEntries(visit?.medications?.changed),
    }),
    [visit?.medications],
  );

  const diagnoses = useMemo(() => {
    const legacyDiagnoses = formatList(visit?.diagnoses);
    if (legacyDiagnoses.length > 0) {
      return legacyDiagnoses;
    }

    const detailed = Array.isArray((visit as any)?.diagnosesDetailed)
      ? ((visit as any).diagnosesDetailed as any[])
        .map((item) => sanitizeMedicationText(item?.name))
        .filter((value): value is string => Boolean(value))
      : [];

    return detailed;
  }, [visit?.diagnoses, (visit as any)?.diagnosesDetailed]);

  const orderedTests = useMemo(() => {
    const structured = Array.isArray((visit as any)?.testsOrdered)
      ? ((visit as any).testsOrdered as any[])
        .map(formatOrderedTestEntry)
        .filter((value): value is string => Boolean(value))
      : [];

    if (structured.length > 0) {
      return structured;
    }

    return formatList(visit?.imaging);
  }, [(visit as any)?.testsOrdered, visit?.imaging]);

  const actionItems = useMemo(() => {
    const followUps = Array.isArray((visit as any)?.followUps)
      ? ((visit as any).followUps as any[])
        .map(formatFollowUpEntry)
        .filter((value): value is string => Boolean(value))
      : [];

    if (followUps.length > 0) {
      return followUps;
    }

    return formatList(visit?.nextSteps);
  }, [(visit as any)?.followUps, visit?.nextSteps]);

  const medicationReview = useMemo(() => {
    const review = (visit as any)?.medicationReview as any;
    if (!review || typeof review !== 'object') {
      return {
        reviewed: false,
        followUpNeeded: false,
        continuedReviewed: [] as MedicationListEntry[],
        concerns: [] as string[],
        sideEffects: [] as string[],
        notes: [] as string[],
      };
    }

    const continuedReviewed = buildMedicationEntries(
      review.continuedReviewed ?? review.continued,
    );
    const adherenceConcerns = Array.isArray(review.adherenceConcerns)
      ? review.adherenceConcerns
        .map((item: unknown) => sanitizeMedicationText(item))
        .filter((value: string | undefined): value is string => Boolean(value))
      : [];
    const reviewConcerns = Array.isArray(review.reviewConcerns)
      ? review.reviewConcerns
        .map((item: unknown) => sanitizeMedicationText(item))
        .filter((value: string | undefined): value is string => Boolean(value))
      : [];
    const concerns = Array.from(new Set([...reviewConcerns, ...adherenceConcerns]));
    const sideEffects = Array.isArray(review.sideEffectsDiscussed)
      ? review.sideEffectsDiscussed
        .map((item: unknown) => sanitizeMedicationText(item))
        .filter((value: string | undefined): value is string => Boolean(value))
      : [];
    const notes = Array.isArray(review.notes)
      ? review.notes
        .map((item: unknown) => sanitizeMedicationText(item))
        .filter((value: string | undefined): value is string => Boolean(value))
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
  }, [(visit as any)?.medicationReview]);

  // Education maps for inline learning content
  const diagnosisEducationMap = useMemo(
    () => buildDiagnosisEducationMap((visit as any)?.education),
    [(visit as any)?.education],
  );

  const medicationEducationMap = useMemo(
    () => buildMedicationEducationMap((visit as any)?.education),
    [(visit as any)?.education],
  );

  // Key highlight counts for the at-a-glance bar
  const highlightCounts = useMemo(() => {
    const totalMeds = medications.started.length + medications.stopped.length + medications.changed.length;
    return {
      diagnoses: diagnoses.length,
      medications: totalMeds,
      actions: actionItems.length,
      tests: orderedTests.length,
    };
  }, [diagnoses, medications, actionItems, orderedTests]);

  const hasMedReviewContent =
    medicationReview.reviewed ||
    medicationReview.continuedReviewed.length > 0 ||
    medicationReview.concerns.length > 0 ||
    medicationReview.sideEffects.length > 0 ||
    medicationReview.notes.length > 0 ||
    medicationReview.followUpNeeded;

  const isProcessing =
    visit?.processingStatus && processingStates.includes(visit.processingStatus);

  const lastProcessingUpdate: string | null =
    (visit?.transcriptionSubmittedAt as string | undefined) ||
    (visit?.updatedAt as string | undefined) ||
    (visit?.createdAt as string | undefined) ||
    null;
  const STUCK_THRESHOLD_MS = 30 * 60 * 1000;
  const lastUpdateMs = lastProcessingUpdate ? new Date(lastProcessingUpdate).getTime() : null;

  const isStuck =
    isProcessing && lastUpdateMs ? Date.now() - lastUpdateMs > STUCK_THRESHOLD_MS : false;
  const stuckMinutes =
    isStuck && lastUpdateMs ? Math.floor((Date.now() - lastUpdateMs) / (60 * 1000)) : null;
  const hasLoadFailure = !isLoading && !visit;

  const processingMessage = useMemo(() => {
    switch (visit?.processingStatus) {
      case 'pending':
        return 'Queued to start processing. This may take a moment.';
      case 'processing':
        return 'Processing your visit. This usually takes under a minute.';
      case 'transcribing':
        return 'Transcribing your visit audio\u2026';
      case 'summarizing':
        return 'Summarizing the key points\u2026';
      default:
        return null;
    }
  }, [visit?.processingStatus]);

  useEffect(() => {
    if (hasLoadFailure && !hadLoadFailureRef.current) {
      trackEvent('visit_detail_load_failure', {
        reason: error ? 'query_error' : 'missing_visit',
      });
      hadLoadFailureRef.current = true;
      return;
    }

    if (!hasLoadFailure && hadLoadFailureRef.current && visit) {
      trackEvent('visit_detail_load_recovered');
      hadLoadFailureRef.current = false;
    }
  }, [error, hasLoadFailure, visit]);

  // Auto-show walkthrough on first visit detail open after processing
  useEffect(() => {
    if (walkthroughCheckedRef.current) return;
    if (!visit || !visitId) return;
    if (visit.processingStatus !== 'completed') return;
    const walkthrough = (visit as any)?.walkthrough as VisitWalkthroughType | undefined;
    if (!walkthrough) return;

    walkthroughCheckedRef.current = true;
    AsyncStorage.getItem(`walkthrough_${visitId}`).then((dismissed) => {
      if (dismissed) {
        setWalkthroughDismissed(true);
      } else {
        setWalkthroughVisible(true);
      }
    });
  }, [visit, visitId]);

  const handleWalkthroughDismiss = useCallback(() => {
    setWalkthroughVisible(false);
    setWalkthroughDismissed(true);
    if (visitId) {
      AsyncStorage.setItem(`walkthrough_${visitId}`, 'true');
    }
  }, [visitId]);

  const handleWalkthroughFlag = useCallback(() => {
    setWalkthroughVisible(false);
    setWalkthroughDismissed(true);
    if (visitId) {
      AsyncStorage.setItem(`walkthrough_${visitId}`, 'true');
    }
    Alert.alert(
      'Review your summary',
      "Take a look at the full summary above. If something doesn't match what you remember, contact your care team for follow-up.",
    );
  }, [visitId]);

  const handleRetry = async () => {
    if (!visitId) return;
    try {
      setRetrying(true);
      const updatedVisit = await api.visits.retry(visitId);
      queryClient.setQueryData(queryKeys.visit(visitId), (current: any) => {
        if (!current) return updatedVisit;
        return {
          ...current,
          ...updatedVisit,
        };
      });
      Alert.alert(
        'Retry started',
        'We\u2019ll reprocess this visit now. This usually takes under a minute.'
      );
      await refetch();
    } catch (error) {
      console.error('[VisitDetail] Retry error:', error);
      const status = (error as any)?.status;
      if (status === 409) {
        Alert.alert(
          'Already processing',
          'This visit is currently being processed. Please wait a moment and refresh.'
        );
      } else if (status === 429) {
        let message = 'Please wait a bit longer before retrying.';
        try {
          const body = (error as any)?.body;
          if (body) {
            const parsed = JSON.parse(body);
            if (parsed?.message) message = parsed.message;
          }
        } catch {
          // ignore
        }
        Alert.alert('Too soon to retry', message);
      } else {
        Alert.alert(
          'Retry failed',
          'We could not restart AI processing. Please try again in a moment.'
        );
      }
    } finally {
      setRetrying(false);
    }
  };

  const handleRefresh = useCallback((source: VisitDetailRefreshSource = 'pull_to_refresh') => {
    trackEvent('visit_detail_retry_attempt', {
      source,
      fromErrorState: hasLoadFailure,
    });
    void refetch();
  }, [hasLoadFailure, refetch]);

  // Provider / specialty meta line
  const providerLine = useMemo(() => {
    const parts: string[] = [];
    if (visit?.provider) parts.push(visit.provider as string);
    if (visit?.specialty) parts.push(visit.specialty as string);
    return parts.length > 0 ? parts.join(' \u2022 ') : null;
  }, [visit?.provider, visit?.specialty]);

  return (
    <ErrorBoundary
      title="Unable to open visit details"
      description="We couldn't load this visit. Pull to refresh or go back and try again."
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Visit Details</Text>
          <View style={{ width: 28 }} />
        </View>

        {isLoading && (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingText}>Loading visit details...</Text>
          </View>
        )}

        {!isLoading && !visit && (
          <View style={styles.loadingState}>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
            <Text style={styles.errorTitle}>Unable to load this visit</Text>
            <Text style={styles.errorSubtitle}>
              {error
                ? 'There was a network or server issue loading this visit.'
                : 'This visit may have been removed or is temporarily unavailable.'}
            </Text>
            <View style={styles.errorActionRow}>
              <Pressable
                style={styles.errorRetryButton}
                onPress={() => {
                  handleRefresh('error_fallback');
                }}
              >
                {isRefetching ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.errorRetryButtonText}>Try Again</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.errorSecondaryButton}
                onPress={() => router.replace('/')}
              >
                <Text style={styles.errorSecondaryButtonText}>Back to Home</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!isLoading && visit && (
          <View style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.content}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={() => {
                    handleRefresh('pull_to_refresh');
                  }}
                  tintColor={Colors.primary}
                />
              }
            >
              {/* Meta bar */}
              <View style={styles.metaContainer}>
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>
                    {visit.createdAt ? dayjs(visit.createdAt).format('MMM D, YYYY h:mm A') : 'Unknown date'}
                  </Text>
                  <View style={[styles.badge, { backgroundColor: statusBadge.color }]}>
                    <Text style={styles.badgeText}>{statusBadge.label}</Text>
                  </View>
                </View>
                {providerLine && (
                  <Text style={styles.providerLine}>{providerLine}</Text>
                )}
              </View>

              {/* Processing / stuck / failure banners — UNCHANGED */}
              {isProcessing && processingMessage && (
                <View style={styles.processingBanner}>
                  <ActivityIndicator color={Colors.warning} />
                  <Text style={styles.processingText}>{processingMessage}</Text>
                </View>
              )}

              {isStuck && (
                <View style={styles.stuckBanner}>
                  <Ionicons name="warning-outline" size={20} color={Colors.warning} />
                  <View style={{ flex: 1, gap: spacing(1) }}>
                    <Text style={styles.stuckTitle}>Taking longer than expected</Text>
                    <Text style={styles.stuckText}>
                      {stuckMinutes
                        ? `This visit has been processing for about ${stuckMinutes} minutes.`
                        : 'This visit has been processing for a while.'}{' '}
                      You can retry now or reach out to support if it continues.
                    </Text>
                  </View>
                </View>
              )}

              {visit.processingStatus &&
                (visit.processingStatus === 'failed' || visit.processingStatus === 'pending') && (
                  <Card style={styles.failureCard}>
                    <View style={{ flex: 1, gap: spacing(1) }}>
                      <Text style={styles.failureTitle}>
                        {visit.processingStatus === 'failed'
                          ? 'We couldn\u2019t process this visit'
                          : 'Processing hasn\u2019t started yet'}
                      </Text>
                      <Text style={styles.failureText}>
                        {visit.processingStatus === 'failed'
                          ? (visit.processingError as string) ||
                          'The transcription request failed. Please retry in a moment.'
                          : 'Tap the button to kick off AI processing now.'}
                      </Text>
                    </View>
                    <Pressable
                      style={[
                        styles.retryButton,
                        (retrying || isProcessing) && styles.retryButtonDisabled,
                      ]}
                      onPress={handleRetry}
                      disabled={retrying || Boolean(isProcessing)}
                    >

                      {retrying ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isProcessing ? (
                        <View style={styles.retryButtonContent}>
                          <ActivityIndicator size="small" color="#fff" />
                          <Text style={styles.retryButtonText}>Processing\u2026</Text>
                        </View>
                      ) : (
                        <Text style={styles.retryButtonText}>
                          {visit.processingStatus === 'failed' ? 'Retry' : 'Start'}
                        </Text>
                      )}
                    </Pressable>
                  </Card>
                )}

              {/* Medication confirmation banner */}
              {visit.medicationConfirmationStatus === 'pending' && (
                <Pressable
                  style={styles.medReviewBanner}
                  onPress={() => setShowMedicationReview(true)}
                >
                  <Ionicons name="medkit" size={22} color={Colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.medReviewBannerTitle}>
                      Review Medication Changes
                    </Text>
                    <Text style={styles.medReviewBannerSubtitle}>
                      Medications need your confirmation before saving
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </Pressable>
              )}

              {/* ── PRIMARY ZONE: Summary Hero ── */}
              <View style={styles.summaryHero}>
                <View style={styles.summaryHeroHeader}>
                  <Ionicons name="sparkles" size={20} color={Colors.primary} />
                  <Text style={styles.summaryHeroTitle}>Your Visit Summary</Text>
                </View>
                {visit.summary ? (
                  <Text style={styles.summaryHeroText}>{visit.summary}</Text>
                ) : (
                  <Text style={styles.placeholderText}>
                    {isProcessing
                      ? 'Your summary is being generated\u2026'
                      : 'Summary will appear here once processing is complete.'}
                  </Text>
                )}
              </View>

              {/* ── KEY HIGHLIGHTS BAR ── */}
              {(highlightCounts.diagnoses > 0 ||
                highlightCounts.medications > 0 ||
                highlightCounts.actions > 0 ||
                highlightCounts.tests > 0) && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.highlightsBar}
                  contentContainerStyle={styles.highlightsBarContent}
                >
                  {highlightCounts.diagnoses > 0 && (
                    <View style={styles.highlightChip}>
                      <Ionicons name="medical" size={14} color={Colors.primary} />
                      <Text style={styles.highlightChipText}>
                        {highlightCounts.diagnoses} {highlightCounts.diagnoses === 1 ? 'Diagnosis' : 'Diagnoses'}
                      </Text>
                    </View>
                  )}
                  {highlightCounts.medications > 0 && (
                    <View style={styles.highlightChip}>
                      <Ionicons name="medkit" size={14} color={Colors.primary} />
                      <Text style={styles.highlightChipText}>
                        {highlightCounts.medications} Med {highlightCounts.medications === 1 ? 'Change' : 'Changes'}
                      </Text>
                    </View>
                  )}
                  {highlightCounts.actions > 0 && (
                    <View style={styles.highlightChip}>
                      <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                      <Text style={styles.highlightChipText}>
                        {highlightCounts.actions} {highlightCounts.actions === 1 ? 'Action' : 'Actions'}
                      </Text>
                    </View>
                  )}
                  {highlightCounts.tests > 0 && (
                    <View style={styles.highlightChip}>
                      <Ionicons name="flask" size={14} color={Colors.primary} />
                      <Text style={styles.highlightChipText}>
                        {highlightCounts.tests} {highlightCounts.tests === 1 ? 'Test' : 'Tests'} Ordered
                      </Text>
                    </View>
                  )}
                </ScrollView>
              )}

              {/* ── STRUCTURED DATA: Action Items ── */}
              {actionItems.length > 0 && (
                <SummarySection title="Action Items" icon="checkmark-circle">
                  {actionItems.map((item, idx) => {
                    const matched = visitActions.get(item);
                    return (
                      <Pressable
                        key={idx}
                        style={styles.actionItemRow}
                        onPress={matched ? () => handleToggleActionItem(matched.id, matched.completed) : undefined}
                        disabled={!matched}
                      >
                        {matched ? (
                          <Ionicons
                            name={matched.completed ? 'checkmark-circle' : 'ellipse-outline'}
                            size={22}
                            color={matched.completed ? Colors.success : Colors.primary}
                          />
                        ) : (
                          <Ionicons name="ellipse-outline" size={16} color={Colors.primary} />
                        )}
                        <Text
                          style={[
                            styles.listRowText,
                            matched?.completed && styles.actionItemCompleted,
                          ]}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={styles.viewAllLink}
                    onPress={() => router.push('/actions')}
                  >
                    <Text style={styles.viewAllLinkText}>View all actions</Text>
                    <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
                  </Pressable>
                </SummarySection>
              )}

              {/* ── STRUCTURED DATA: Diagnoses + Education ── */}
              {diagnoses.length > 0 && (
                <SummarySection title="Diagnoses Discussed" icon="medical">
                  {diagnoses.map((item, idx) => {
                    const edu = diagnosisEducationMap.get(normalizeEducationKey(item));
                    return (
                      <View key={idx}>
                        <View style={styles.listRow}>
                          <Ionicons name="medical" size={16} color={Colors.primary} />
                          <View style={styles.listRowContent}>
                            <Text style={styles.listRowText}>{item}</Text>
                            <Pressable
                              style={styles.learnMoreLink}
                              onPress={() => Linking.openURL(getMedlinePlusUrl(item))}
                              hitSlop={8}
                            >
                              <Ionicons name="open-outline" size={12} color={Colors.textMuted} />
                              <Text style={styles.learnMoreText}>Learn more</Text>
                            </Pressable>
                          </View>
                        </View>
                        {edu && <DiagnosisEducationCard {...edu} />}
                      </View>
                    );
                  })}
                </SummarySection>
              )}

              {/* ── STRUCTURED DATA: Medication Changes + Education ── */}
              {(medications.started.length > 0 ||
                medications.stopped.length > 0 ||
                medications.changed.length > 0) && (
                <SummarySection title="Medication Changes" icon="medkit">
                  <View style={{ gap: spacing(3) }}>
                    {(['started', 'stopped', 'changed'] as Array<keyof typeof medications>).map(
                      (typedKey) => {
                        const labelMap: Record<typeof typedKey, string> = {
                          started: 'Started',
                          stopped: 'Stopped',
                          changed: 'Changed',
                        };
                        const items = medications[typedKey];
                        if (!items.length) return null;
                        return (
                          <View key={typedKey}>
                            <Text style={styles.medSubheading}>{labelMap[typedKey]}</Text>
                            {items.map((item, idx) => {
                              const edu = medicationEducationMap.get(
                                normalizeEducationKey(item.primary),
                              );
                              // Parse dose/frequency from secondary text
                              const secParts = item.secondary?.split(' \u2022 ') ?? [];
                              const extractedDose = secParts[0] || undefined;
                              const extractedFreq = secParts[1] || undefined;
                              return (
                                <View key={idx}>
                                  <View style={styles.listRow}>
                                    <Ionicons name="medkit" size={16} color={Colors.primary} />
                                    <View style={styles.listRowContent}>
                                      <Text style={styles.listRowText}>{item.primary}</Text>
                                      {item.secondary && (
                                        <Text style={styles.listRowSubText}>{item.secondary}</Text>
                                      )}
                                      <View style={styles.medLinksRow}>
                                        <Pressable
                                          style={styles.learnMoreLink}
                                          onPress={() => Linking.openURL(getMedlinePlusUrl(item.primary))}
                                          hitSlop={8}
                                        >
                                          <Ionicons name="open-outline" size={12} color={Colors.textMuted} />
                                          <Text style={styles.learnMoreText}>Learn more</Text>
                                        </Pressable>
                                        {(typedKey === 'started' || typedKey === 'changed') && (
                                          <Pressable
                                            style={styles.editMedLink}
                                            onPress={() => handleEditExtractedMed(item.primary, extractedDose, extractedFreq)}
                                            hitSlop={8}
                                          >
                                            <Ionicons name="pencil-outline" size={12} color={Colors.primary} />
                                            <Text style={styles.editMedLinkText}>Edit</Text>
                                          </Pressable>
                                        )}
                                      </View>
                                    </View>
                                  </View>
                                  {edu && <MedicationEducationCard {...edu} />}
                                </View>
                              );
                            })}
                          </View>
                        );
                      },
                    )}
                  </View>
                </SummarySection>
              )}

              {/* ── STRUCTURED DATA: Imaging & Labs ── */}
              {orderedTests.length > 0 && (
                <SummarySection title="Imaging & Labs Ordered" icon="flask">
                  {orderedTests.map((item, idx) => (
                    <View key={idx} style={styles.listRow}>
                      <Ionicons name="image" size={16} color={Colors.primary} />
                      <Text style={styles.listRowText}>{item}</Text>
                    </View>
                  ))}
                </SummarySection>
              )}

              {/* ── SECONDARY ZONE: Medication Review (collapsed) ── */}
              {hasMedReviewContent && (
                <CollapsibleSection
                  title="Medication Review"
                  icon="clipboard-outline"
                  defaultExpanded={false}
                >
                  <View style={{ gap: spacing(3) }}>
                    {medicationReview.continuedReviewed.length > 0 && (
                      <View>
                        <Text style={styles.medSubheading}>Reviewed/Continued</Text>
                        {medicationReview.continuedReviewed.map((item, idx) => (
                          <View key={idx} style={styles.listRow}>
                            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.primary} />
                            <View style={styles.listRowContent}>
                              <Text style={styles.listRowText}>{item.primary}</Text>
                              {item.secondary ? (
                                <Text style={styles.listRowSubText}>{item.secondary}</Text>
                              ) : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {medicationReview.concerns.length > 0 && (
                      <View>
                        <Text style={styles.medSubheading}>Review Concerns</Text>
                        {medicationReview.concerns.map((item, idx) => (
                          <View key={idx} style={styles.listRow}>
                            <Ionicons name="alert-circle-outline" size={16} color={Colors.warning} />
                            <Text style={styles.listRowText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {medicationReview.sideEffects.length > 0 && (
                      <View>
                        <Text style={styles.medSubheading}>Side Effects Discussed</Text>
                        {medicationReview.sideEffects.map((item: string, idx: number) => (
                          <View key={idx} style={styles.listRow}>
                            <Ionicons name="information-circle-outline" size={16} color={Colors.primary} />
                            <Text style={styles.listRowText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {medicationReview.notes.length > 0 && (
                      <View>
                        <Text style={styles.medSubheading}>Review Notes</Text>
                        {medicationReview.notes.map((item: string, idx: number) => (
                          <View key={idx} style={styles.listRow}>
                            <Ionicons name="document-text-outline" size={16} color={Colors.primary} />
                            <Text style={styles.listRowText}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {medicationReview.followUpNeeded && (
                      <View style={styles.listRow}>
                        <Ionicons name="time-outline" size={16} color={Colors.warning} />
                        <Text style={styles.listRowText}>
                          Medication follow-up is needed.
                        </Text>
                      </View>
                    )}
                  </View>
                </CollapsibleSection>
              )}

              {/* ── SECONDARY ZONE: Full Transcript (collapsed) ── */}
              {visit.transcript && (
                <CollapsibleSection
                  title="Full Transcript"
                  icon="document-text-outline"
                  defaultExpanded={false}
                >
                  <Text style={styles.transcriptText}>{visit.transcript}</Text>
                </CollapsibleSection>
              )}
            </ScrollView>

            {/* Floating "Review with LumiBot" pill */}
            {!walkthroughVisible && (visit as any)?.walkthrough && visit.processingStatus === 'completed' && (
              <Pressable
                style={styles.floatingLumibotPill}
                onPress={() => setWalkthroughVisible(true)}
              >
                <View style={styles.floatingLumibotIcon}>
                  <Ionicons name="sparkles" size={14} color="#fff" />
                </View>
                <Text style={styles.floatingLumibotText}>Review with LumiBot</Text>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
      {/* Edit Medication Sheet (from extracted meds) */}
      <EditMedicationSheet
        medication={editSheetMed}
        visible={editSheetMed !== null}
        onClose={() => setEditSheetMed(null)}
      />
      {/* Medication Review Sheet (opened from banner) */}
      {visit && (
        <MedicationReviewSheet
          visible={showMedicationReview}
          visitId={visit.id}
          visitDate={visit.visitDate ?? visit.createdAt ?? null}
          pendingMedicationChanges={
            (visit as any).pendingMedicationChanges ?? {
              started: [],
              stopped: [],
              changed: [],
            }
          }
          onClose={() => {
            setShowMedicationReview(false);
            refetch();
          }}
          onConfirmComplete={(count) => {
            Alert.alert(
              'Medications Confirmed',
              `${count} medication${count > 1 ? 's' : ''} saved to your list.`,
              [{ text: 'OK' }],
            );
          }}
        />
      )}
      {/* LumiBot Walkthrough Overlay */}
      {visit && (visit as any)?.walkthrough && visitId && (
        <VisitWalkthrough
          visible={walkthroughVisible}
          walkthrough={(visit as any).walkthrough as VisitWalkthroughType}
          visitId={visitId}
          onDismiss={handleWalkthroughDismiss}
          onFlag={handleWalkthroughFlag}
        />
      )}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(4),
  },
  headerButton: {
    padding: spacing(1),
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Fraunces_600SemiBold',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing(3),
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
  },
  errorSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing(8),
  },
  errorActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(2),
  },
  errorRetryButton: {
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(2.5),
    borderRadius: spacing(2),
    backgroundColor: Colors.primary,
    minWidth: 108,
    alignItems: 'center',
  },
  errorRetryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  errorSecondaryButton: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    borderRadius: spacing(2),
    borderWidth: 1,
    borderColor: Colors.stroke,
    backgroundColor: Colors.surface,
    minWidth: 120,
    alignItems: 'center',
  },
  errorSecondaryButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  content: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(20),
  },
  metaContainer: {
    marginBottom: spacing(4),
    gap: spacing(1),
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  providerLine: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  badge: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: `${Colors.warning}1A`,
    borderRadius: spacing(3),
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  processingText: {
    flex: 1,
    color: Colors.warning,
    fontSize: 14,
  },
  stuckBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(3),
    backgroundColor: `${Colors.warning}12`,
    borderRadius: spacing(3),
    padding: spacing(4),
    marginBottom: spacing(4),
  },
  stuckTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.warning,
  },
  stuckText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  failureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    padding: spacing(4),
    backgroundColor: `${Colors.error}10`,
  },
  failureTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  failureText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  retryButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderRadius: spacing(2),
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  medReviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    backgroundColor: `${Colors.accent}12`,
    borderRadius: spacing(3),
    padding: spacing(4),
    marginBottom: spacing(4),
    borderWidth: 1,
    borderColor: `${Colors.accent}30`,
  },
  medReviewBannerTitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  medReviewBannerSubtitle: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },

  /* ── Summary Hero ── */
  summaryHero: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: spacing(5),
    borderWidth: 1,
    borderColor: Colors.stroke,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    shadowColor: 'rgba(38,35,28,0.5)',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: spacing(4),
  },
  summaryHeroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginBottom: spacing(3),
  },
  summaryHeroTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  summaryHeroText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.text,
    lineHeight: 25,
  },

  /* ── Key Highlights Bar ── */
  highlightsBar: {
    marginBottom: spacing(5),
    flexGrow: 0,
  },
  highlightsBarContent: {
    gap: spacing(2),
    paddingRight: spacing(2),
  },
  highlightChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: 'rgba(64,201,208,0.12)',
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
  },
  highlightChipText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },

  /* ── Sections ── */
  section: {
    marginBottom: spacing(4),
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  sectionCard: {
    padding: spacing(4),
    gap: spacing(3),
  },
  medSubheading: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    marginBottom: spacing(2),
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(1),
  },
  listRowContent: {
    flex: 1,
    gap: spacing(1),
  },
  listRowText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  listRowSubText: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  medLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(4),
    marginTop: spacing(1),
  },
  learnMoreLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  learnMoreText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  editMedLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  editMedLinkText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  transcriptText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  viewAllLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing(2),
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: Colors.stroke,
  },
  viewAllLinkText: {
    fontSize: 14,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  floatingLumibotPill: {
    position: 'absolute',
    bottom: spacing(5),
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(5),
    shadowColor: Colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  floatingLumibotIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingLumibotText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
  actionItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(1.5),
    minHeight: 44,
  },
  actionItemCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
    opacity: 0.7,
  },
});
