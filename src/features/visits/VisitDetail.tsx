import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TagDisplay } from '@/shared/components/tags/TagDisplay';
import { TagInput } from '@/shared/components/tags/TagInput';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import {
    addTagsToVisit,
    getUserTags,
    listFolders,
    moveVisitToFolder,
    removeTagFromVisit,
    VisitFolder,
} from '@/shared/services/api/folders';
import { createProvider, listProviders, Provider } from '@/shared/services/api/providers';
import {
    deleteVisit,
    getVisitById,
    getVisitSummary,
    getVisitTranscript,
    updateVisit,
    Visit,
} from '@/shared/services/api/visits';

interface SummaryActionItem {
  type?: string;
  title?: string;
  detail?: string;
  dueDate?: string | Date | null;
}

interface SummaryMedication {
  name?: string;
  changeType?: string;
  dosage?: string;
  instructions?: string;
  validationStatus?: 'verified' | 'unverified';
  confidence?: 'high' | 'low' | 'uncertain';
  suggestedName?: string;
  validationWarning?: string;
}

interface SummaryDiagnosis {
  name?: string;
  isNew?: boolean;
  notes?: string;
  validationStatus?: 'verified' | 'unverified';
  confidence?: 'high' | 'low' | 'uncertain';
  suggestedName?: string;
  validationWarning?: string;
}

interface VisitSummaryData {
  overview?: string;
  keyPoints?: string[];
  diagnoses?: SummaryDiagnosis[];
  medications?: SummaryMedication[];
  actionItems?: SummaryActionItem[];
}

const formatEnumLabel = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const formatDateLabel = (input?: string | Date | null) => {
  if (!input) {
    return null;
  }
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface VisitDetailProps {
  visitId: string;
  onBack: () => void;
  onDeleted?: () => void;
}

export const VisitDetail: React.FC<VisitDetailProps> = ({ visitId, onBack, onDeleted }) => {
  const [visit, setVisit] = useState<Visit | null>(null);
  const [summary, setSummary] = useState<VisitSummaryData | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [updatingProvider, setUpdatingProvider] = useState(false);
  const [manualProviderName, setManualProviderName] = useState('');
  const [manualProviderSpecialty, setManualProviderSpecialty] = useState('');
  const [savingManualProvider, setSavingManualProvider] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);

  // Folder and tag state
  const [folders, setFolders] = useState<VisitFolder[]>([]);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [updatingFolder, setUpdatingFolder] = useState(false);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [visitTags, setVisitTags] = useState<string[]>([]);
  const [showTagManager, setShowTagManager] = useState(false);
  const [managingTags, setManagingTags] = useState(false);
  const [expandedSummary, setExpandedSummary] = useState(false);

  const loadVisit = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [visitData, summaryData] = await Promise.all([
        getVisitById(visitId),
        getVisitSummary(visitId).catch(() => null),
      ]);

      setVisit(visitData);
      setSummary(summaryData?.summary ?? null);

      if (visitData.status === 'COMPLETED' && visitData.transcription) {
        try {
          const transcriptData = await getVisitTranscript(visitId);
          setTranscript(transcriptData.transcript);
        } catch (err) {
          console.warn('Could not load transcript', err);
        }
      }
    } catch (err: any) {
      console.error('Failed to load visit', err);
      setError(err.response?.data?.error?.message ?? 'Unable to load visit details');
    } finally {
      setLoading(false);
    }
  }, [visitId]);

  useEffect(() => {
    loadVisit();
  }, [loadVisit]);

  const loadProviders = useCallback(async () => {
    try {
      setLoadingProviders(true);
      const data = await listProviders();
      setProviders(data.filter((provider) => provider.name && provider.name.trim().length > 0 && provider.notes !== 'SYSTEM_PLACEHOLDER_PROVIDER'));
      setProvidersError(null);
    } catch (err: any) {
      console.error('Failed to load providers', err);
      Alert.alert('Error', 'Unable to load providers');
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const resetManualProviderForm = useCallback(() => {
    setManualProviderName('');
    setManualProviderSpecialty('');
    setSavingManualProvider(false);
  }, []);

  const handleChangeProvider = useCallback(() => {
    setShowProviderPicker(true);
    resetManualProviderForm();
    setProvidersError(null);
    if (providers.length === 0) {
      loadProviders();
    }
  }, [loadProviders, providers.length, resetManualProviderForm]);

  const handleManualProviderSubmit = useCallback(async () => {
    if (!visit) {
      return;
    }

    const trimmedName = manualProviderName.trim();
    if (!trimmedName) {
      return;
    }

    const existingProvider = providers.find(
      (provider) => provider.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (existingProvider) {
      await handleSelectProvider(existingProvider.id);
      return;
    }

    try {
      setSavingManualProvider(true);
      setProvidersError(null);

      const newProvider = await createProvider({
        name: trimmedName,
        specialty: manualProviderSpecialty.trim() || undefined,
      });

      setProviders((prev) => [...prev, newProvider]);

      const updatedVisit = await updateVisit(visit.id, { providerId: newProvider.id });
      setVisit(updatedVisit);
      setShowProviderPicker(false);
      resetManualProviderForm();
      Alert.alert('Success', 'Provider added and assigned.');
    } catch (err: any) {
      console.error('Failed to add provider', err);
      setProvidersError(err?.response?.data?.error?.message ?? 'Unable to add provider');
    } finally {
      setSavingManualProvider(false);
    }
  }, [
    handleSelectProvider,
    manualProviderName,
    manualProviderSpecialty,
    providers,
    resetManualProviderForm,
    visit,
  ]);

  const handleSelectProvider = useCallback(
    async (providerId: string) => {
      if (!visit) return;

      try {
        setUpdatingProvider(true);
        setProvidersError(null);
        const updatedVisit = await updateVisit(visit.id, { providerId });
        setVisit(updatedVisit);
        setShowProviderPicker(false);
        resetManualProviderForm();
        Alert.alert('Success', 'Provider updated successfully');
      } catch (err: any) {
        console.error('Failed to update provider', err);
        setProvidersError(err.response?.data?.error?.message ?? 'Unable to update provider');
        Alert.alert('Error', err.response?.data?.error?.message ?? 'Unable to update provider');
      } finally {
        setUpdatingProvider(false);
      }
    },
    [resetManualProviderForm, visit]
  );

  const handleRemoveProvider = useCallback(async () => {
    if (!visit) return;

    Alert.alert(
      'Remove Provider',
      'Are you sure you want to remove the provider from this visit?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setUpdatingProvider(true);
              const updatedVisit = await updateVisit(visit.id, { providerId: undefined as any });
              setVisit(updatedVisit);
              Alert.alert('Success', 'Provider removed from visit');
            } catch (err: any) {
              console.error('Failed to remove provider', err);
              Alert.alert('Error', 'Unable to remove provider');
            } finally {
              setUpdatingProvider(false);
            }
          },
        },
      ]
    );
  }, [visit]);

  // Folder handlers
  const loadFoldersAndTags = useCallback(async () => {
    try {
      const [foldersData, tagsData] = await Promise.all([
        listFolders(),
        getUserTags().catch(() => []),
      ]);
      setFolders(foldersData);
      setExistingTags(tagsData);
    } catch (err: any) {
      console.error('Failed to load folders and tags', err);
    }
  }, []);

  const handleManageFolder = useCallback(() => {
    setShowFolderPicker(true);
    if (folders.length === 0) {
      loadFoldersAndTags();
    }
  }, [folders.length, loadFoldersAndTags]);

  const handleSelectFolder = useCallback(
    async (folderId: string | null) => {
      if (!visit) return;

      try {
        setUpdatingFolder(true);
        const updatedVisit = await moveVisitToFolder(visit.id, folderId);
        setVisit(updatedVisit);
        setShowFolderPicker(false);
        Alert.alert('Success', folderId ? 'Visit moved to folder' : 'Visit removed from folder');
      } catch (err: any) {
        console.error('Failed to move visit', err);
        Alert.alert('Error', err.response?.data?.error?.message ?? 'Unable to move visit');
      } finally {
        setUpdatingFolder(false);
      }
    },
    [visit]
  );

  // Tag handlers
  const handleManageTags = useCallback(() => {
    setShowTagManager(true);
    if (visit?.tags) {
      setVisitTags(visit.tags);
    }
    if (existingTags.length === 0) {
      loadFoldersAndTags();
    }
  }, [existingTags.length, loadFoldersAndTags, visit?.tags]);

  const handleAddTag = useCallback(
    async (tag: string) => {
      if (!visit) return;

      try {
        setManagingTags(true);
        const updatedVisit = await addTagsToVisit(visit.id, [tag]);
        setVisit(updatedVisit);
        setVisitTags(updatedVisit.tags || []);

        // Add to existing tags if not already there
        if (!existingTags.includes(tag)) {
          setExistingTags((prev) => [...prev, tag]);
        }
      } catch (err: any) {
        console.error('Failed to add tag', err);
        Alert.alert('Error', err.response?.data?.error?.message ?? 'Unable to add tag');
      } finally {
        setManagingTags(false);
      }
    },
    [existingTags, visit]
  );

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!visit) return;

      try {
        setManagingTags(true);
        const updatedVisit = await removeTagFromVisit(visit.id, tag);
        setVisit(updatedVisit);
        setVisitTags(updatedVisit.tags || []);
      } catch (err: any) {
        console.error('Failed to remove tag', err);
        Alert.alert('Error', err.response?.data?.error?.message ?? 'Unable to remove tag');
      } finally {
        setManagingTags(false);
      }
    },
    [visit]
  );

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Delete Visit',
      'Are you sure you want to delete this visit? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              await deleteVisit(visitId);
              Alert.alert('Success', 'Visit deleted successfully', [
                { text: 'OK', onPress: () => onDeleted?.() ?? onBack() },
              ]);
            } catch (err: any) {
              console.error('Failed to delete visit', err);
              Alert.alert('Error', err.response?.data?.error?.message ?? 'Unable to delete visit');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  }, [onBack, onDeleted, visitId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.PRIMARY} size="large" />
          <Text style={styles.loadingText}>Loading visit details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !visit) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error ?? 'Visit not found'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadVisit}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const formattedDate = new Date(visit.visitDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const keyPoints = Array.isArray(summary?.keyPoints)
    ? (expandedSummary ? summary.keyPoints : summary.keyPoints.slice(0, 3))
    : [];
  const summaryMessage = summary
    ? null
    : visit.status === 'PROCESSING'
    ? 'Summary is processing. Check back soon.'
    : 'No summary is available for this visit yet.';

  const statusColor =
    visit.status === 'COMPLETED'
      ? COLORS.SUCCESS
      : visit.status === 'PROCESSING'
      ? COLORS.PRIMARY
      : visit.status === 'FAILED'
      ? COLORS.DANGER
      : COLORS.SECONDARY;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleDelete}
          style={styles.deleteButton}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={COLORS.DANGER} />
          ) : (
            <Text style={styles.deleteButtonText}>Delete</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleSection}>
          <View>
            <Text style={styles.title}>Visit Details</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {visit.status.toLowerCase()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.summaryHighlightCard}>
          <View style={styles.summaryHighlightHeader}>
            <Text style={styles.summaryHighlightTitle}>Quick summary</Text>
            {visit.status === 'PROCESSING' && !summary ? (
              <ActivityIndicator size="small" color={COLORS.PRIMARY} />
            ) : null}
          </View>
          {summary ? (
            <>
              {summary?.overview ? (
                <Text style={styles.summaryHighlightText}>{summary?.overview}</Text>
              ) : null}
              {keyPoints.length > 0 ? (
                <View style={styles.summaryKeyPoints}>
                  {keyPoints.map((point: string, index: number) => (
                    <View key={index} style={styles.summaryKeyPointRow}>
                      <Text style={styles.summaryKeyPointBullet}>•</Text>
                      <Text style={styles.summaryKeyPointText}>{point}</Text>
                    </View>
                  ))}
                  {Array.isArray(summary?.keyPoints) && summary.keyPoints.length > 3 && !expandedSummary ? (
                    <TouchableOpacity onPress={() => setExpandedSummary(true)}>
                      <Text style={styles.summaryKeyPointMore}>
                        +{summary.keyPoints.length - 3} more · Tap to expand
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {expandedSummary && Array.isArray(summary?.keyPoints) && summary.keyPoints.length > 3 ? (
                    <TouchableOpacity onPress={() => setExpandedSummary(false)}>
                      <Text style={styles.summaryKeyPointMore}>
                        Show less
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
              {!summary?.overview && keyPoints.length === 0 ? (
                <Text style={styles.summaryHighlightEmpty}>
                  We captured this visit but the AI summary does not highlight specific talking points. Check the full summary below for details.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.summaryHighlightEmpty}>{summaryMessage}</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Provider</Text>
          {visit.provider ? (
            <View style={styles.providerInfo}>
              <View style={styles.providerDetails}>
                <Text style={styles.providerName}>{visit.provider.name}</Text>
                {visit.provider.specialty && (
                  <Text style={styles.providerSpecialty}>{visit.provider.specialty}</Text>
                )}
                {visit.provider.practice && (
                  <Text style={styles.providerPractice}>{visit.provider.practice}</Text>
                )}
              </View>
              <View style={styles.providerActions}>
                <TouchableOpacity
                  onPress={handleChangeProvider}
                  style={styles.changeProviderButton}
                  disabled={updatingProvider}
                >
                  <Text style={styles.changeProviderText}>Change</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleRemoveProvider}
                  style={styles.removeProviderButton}
                  disabled={updatingProvider}
                >
                  <Text style={styles.removeProviderText}>Remove</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <Text style={styles.noProviderText}>No provider assigned</Text>
              <TouchableOpacity
                onPress={handleChangeProvider}
                style={styles.addProviderButton}
                disabled={updatingProvider}
              >
                <Text style={styles.addProviderText}>+ Add Provider</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Visit Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date & Time</Text>
            <Text style={styles.infoValue}>{formattedDate}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Type</Text>
            <Text style={styles.infoValue}>
              {visit.visitType.replace('_', ' ').toLowerCase()}
            </Text>
          </View>
          {visit.duration && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Duration</Text>
              <Text style={styles.infoValue}>{Math.round(visit.duration / 60)} minutes</Text>
            </View>
          )}
        </View>

        {/* Folder Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Folder</Text>
          {visit.folder ? (
            <View style={styles.folderInfo}>
              <View style={styles.folderDisplay}>
                <View style={[styles.folderColor, { backgroundColor: visit.folder.color || COLORS.PRIMARY }]} />
                <Text style={styles.folderName}>{visit.folder.name}</Text>
              </View>
              <TouchableOpacity
                onPress={handleManageFolder}
                style={styles.changeFolderButton}
                disabled={updatingFolder}
              >
                <Text style={styles.changeFolderText}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.noFolderText}>Not in any folder</Text>
              <TouchableOpacity
                onPress={handleManageFolder}
                style={styles.addFolderButton}
                disabled={updatingFolder}
              >
                <Text style={styles.addFolderText}>+ Add to Folder</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Tags Section */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Tags</Text>
            <TouchableOpacity onPress={handleManageTags} disabled={managingTags}>
              <Text style={styles.manageTagsLink}>Manage</Text>
            </TouchableOpacity>
          </View>
          {visit.tags && visit.tags.length > 0 ? (
            <TagDisplay tags={visit.tags} />
          ) : (
            <Text style={styles.noTagsText}>No tags yet</Text>
          )}
        </View>

        {summary && (
          <>
            {summary?.actionItems && summary?.actionItems.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Action Items</Text>
                {summary.actionItems.map((item, index) => {
                  const typeLabel = formatEnumLabel(item.type);
                  const dueLabel = formatDateLabel(item.dueDate);
                  return (
                    <View key={`${item.title ?? index}-${index}`} style={styles.actionItem}>
                      <Text style={styles.actionItemBullet}>•</Text>
                      <View style={styles.actionItemContent}>
                        {item.title ? (
                          <Text style={styles.actionItemTitle}>{item.title}</Text>
                        ) : null}
                        {item.detail ? (
                          <Text style={styles.actionItemDetail}>{item.detail}</Text>
                        ) : null}
                        {typeLabel || dueLabel ? (
                          <View style={styles.actionItemMeta}>
                            {typeLabel ? (
                              <Text style={styles.actionItemMetaText}>{typeLabel}</Text>
                            ) : null}
                            {dueLabel ? (
                              <Text style={styles.actionItemMetaText}>Due {dueLabel}</Text>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {summary?.medications && summary?.medications.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Medications Mentioned</Text>
                {summary.medications.map((med, index) => {
                  const changeType = formatEnumLabel(med.changeType);
                  return (
                    <View key={`${med.name ?? index}-${index}`} style={styles.medicationItem}>
                      <Text style={styles.medicationName}>
                        • {med.name ?? 'Medication'}
                        {changeType ? ` (${changeType})` : ''}
                      </Text>
                      {med.dosage ? (
                        <Text style={styles.medicationDetail}>{med.dosage}</Text>
                      ) : null}
                      {med.instructions ? (
                        <Text style={styles.medicationDetail}>{med.instructions}</Text>
                      ) : null}
                      {med.validationWarning ? (
                        <View style={
                          med.validationWarning.startsWith('ℹ️') 
                            ? styles.brandNameInfoContainer 
                            : styles.validationWarningContainer
                        }>
                          <Text style={
                            med.validationWarning.startsWith('ℹ️')
                              ? styles.brandNameInfoText
                              : styles.validationWarningText
                          }>
                            {med.validationWarning}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Medication Interaction Warnings */}
            {summary?.medicationInteractions && summary.medicationInteractions.length > 0 && (
              <View style={styles.card}>
                <View style={styles.interactionWarningHeader}>
                  <Text style={styles.interactionWarningIcon}>ℹ️</Text>
                  <Text style={styles.cardTitle}>Medication Information</Text>
                </View>
                <Text style={styles.interactionWarningSubtitle}>
                  For informational purposes - potential interactions noted
                </Text>
                
                {/* Medical Disclaimer - Prominent */}
                <View style={styles.disclaimerBox}>
                  <Text style={styles.disclaimerText}>
                    ⚠️ NOT MEDICAL ADVICE: This is educational information only. Always consult your healthcare provider before starting, stopping, or changing any medication.
                  </Text>
                </View>
                {summary.medicationInteractions.map((warning: any, index: number) => {
                  const severityColor = warning.severity === 'critical' 
                    ? '#DC2626' 
                    : warning.severity === 'major' 
                    ? '#EA580C' 
                    : '#F59E0B';
                  
                  const severityLabel = warning.severity === 'critical'
                    ? 'HIGH PRIORITY'
                    : warning.severity === 'major'
                    ? 'IMPORTANT'
                    : 'NOTABLE';

                  return (
                    <View 
                      key={`interaction-${index}`} 
                      style={[
                        styles.interactionWarningCard,
                        { borderLeftColor: severityColor }
                      ]}
                    >
                      <View style={styles.interactionHeader}>
                        <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
                          <Text style={styles.severityBadgeText}>{severityLabel}</Text>
                        </View>
                        <Text style={styles.interactionType}>
                          {warning.type === 'duplication' ? '🔄 Duplication' : '⚡ Interaction'}
                        </Text>
                      </View>
                      
                      <Text style={styles.interactionMedications}>
                        {warning.medication1} + {warning.medication2}
                      </Text>
                      
                      {warning.drugClass && (
                        <Text style={styles.interactionDrugClass}>
                          Both are {warning.drugClass}
                        </Text>
                      )}
                      
                      <Text style={styles.interactionDescription}>
                        {warning.description}
                      </Text>
                      
                      <View style={styles.interactionRecommendationBox}>
                        <Text style={styles.interactionRecommendationLabel}>
                          Consider:
                        </Text>
                        <Text style={styles.interactionRecommendation}>
                          {warning.recommendation}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {summary?.discussedConditions && summary?.discussedConditions.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Conditions Discussed</Text>
                <Text style={styles.cardSubtitle}>From your profile</Text>
                <View style={styles.discussedConditionsContainer}>
                  {summary.discussedConditions.map((condition: any, index: number) => {
                    // Handle both string format (old) and object format (new with validation)
                    const conditionName = typeof condition === 'string' ? condition : condition.name;
                    const conditionKey = typeof condition === 'string' ? condition : condition.name ?? index;
                    
                    return (
                      <View key={`${conditionKey}-${index}`} style={styles.conditionChip}>
                        <Text style={styles.conditionChipText}>{conditionName}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {summary?.diagnoses && summary?.diagnoses.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Diagnoses</Text>
                {summary.diagnoses.map((diagnosis, index) => (
                  <View key={`${diagnosis.name ?? index}-${index}`} style={styles.diagnosisItem}>
                    <Text style={styles.diagnosisName}>
                      • {diagnosis.name ?? 'Diagnosis'}
                      {diagnosis.isNew ? ' (New)' : ''}
                    </Text>
                    {diagnosis.notes ? (
                      <Text style={styles.diagnosisDetail}>{diagnosis.notes}</Text>
                    ) : null}
                    {diagnosis.validationWarning ? (
                      <View style={styles.validationWarningContainer}>
                        <Text style={styles.validationWarningText}>{diagnosis.validationWarning}</Text>
                        {diagnosis.suggestedName && diagnosis.suggestedName !== diagnosis.name && (
                          <Text style={styles.validationSuggestion}>
                            Suggested: {diagnosis.suggestedName}
                          </Text>
                        )}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {transcript && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Full Transcript</Text>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </View>
        )}

        {visit.status === 'PROCESSING' && (
          <View style={styles.processingCard}>
            <ActivityIndicator color={COLORS.PRIMARY} />
            <Text style={styles.processingText}>
              AI is processing this visit. Check back in a few minutes for the summary and
              transcript.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showProviderPicker}
        animationType="slide"
        transparent
        onRequestClose={() => {
          setShowProviderPicker(false);
          resetManualProviderForm();
        }}
      >
        <View style={styles.providerPickerContainer}>
          <Pressable
            style={styles.providerPickerBackdrop}
            onPress={() => {
              setShowProviderPicker(false);
              resetManualProviderForm();
            }}
          />
          <View style={styles.providerPickerSheet}>
            <View style={styles.providerPickerHeader}>
              <Text style={styles.providerPickerTitle}>Assign provider</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowProviderPicker(false);
                  resetManualProviderForm();
                }}
              >
                <Text style={styles.providerPickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingProviders ? (
              <View style={styles.providerPickerLoading}>
                <ActivityIndicator color={COLORS.PRIMARY} />
              </View>
            ) : (
              <>
                <View style={styles.providerPickerForm}>
                  <View style={styles.providerPickerField}>
                    <Text style={styles.providerPickerLabel}>Provider name</Text>
                    <TextInput
                      value={manualProviderName}
                      onChangeText={setManualProviderName}
                      style={styles.providerPickerInput}
                      autoCorrect={false}
                      autoFocus
                    />
                  </View>
                  <View style={styles.providerPickerField}>
                    <Text style={styles.providerPickerLabel}>Specialty</Text>
                    <TextInput
                      value={manualProviderSpecialty}
                      onChangeText={setManualProviderSpecialty}
                      style={styles.providerPickerInput}
                      autoCorrect={false}
                    />
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.providerPickerSaveButton,
                      !manualProviderName.trim() || savingManualProvider
                        ? styles.providerPickerSaveButtonDisabled
                        : undefined,
                    ]}
                    onPress={handleManualProviderSubmit}
                    disabled={!manualProviderName.trim() || savingManualProvider}
                  >
                    {savingManualProvider ? (
                      <ActivityIndicator size="small" color={COLORS.WHITE} />
                    ) : (
                      <Text style={styles.providerPickerSaveLabel}>Save & Assign</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {providersError ? (
                  <Text style={styles.providerPickerError}>{providersError}</Text>
                ) : null}

                <View style={styles.providerPickerDivider} />

                <Text style={styles.providerPickerListLabel}>Saved providers</Text>

                <ScrollView
                  style={styles.providerPickerList}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {providers.length === 0 ? (
                    <Text style={styles.providerPickerEmpty}>No providers saved yet.</Text>
                  ) : (
                    <View style={styles.providerChipRow}>
                      {providers.map((provider) => {
                        const isSaving = updatingProvider && visit?.providerId === provider.id;
                        return (
                          <TouchableOpacity
                            key={provider.id}
                            style={styles.providerChip}
                            onPress={() => handleSelectProvider(provider.id)}
                            disabled={Boolean(isSaving)}
                          >
                            <View style={styles.providerChipDetails}>
                              <Text style={styles.providerChipName}>{provider.name}</Text>
                              {provider.specialty ? (
                                <Text style={styles.providerChipMeta}>{provider.specialty}</Text>
                              ) : null}
                            </View>
                            {isSaving ? (
                              <ActivityIndicator size="small" color={COLORS.PRIMARY} />
                            ) : (
                              <Text style={styles.providerChipAction}>Assign</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Folder Picker Modal */}
      <Modal
        visible={showFolderPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFolderPicker(false)}
      >
        <View style={styles.providerPickerContainer}>
          <Pressable
            style={styles.providerPickerBackdrop}
            onPress={() => setShowFolderPicker(false)}
          />
          <View style={styles.providerPickerSheet}>
            <View style={styles.providerPickerHeader}>
              <Text style={styles.providerPickerTitle}>Move to Folder</Text>
              <TouchableOpacity onPress={() => setShowFolderPicker(false)}>
                <Text style={styles.providerPickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {loadingFolders ? (
              <View style={styles.providerPickerLoading}>
                <ActivityIndicator color={COLORS.PRIMARY} />
              </View>
            ) : (
              <>
                {visit?.folder && (
                  <TouchableOpacity
                    style={styles.removeFromFolderButton}
                    onPress={() => handleSelectFolder(null)}
                    disabled={updatingFolder}
                  >
                    <Text style={styles.removeFromFolderText}>Remove from folder</Text>
                  </TouchableOpacity>
                )}

                <Text style={styles.providerPickerListLabel}>Select a folder</Text>

                <ScrollView style={styles.providerPickerList}>
                  {folders.length === 0 ? (
                    <Text style={styles.providerPickerEmpty}>
                      No folders yet. Create one in the Folders tab.
                    </Text>
                  ) : (
                    <View style={styles.folderListContainer}>
                      {folders.map((folder) => (
                        <TouchableOpacity
                          key={folder.id}
                          style={[
                            styles.folderItem,
                            visit?.folder?.id === folder.id && styles.folderItemActive,
                          ]}
                          onPress={() => handleSelectFolder(folder.id)}
                          disabled={updatingFolder}
                        >
                          <View style={styles.folderItemLeft}>
                            <View
                              style={[
                                styles.folderItemColor,
                                { backgroundColor: folder.color || COLORS.PRIMARY },
                              ]}
                            />
                            <Text style={styles.folderItemName}>{folder.name}</Text>
                          </View>
                          {visit?.folder?.id === folder.id && (
                            <Text style={styles.folderItemCheck}>✓</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Tag Manager Modal */}
      <Modal
        visible={showTagManager}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTagManager(false)}
      >
        <View style={styles.providerPickerContainer}>
          <Pressable
            style={styles.providerPickerBackdrop}
            onPress={() => setShowTagManager(false)}
          />
          <View style={styles.providerPickerSheet}>
            <View style={styles.providerPickerHeader}>
              <Text style={styles.providerPickerTitle}>Manage Tags</Text>
              <TouchableOpacity onPress={() => setShowTagManager(false)}>
                <Text style={styles.providerPickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.tagManagerContent}>
              <Text style={styles.providerPickerListLabel}>Add or remove tags</Text>
              <TagInput
                existingTags={existingTags}
                selectedTags={visitTags}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
                placeholder="Type a tag name..."
                maxTags={10}
              />
            </View>

            <TouchableOpacity
              style={styles.tagManagerDoneButton}
              onPress={() => setShowTagManager(false)}
            >
              <Text style={styles.tagManagerDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.MD,
  },
  loadingText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  container: {
    flex: 1,
    padding: SIZES.PADDING,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.MD,
  },
  backButton: {
    paddingVertical: SIZES.XS,
  },
  backLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.MD,
    color: COLORS.SECONDARY,
  },
  deleteButton: {
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.XS,
  },
  deleteButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.DANGER,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SIZES.PADDING,
    paddingBottom: SIZES.XXL,
    gap: SIZES.LG,
  },
  titleSection: {
    marginBottom: SIZES.MD,
  },
  title: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.DISPLAY,
    color: COLORS.PRIMARY,
    marginBottom: SIZES.XS,
  },
  statusBadge: {
    paddingHorizontal: SIZES.SM,
    paddingVertical: 4,
    borderRadius: SIZES.BORDER_RADIUS,
    alignSelf: 'flex-start',
    marginTop: SIZES.XS,
  },
  statusText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XS,
    textTransform: 'capitalize',
  },
  summaryHighlightCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    marginBottom: SIZES.LG,
    gap: SIZES.SM,
    ...SIZES.SHADOW.MEDIUM,
  },
  summaryHighlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.SM,
  },
  summaryHighlightTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  summaryHighlightText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    lineHeight: 22,
  },
  summaryKeyPoints: {
    gap: SIZES.XS,
  },
  summaryKeyPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.XS,
  },
  summaryKeyPointBullet: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    marginTop: 2,
  },
  summaryKeyPointText: {
    flex: 1,
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  summaryKeyPointMore: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
    marginTop: SIZES.XS,
  },
  summaryHighlightEmpty: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    ...SIZES.SHADOW.LIGHT,
    gap: SIZES.MD,
  },
  cardTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.XS,
  },
  cardSubtitle: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.XS,
    color: COLORS.SECONDARY,
    marginTop: 2,
    marginBottom: SIZES.SM,
  },
  discussedConditionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.XS,
  },
  conditionChip: {
    backgroundColor: COLORS.HEALTH.PALE_MINT,
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS - 2,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY + '30',
  },
  conditionChipText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  providerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  providerDetails: {
    flex: 1,
    gap: SIZES.XS,
  },
  providerName: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  providerSpecialty: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  providerPractice: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[500],
  },
  providerActions: {
    gap: SIZES.XS,
  },
  changeProviderButton: {
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
  },
  changeProviderText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
    textAlign: 'center',
  },
  removeProviderButton: {
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
  },
  removeProviderText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.DANGER,
    textAlign: 'center',
  },
  noProviderText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    marginBottom: SIZES.SM,
  },
  addProviderButton: {
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
    alignItems: 'center',
  },
  addProviderText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
    flex: 1,
  },
  infoValue: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    flex: 2,
    textAlign: 'right',
  },
  summaryText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    lineHeight: 22,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.SM,
    marginBottom: SIZES.SM,
  },
  actionItemBullet: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    marginTop: 2,
  },
  actionItemContent: {
    flex: 1,
    gap: SIZES.XS,
  },
  actionItemTitle: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    fontSize: SIZES.FONT.MD,
  },
  actionItemDetail: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    lineHeight: 20,
  },
  actionItemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.XS,
  },
  actionItemMetaText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
    fontSize: SIZES.FONT.SM,
  },
  medicationItem: {
    marginBottom: SIZES.SM,
    gap: SIZES.XS,
  },
  medicationName: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    fontSize: SIZES.FONT.MD,
  },
  medicationDetail: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    lineHeight: 20,
  },
  validationWarningContainer: {
    marginTop: SIZES.XS,
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    backgroundColor: '#FFF3CD',
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
    borderRadius: SIZES.BORDER_RADIUS,
  },
  validationWarningText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: '#856404',
    lineHeight: 18,
  },
  validationSuggestion: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: '#0066CC',
    marginTop: 4,
    lineHeight: 18,
  },
  brandNameInfoContainer: {
    marginTop: SIZES.XS,
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
    borderRadius: SIZES.BORDER_RADIUS,
  },
  brandNameInfoText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: '#0D47A1',
    lineHeight: 18,
  },
  interactionWarningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SIZES.XS,
    gap: SIZES.XS,
  },
  interactionWarningIcon: {
    fontSize: 24,
  },
  interactionWarningSubtitle: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.TEXT_SECONDARY,
    marginBottom: SIZES.SM,
  },
  disclaimerBox: {
    backgroundColor: '#FEF3C7',
    padding: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 2,
    borderColor: '#F59E0B',
    marginBottom: SIZES.MD,
  },
  disclaimerText: {
    fontFamily: FONTS.BOLD,
    fontSize: SIZES.FONT.SM,
    color: '#78350F',
    lineHeight: 20,
    textAlign: 'center',
  },
  interactionWarningCard: {
    backgroundColor: '#FFF7ED',
    padding: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    marginBottom: SIZES.SM,
    borderLeftWidth: 4,
  },
  interactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.SM,
  },
  severityBadge: {
    paddingHorizontal: SIZES.SM,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityBadgeText: {
    fontFamily: FONTS.BOLD,
    fontSize: SIZES.FONT.XS,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  interactionType: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.TEXT_SECONDARY,
  },
  interactionMedications: {
    fontFamily: FONTS.BOLD,
    fontSize: SIZES.FONT.LG,
    color: '#78350F',
    marginBottom: SIZES.XS,
  },
  interactionDrugClass: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: '#92400E',
    marginBottom: SIZES.SM,
    fontStyle: 'italic',
  },
  interactionDescription: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: '#78350F',
    lineHeight: 20,
    marginBottom: SIZES.MD,
  },
  interactionRecommendationBox: {
    backgroundColor: '#FFFFFF',
    padding: SIZES.SM,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  interactionRecommendationLabel: {
    fontFamily: FONTS.BOLD,
    fontSize: SIZES.FONT.SM,
    color: '#C2410C',
    marginBottom: SIZES.XS,
  },
  interactionRecommendation: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: '#C2410C',
    lineHeight: 20,
  },
  diagnosisItem: {
    marginBottom: SIZES.SM,
    gap: SIZES.XS,
  },
  diagnosisName: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    fontSize: SIZES.FONT.MD,
  },
  diagnosisDetail: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    lineHeight: 20,
  },
  transcriptText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    lineHeight: 22,
  },
  processingCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    ...SIZES.SHADOW.LIGHT,
    alignItems: 'center',
    gap: SIZES.MD,
  },
  processingText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.MD,
  },
  errorText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.DANGER,
    textAlign: 'center',
  },
  retryButton: {
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.PRIMARY,
  },
  retryButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  providerPickerContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  providerPickerBackdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    flex: 1,
  },
  providerPickerSheet: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderTopLeftRadius: SIZES.CARD_BORDER_RADIUS,
    borderTopRightRadius: SIZES.CARD_BORDER_RADIUS,
    maxHeight: '75%',
    paddingBottom: SIZES.XXL,
    paddingHorizontal: SIZES.PADDING,
    paddingTop: SIZES.LG,
    ...SIZES.SHADOW.MEDIUM,
  },
  providerPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.MD,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[200],
  },
  providerPickerTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  providerPickerClose: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.SECONDARY,
  },
  providerPickerForm: {
    gap: SIZES.SM,
    paddingBottom: SIZES.SM,
  },
  providerPickerField: {
    gap: SIZES.XS,
  },
  providerPickerLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
    fontSize: SIZES.FONT.SM,
  },
  providerPickerInput: {
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    backgroundColor: COLORS.WHITE,
  },
  providerPickerSaveButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.PRIMARY,
  },
  providerPickerSaveButtonDisabled: {
    backgroundColor: COLORS.GRAY[200],
  },
  providerPickerSaveLabel: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  providerPickerDivider: {
    height: 1,
    backgroundColor: COLORS.GRAY[100],
    marginVertical: SIZES.MD,
  },
  providerChipRow: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.GRAY[100],
    minWidth: '48%',
    gap: SIZES.SM,
  },
  providerChipDetails: {
    flex: 1,
    gap: 2,
  },
  providerChipName: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
  },
  providerChipMeta: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  providerChipAction: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  providerPickerError: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.DANGER,
  },
  providerPickerListLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  providerPickerEmpty: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    paddingVertical: SIZES.XS,
  },
  providerPickerLoading: {
    padding: SIZES.XL,
    alignItems: 'center',
  },
  providerPickerList: {
    maxHeight: 400,
  },
  providerPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.MD,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.GRAY[100],
  },
  providerPickerName: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  providerPickerSpecialty: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  providerPickerArrow: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  // Folder styles
  folderInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  folderDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
  },
  folderColor: {
    width: 20,
    height: 20,
    borderRadius: SIZES.BORDER_RADIUS - 2,
  },
  folderName: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  changeFolderButton: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
  },
  changeFolderText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  noFolderText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    marginBottom: SIZES.SM,
  },
  addFolderButton: {
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY,
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  addFolderText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  removeFromFolderButton: {
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.DANGER + '15',
    borderWidth: 1,
    borderColor: COLORS.DANGER,
    alignItems: 'center',
    marginBottom: SIZES.MD,
  },
  removeFromFolderText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.DANGER,
  },
  folderListContainer: {
    gap: SIZES.XS,
  },
  folderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.SM,
    paddingHorizontal: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.GRAY[50],
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
  },
  folderItemActive: {
    backgroundColor: COLORS.PRIMARY + '15',
    borderColor: COLORS.PRIMARY,
  },
  folderItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
  },
  folderItemColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  folderItemName: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
  },
  folderItemCheck: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  // Tag styles
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.SM,
  },
  manageTagsLink: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  noTagsText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  tagManagerContent: {
    gap: SIZES.MD,
    paddingBottom: SIZES.LG,
  },
  tagManagerDoneButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.SM + 2,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    marginTop: SIZES.MD,
  },
  tagManagerDoneText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
});

export default VisitDetail;
