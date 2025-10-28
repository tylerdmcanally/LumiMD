import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
// Using legacy API to maintain compatibility with existing code
// TODO: Migrate to new File/Directory API in future update
import * as FileSystem from 'expo-file-system/legacy';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import { ERROR_MESSAGES } from '@/shared/constants/ErrorMessages';
import { createProvider, listProviders, Provider } from '@/shared/services/api/providers';
import {
  getVisitSummary,
  submitVisitRecording,
  updateVisit,
  Visit,
  VisitSubmissionRequest,
} from '@/shared/services/api/visits';
import { ConsentRequirements, ConsentService } from '@/shared/services/ConsentService';
import { LocalStorageService, PendingUpload } from '@/shared/services/LocalStorageService';
import { LocationCoordinates, LocationService } from '@/shared/services/LocationService';

interface VisitRecorderProps {
  onCancel: () => void;
  onFinished: (visitId?: string) => void;
  onEndVisit?: (visitId?: string) => void;
}

const MAX_SUMMARY_ATTEMPTS = 6;
const SUMMARY_POLL_INTERVAL_MS = 4000;

const formatDuration = (millis?: number) => {
  if (!millis || Number.isNaN(millis)) {
    return '00:00';
  }

  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const VisitRecorder: React.FC<VisitRecorderProps> = ({ onCancel, onFinished, onEndVisit }) => {
  const recordingRef = useRef<Audio.Recording | null>(null);

  const [currentVisit, setCurrentVisit] = useState<Visit | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<Audio.RecordingStatus | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [consentRequirements, setConsentRequirements] = useState<ConsentRequirements | null>(null);
  const [userConsented, setUserConsented] = useState(false);
  const [additionalConsented, setAdditionalConsented] = useState(false);
  const [isLoadingConsent, setIsLoadingConsent] = useState(true);
  const [locationLabel, setLocationLabel] = useState<string>('Determining location...');
  const [currentCoordinates, setCurrentCoordinates] = useState<LocationCoordinates | null>(null);
  const [taggingVisit, setTaggingVisit] = useState<Visit | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [isUpdatingProvider, setIsUpdatingProvider] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [manualProviderName, setManualProviderName] = useState('');
  const [manualProviderSpecialty, setManualProviderSpecialty] = useState('');
  const [visitSummary, setVisitSummary] = useState<any | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryPending, setSummaryPending] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [workflowStep, setWorkflowStep] = useState<'consent' | 'record'>('consent');
  const [isAdvancingToRecorder, setIsAdvancingToRecorder] = useState(false);
  const [timerDuration, setTimerDuration] = useState(0);
  const [_pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [_currentPendingUploadId, setCurrentPendingUploadId] = useState<string | null>(null);
  const summaryAttemptsRef = useRef(0);
  const summaryPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSummaryPolling = useCallback(() => {
    if (summaryPollTimeoutRef.current) {
      clearTimeout(summaryPollTimeoutRef.current);
      summaryPollTimeoutRef.current = null;
    }
  }, []);

  const isRecording = !!recordingStatus?.isRecording;
  const consentSatisfied =
    userConsented && (!consentRequirements?.requiresAdditionalConsent || additionalConsented);

  useEffect(() => {
    const initialize = async () => {
      setIsRequestingPermission(true);
      
      // Initialize local storage
      await LocalStorageService.init();
      
      // Load pending uploads
      const pending = await LocalStorageService.getPendingUploads();
      setPendingUploads(pending);
      console.log(`📥 Loaded ${pending.length} pending uploads`);
      
      // Request microphone permission
      const permission = await Audio.requestPermissionsAsync();
      setHasPermission(permission.status === 'granted');
      if (permission.status !== 'granted') {
        setError(ERROR_MESSAGES.PERMISSION_MICROPHONE.message);
      }
      
      setIsRequestingPermission(false);
    };

    initialize();

    return () => {
      const cleanup = async () => {
        try {
          if (recordingRef.current) {
            await recordingRef.current.stopAndUnloadAsync();
          }
        } catch {
          // Ignore cleanup errors
        }
        recordingRef.current = null;
      };

      cleanup();
    };
  }, []);

  const resetRecordedFile = useCallback(async () => {
    if (recordedUri) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(recordedUri);
        if (fileInfo.exists) {
          await FileSystem.deleteAsync(recordedUri, { idempotent: true });
        }
      } catch {
        // Ignore cleanup errors
      } finally {
        setRecordedUri(null);
        setIsPaused(false);
        setStatusMessage(null);
        setTimerDuration(0);
      }
    }
  }, [recordedUri]);

  const loadConsentRequirements = useCallback(async () => {
    setIsLoadingConsent(true);
    try {
      const coordinates = await LocationService.getCurrentLocation();
      setCurrentCoordinates(coordinates ?? null);
      if (coordinates) {
        const locationInfo = await LocationService.reverseGeocode(coordinates);
        if (locationInfo?.city && locationInfo.state) {
          setLocationLabel(`${locationInfo.city}, ${locationInfo.state}`);
        } else if (locationInfo?.state) {
          setLocationLabel(locationInfo.state);
        }
      }

      const requirements = await ConsentService.getConsentRequirements();
      setConsentRequirements(requirements);

      if (!requirements.stateName || requirements.stateName === 'Unknown Location') {
        setLocationLabel('Location unavailable');
      }
    } catch (err) {
      console.error('Failed to load consent requirements', err);
      setLocationLabel('Location unavailable');
      setConsentRequirements(await ConsentService.getConsentRequirements());
      setCurrentCoordinates(null);
    } finally {
      setIsLoadingConsent(false);
    }
  }, []);

  useEffect(() => {
    loadConsentRequirements();
  }, [loadConsentRequirements]);

  const loadProviders = useCallback(async () => {
    setProvidersLoading(true);
    try {
      const data = await listProviders();
      setProviders(data.filter((provider) => provider.name && provider.name.trim().length > 0 && provider.notes !== 'SYSTEM_PLACEHOLDER_PROVIDER'));
      setProvidersError(null);
    } catch (err: any) {
      console.error('Failed to load providers', err);
      setProvidersError(err?.response?.data?.error?.message ?? 'Unable to load providers');
    } finally {
      setProvidersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (taggingVisit) {
      setManualProviderName(taggingVisit.provider?.name ?? '');
      setManualProviderSpecialty(taggingVisit.provider?.specialty ?? '');
      if (providers.length === 0 && !providersLoading) {
        loadProviders();
      }
    } else {
      setManualProviderName('');
      setManualProviderSpecialty('');
    }
  }, [taggingVisit, loadProviders, providers.length, providersLoading]);

  useEffect(() => {
    if (workflowStep === 'consent' && consentSatisfied && !isLoadingConsent) {
      setIsAdvancingToRecorder(true);
      const timeout = setTimeout(() => {
        setWorkflowStep('record');
        setStatusMessage('Consent captured. Tap "Start Recording" when you\'re ready.');
        setIsAdvancingToRecorder(false);
      }, 600);

      return () => {
        clearTimeout(timeout);
        setIsAdvancingToRecorder(false);
      };
    }
  }, [consentSatisfied, isLoadingConsent, workflowStep]);

  const fetchVisitSummary = useCallback(async (visitId: string) => {
    try {
      setSummaryError(null);
      setSummaryLoading(true);
      const data = await getVisitSummary(visitId);
      setVisitSummary(data.summary);
      setSummaryLoading(false);
      setSummaryPending(false);
      setStatusMessage("Visit summary ready. Tap \"End Visit\" when you're finished.");
      clearSummaryPolling();
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      if (status === 404 && summaryAttemptsRef.current < MAX_SUMMARY_ATTEMPTS) {
        summaryAttemptsRef.current += 1;
        setSummaryLoading(false);
        setSummaryPending(true);
        setStatusMessage('Processing your visit summary... we\'ll refresh automatically.');
        summaryPollTimeoutRef.current = setTimeout(() => fetchVisitSummary(visitId), SUMMARY_POLL_INTERVAL_MS);
      } else {
        setSummaryLoading(false);
        setSummaryPending(false);
        setSummaryError('Summary unavailable right now. You can check visit history later.');
        clearSummaryPolling();
      }
    }
  }, [clearSummaryPolling]);

  useEffect(() => {
    if (!currentVisit?.id) {
      summaryAttemptsRef.current = 0;
      setVisitSummary(null);
      setSummaryLoading(false);
      setSummaryPending(false);
      setSummaryError(null);
      clearSummaryPolling();
      return;
    }

    summaryAttemptsRef.current = 0;
    setVisitSummary(null);
    setSummaryError(null);
    setSummaryPending(true);
    setSummaryLoading(true);
    fetchVisitSummary(currentVisit.id);

    return () => {
      clearSummaryPolling();
    };
  }, [currentVisit?.id, clearSummaryPolling, fetchVisitSummary]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
            setTimerDuration(0);

      if (workflowStep === 'consent') {
        setWorkflowStep('record');
      }

      if (isUploading || isRecording) {
        return;
      }

      if (!hasPermission) {
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
          setError(ERROR_MESSAGES.PERMISSION_MICROPHONE.message);
          return;
        }
        setHasPermission(true);
      }

      await resetRecordedFile();
      setCurrentVisit(null);
      setTaggingVisit(null);
      setStatusMessage(null);
      setVisitSummary(null);
      setSummaryError(null);
      setSummaryPending(false);
      setSummaryLoading(false);
      clearSummaryPolling();
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        interruptionModeIOS: InterruptionModeIOS.DoNotMix,
        shouldDuckAndroid: true,
        interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        (status) => {
          setRecordingStatus(status);
          if (typeof status.durationMillis === 'number') {
            setTimerDuration(status.durationMillis);
          }
        }
      );

      recordingRef.current = recording;
      setIsPaused(false);
    } catch (err: any) {
      console.error('Failed to start recording', err);
      setError(ERROR_MESSAGES.RECORDING_FAILED.message);
    }
  }, [
    clearSummaryPolling,
    hasPermission,
    isRecording,
    isUploading,
    resetRecordedFile,
    workflowStep,
  ]);

  const stopRecording = useCallback(async () => {
    if (!recordingRef.current) {
      return;
    }

    try {
      try {
        const status = await recordingRef.current.getStatusAsync();
        if (status && typeof status.durationMillis === 'number') {
          setTimerDuration(status.durationMillis);
        }
      } catch {
        // Ignore status fetch errors before stopping
      }
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      setRecordedUri(uri ?? null);
    } catch (err: any) {
      console.error('Failed to stop recording', err);
      setError(err?.message ?? 'Unable to stop recording. Please try again.');
    } finally {
      recordingRef.current = null;
      setRecordingStatus(null);
      setIsPaused(false);
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });
    }
  }, []);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current || isPaused) {
      return;
    }

    try {
      await recordingRef.current.pauseAsync();
      const status = await recordingRef.current.getStatusAsync();
      setRecordingStatus(status as Audio.RecordingStatus);
      setIsPaused(true);
    } catch (err: any) {
      console.error('Failed to pause recording', err);
      setError(err?.message ?? 'Unable to pause recording.');
    }
  }, [isPaused]);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current || !isPaused) {
      return;
    }

    try {
      await recordingRef.current.startAsync();
      const status = await recordingRef.current.getStatusAsync();
      setRecordingStatus(status as Audio.RecordingStatus);
      setIsPaused(false);
    } catch (err: any) {
      console.error('Failed to resume recording', err);
      setError(err?.message ?? 'Unable to resume recording.');
    }
  }, [isPaused]);

  const uploadRecording = useCallback(async (pendingUploadId?: string) => {
    // If retrying a pending upload, load that recording
    let uriToUpload = recordedUri;
    let visitData: any;
    let savedPendingId: string | null | undefined = pendingUploadId;
    
    if (pendingUploadId) {
      const pending = await LocalStorageService.getPendingUploads();
      const upload = pending.find(u => u.id === pendingUploadId);
      if (upload) {
        uriToUpload = upload.localAudioUri;
        visitData = upload.visitData;
        console.log('🔄 Retrying pending upload:', pendingUploadId);
      } else {
        setError('Could not find pending upload to retry.');
        return;
      }
    }
    
    if (!uriToUpload) {
      setError('Please record audio before uploading.');
      return;
    }

    if (!pendingUploadId && (!userConsented || (consentRequirements?.requiresAdditionalConsent && !additionalConsented))) {
      setError('Please confirm required consent before uploading.');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      
      const submissionPayload: VisitSubmissionRequest = visitData || {
        visitDate: new Date().toISOString(),
        visitType: 'IN_PERSON',
        consent: {
          userConsented,
          additionalPartyConsented: consentRequirements?.requiresAdditionalConsent
            ? additionalConsented
            : undefined,
          stateName: consentRequirements?.stateName,
        },
        location: currentCoordinates ?? undefined,
      };

      // Save locally FIRST if this is a new recording (not a retry)
      if (!pendingUploadId) {
        try {
          const localData = {
            visitDate: submissionPayload.visitDate || new Date().toISOString(),
            visitType: submissionPayload.visitType || 'IN_PERSON',
            consent: submissionPayload.consent,
            location: submissionPayload.location,
          };
          savedPendingId = await LocalStorageService.saveRecordingLocally(uriToUpload, localData);
          setCurrentPendingUploadId(savedPendingId);
          
          // Refresh pending uploads list
          const pending = await LocalStorageService.getPendingUploads();
          setPendingUploads(pending);
          
          console.log('💾 Recording saved locally before upload:', savedPendingId);
        } catch (saveError) {
          console.error('❌ Failed to save recording locally:', saveError);
          // Continue with upload even if local save fails
        }
      }

      // Attempt upload
      const updatedVisit = await submitVisitRecording(uriToUpload, submissionPayload);

      // Upload successful - remove from pending
      if (savedPendingId) {
        await LocalStorageService.removePendingUpload(savedPendingId);
        setCurrentPendingUploadId(null);
        
        // Refresh pending uploads list
        const pending = await LocalStorageService.getPendingUploads();
        setPendingUploads(pending);
        
        console.log('✅ Removed from pending after successful upload');
      }

      summaryAttemptsRef.current = 0;
      setVisitSummary(null);
      setSummaryError(null);
      setSummaryPending(true);
      setSummaryLoading(true);
      clearSummaryPolling();

      setCurrentVisit(updatedVisit);
      setTaggingVisit(updatedVisit);
      setStatusMessage('Audio uploaded. Processing your visit summary - assign a provider while we finish.');
      
      if (!pendingUploadId) {
        await resetRecordedFile();
      }
    } catch (err: any) {
      console.error('Failed to upload audio', err);
      setSummaryLoading(false);
      setSummaryPending(false);
      clearSummaryPolling();
      
      // Check for network errors
      const isNetworkError = !err?.response || err?.code === 'ERR_NETWORK' || err?.message?.includes('Network');
      const errorMsg = isNetworkError 
        ? ERROR_MESSAGES.UPLOAD_NETWORK.message 
        : ERROR_MESSAGES.UPLOAD_FAILED.message;
      
      // If this was a new recording that we saved locally, update its error message
      if (savedPendingId && !pendingUploadId) {
        await LocalStorageService.updatePendingUpload(savedPendingId, {
          lastError: errorMsg,
          retryCount: 1,
        });
        
        // Refresh pending uploads list
        const pending = await LocalStorageService.getPendingUploads();
        setPendingUploads(pending);
        
        setError(`${errorMsg} Your recording is saved and you can retry from the home screen.`);
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsUploading(false);
    }
  }, [
    additionalConsented,
    consentRequirements?.requiresAdditionalConsent,
    consentRequirements?.stateName,
    currentCoordinates,
    recordedUri,
    resetRecordedFile,
    clearSummaryPolling,
    userConsented,
  ]);

  const handleSelectProvider = useCallback(
    async (providerId: string) => {
      if (!taggingVisit) {
        return;
      }

      if (isUpdatingProvider === providerId) {
        return;
      }

      try {
        setIsUpdatingProvider(providerId);
        setProvidersError(null);

        if (providerId !== taggingVisit.providerId) {
          const updatedVisit = await updateVisit(taggingVisit.id, { providerId });
          setCurrentVisit(updatedVisit);
        }

        setTaggingVisit(null);

        const provider = providers.find((p) => p.id === providerId);
        if (provider) {
          setStatusMessage(
            `Provider assigned: ${provider.name}. Click "End Visit" when ready.`
          );
          setManualProviderName(provider.name);
          setManualProviderSpecialty(provider.specialty ?? '');
        } else {
          setStatusMessage('Provider assigned. Click "End Visit" when ready.');
          setManualProviderName('');
          setManualProviderSpecialty('');
        }
      } catch (err: any) {
        console.error('Failed to update visit provider', err);
        setProvidersError(err?.response?.data?.error?.message ?? 'Unable to update provider');
      } finally {
        setIsUpdatingProvider(null);
      }
    },
    [isUpdatingProvider, providers, taggingVisit, onEndVisit]
  );

  const handleManualProviderSubmit = useCallback(async () => {
    if (!taggingVisit) {
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
      setManualProviderSpecialty(existingProvider.specialty ?? '');
      return;
    }

    try {
      setIsUpdatingProvider('manual');
      setProvidersError(null);

      // Save visit ID before clearing state
      const visitId = taggingVisit.id;

      const newProvider = await createProvider({
        name: trimmedName,
        specialty: manualProviderSpecialty.trim(),
      });

      setProviders((prev) => [...prev, newProvider]);

      const updatedVisit = await updateVisit(visitId, { providerId: newProvider.id });
      setCurrentVisit(updatedVisit);
      setTaggingVisit(null);
      setStatusMessage(
        `Visit tagged with ${newProvider.name}. Click "End Visit" when ready.`
      );
      setManualProviderName('');
      setManualProviderSpecialty('');
    } catch (err: any) {
      console.error('Failed to update visit provider manually', err);
      setProvidersError(err?.response?.data?.error?.message ?? 'Unable to update provider');
    } finally {
      setIsUpdatingProvider(null);
    }
  }, [
    handleSelectProvider,
    manualProviderName,
    manualProviderSpecialty,
    providers,
    taggingVisit,
    onEndVisit,
  ]);

  const handleSkipTagging = useCallback(() => {
    // Close the tagging modal - the "End Visit" button will now be visible
    setTaggingVisit(null);
    setManualProviderName('');
    setManualProviderSpecialty('');
    setProvidersError(null);
    setStatusMessage('Visit saved. Click "End Visit" to return home.');
  }, []);

  const handleViewVisitDetails = useCallback(() => {
    if (currentVisit?.id) {
      onFinished(currentVisit.id);
    } else {
      onFinished();
    }
  }, [currentVisit?.id, onFinished]);

  const handleEndVisit = useCallback(() => {
    if (isUpdatingProvider) {
      return;
    }

    // Just go back - same as cancel button
    onCancel();
  }, [
    isUpdatingProvider,
    onCancel,
  ]);

  const handlePrimaryAction = () => {
    if (isRecording || isPaused) {
      stopRecording();
      return;
    }

    if (!consentSatisfied) {
      setError('Please confirm required consent before recording.');
      return;
    }

    startRecording();
  };

  const primaryLabel = useMemo(() => {
    if (isRecording || isPaused) {
      return 'Stop Recording';
    }
    if (recordedUri) {
      return 'Record Again';
    }
    if (!consentSatisfied) {
      return hasPermission === false ? 'Enable Microphone' : 'Confirm Consent';
    }
    return hasPermission === false ? 'Enable Microphone' : 'Start Recording';
  }, [consentSatisfied, hasPermission, isPaused, isRecording, recordedUri]);

  const disablePrimaryButton =
    isUploading ||
    isRequestingPermission ||
    Boolean(taggingVisit) ||
    (!consentSatisfied && !isRecording && !isPaused && !recordedUri);

  const providerName = currentVisit?.provider?.name ?? '';
  const providerSpecialty = currentVisit?.provider?.specialty ?? '';
  const showRecordingControls = !currentVisit;
  const matchingProviders = useMemo(() => {
    const term = manualProviderName.trim().toLowerCase();
    if (!term) {
      return [];
    }
    return providers.filter((provider) => provider.name.toLowerCase().includes(term));
  }, [manualProviderName, providers]);
  

  if (workflowStep === 'consent') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          <View style={styles.topRow}>
            <TouchableOpacity
              onPress={() => {
                                onCancel();
              }}
              style={styles.backButton}
            >
              <Text style={styles.backLabel}>← Back</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.heading}>Recording Consent</Text>
          <Text style={styles.consentIntro}>
            Before we capture this visit, confirm recording is allowed where you are.
          </Text>

          <View style={styles.consentCard}>
            <Text style={styles.sectionTitle}>Location & requirements</Text>
            <Text style={styles.sectionSubtitle}>{locationLabel}</Text>
            {consentRequirements ? (
              <>
                <Text style={styles.consentMessage}>{consentRequirements.consentMessage}</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>I understand and consent to recording this visit.</Text>
                  <Switch
                    value={userConsented}
                    onValueChange={setUserConsented}
                    thumbColor={userConsented ? COLORS.PRIMARY : COLORS.GRAY[300]}
                  />
                </View>
                {consentRequirements.requiresAdditionalConsent ? (
                  <View style={styles.additionalConsent}>
                    <Text style={styles.additionalConsentText}>
                      {"This state requires your provider to consent to recording. Confirm they've agreed before proceeding."}
                    </Text>
                    <View style={styles.switchRow}>
                      <Text style={styles.switchLabel}>My provider has consented.</Text>
                      <Switch
                        value={additionalConsented}
                        onValueChange={setAdditionalConsented}
                        thumbColor={additionalConsented ? COLORS.PRIMARY : COLORS.GRAY[300]}
                      />
                    </View>
                  </View>
                ) : null}
                <Text style={styles.legalNote}>{consentRequirements.legalNote}</Text>
              </>
            ) : (
              <Text style={styles.consentMessage}>Determining consent requirements for your location...</Text>
            )}
          </View>

          {isAdvancingToRecorder ? (
            <View style={styles.advanceNotice}>
              <ActivityIndicator color={COLORS.PRIMARY} />
              <Text style={styles.advanceNoticeText}>Consent confirmed. Opening recorder...</Text>
            </View>
          ) : (
            <Text style={styles.consentFooterText}>
              {consentSatisfied
                ? 'Great - that\'s all we need. The recorder will open automatically.'
                : 'Toggle the switches above to confirm consent.'}
            </Text>
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            disabled={isLoadingConsent}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.topRow}>
          <TouchableOpacity
            onPress={onCancel}
            style={styles.backButton}
          >
            <Text style={styles.backLabel}>← Back</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.heading}>Visit Recorder</Text>
        {providerName ? (
          <Text style={styles.providerName} numberOfLines={1}>
            {providerName}
          </Text>
        ) : null}
        {providerSpecialty ? (
          <Text style={styles.providerDetail} numberOfLines={1}>
            {providerSpecialty}
          </Text>
        ) : null}
        <Text style={styles.consentConfirmation}>
          Recording consent captured{locationLabel ? ` · ${locationLabel}` : ''}
        </Text>

        <View style={styles.recorderCard}>
          {showRecordingControls ? (
            <Text style={styles.timer}>
              {isRecording ? '● ' : ''}
              {formatDuration(timerDuration)}
            </Text>
          ) : null}
          <Text style={styles.statusText}>
            {statusMessage
              ? statusMessage
              : isRequestingPermission
              ? 'Requesting microphone access...'
              : isRecording
              ? 'Recording in progress...'
              : isPaused
              ? 'Recording paused.'
              : recordedUri
              ? 'Recording ready to upload.'
              : 'Tap \"Start Recording\" when you\'re ready.'}
          </Text>

          {showRecordingControls ? (
            <TouchableOpacity
              style={[
                styles.primaryButton,
                isRecording ? styles.primaryButtonActive : undefined,
                !isRecording && recordedUri ? styles.primaryButtonSecondary : undefined,
                disablePrimaryButton ? styles.primaryButtonDisabled : undefined,
              ]}
              onPress={handlePrimaryAction}
              disabled={disablePrimaryButton}
            >
              <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
            </TouchableOpacity>
          ) : null}

          {(isRecording || isPaused) && (
            <TouchableOpacity
              style={styles.pauseButton}
              onPress={isPaused ? resumeRecording : pauseRecording}
              disabled={isUploading}
            >
              <Text style={styles.pauseButtonText}>{isPaused ? 'Resume Recording' : 'Pause Recording'}</Text>
            </TouchableOpacity>
          )}

          {showRecordingControls && recordedUri ? (
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => uploadRecording()}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color={COLORS.WHITE} />
              ) : (
                <Text style={styles.uploadButtonText}>Upload Recording</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        {currentVisit ? (
          <View style={styles.postRecordingCard}>
            <View style={styles.postHeader}>
              <Text style={styles.sectionTitle}>Visit wrap-up</Text>
              {(summaryLoading || summaryPending) && <ActivityIndicator size="small" color={COLORS.PRIMARY} />}
            </View>

            <View style={styles.postProviderRow}>
              <View>
                <Text style={styles.postProviderLabel}>Provider</Text>
                <Text style={styles.postProviderValue} numberOfLines={1}>
                  {currentVisit.provider?.name ?? 'Not assigned'}
                </Text>
                {currentVisit.provider?.specialty ? (
                  <Text style={styles.postProviderMeta} numberOfLines={1}>
                    {currentVisit.provider.specialty}
                  </Text>
                ) : null}
              </View>
              {(!taggingVisit || taggingVisit.id !== currentVisit.id) ? (
                <TouchableOpacity
                  style={styles.postProviderButton}
                  onPress={() => {
                    setManualProviderName(currentVisit.provider?.name ?? '');
                    setManualProviderSpecialty(currentVisit.provider?.specialty ?? '');
                    setTaggingVisit(currentVisit);
                  }}
                >
                  <Text style={styles.postProviderButtonText}>
                    {currentVisit.provider ? 'Change' : 'Assign'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {visitSummary ? (
              <>
                {visitSummary.overview ? (
                  <Text style={styles.summaryOverview}>{visitSummary.overview}</Text>
                ) : null}

                {Array.isArray(visitSummary.keyPoints) && visitSummary.keyPoints.length > 0 ? (
                  <View style={styles.keyPointsSection}>
                    <Text style={styles.keyPointsTitle}>Key points</Text>
                    {visitSummary.keyPoints.map((point: string, index: number) => (
                      <View key={index} style={styles.keyPointRow}>
                        <Text style={styles.keyPointBullet}>•</Text>
                        <Text style={styles.keyPointText}>{point}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {!visitSummary.overview &&
                (!Array.isArray(visitSummary.keyPoints) || visitSummary.keyPoints.length === 0) ? (
                  <Text style={styles.summaryStatusText}>
                    Summary ready. Open the full visit for more details.
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.summaryStatusText}>
                {summaryError
                  ? summaryError
                  : 'Hang tight - your visit summary is being prepared. You can leave this screen at any time.'}
              </Text>
            )}

            {!taggingVisit && (
              <View style={styles.postActionRow}>
                <TouchableOpacity
                  style={[styles.postActionButton, styles.secondaryActionButton]}
                  onPress={handleViewVisitDetails}
                >
                  <Text style={styles.postActionButtonLabel}>View full visit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.postActionButton,
                    styles.primaryActionButton,
                    Boolean(isUpdatingProvider)
                      ? styles.primaryActionButtonDisabled
                      : undefined,
                  ]}
                  onPress={handleEndVisit}
                  disabled={Boolean(isUpdatingProvider)}
                >
                  <Text style={styles.primaryActionText}>End Visit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null}

      {taggingVisit ? (
        <View style={styles.taggingCard}>
          <Text style={styles.sectionTitle}>Tag this visit</Text>
          <Text style={styles.sectionSubtitle}>Add a provider (optional).</Text>

          {providersLoading ? (
            <View style={styles.providerLoader}>
              <ActivityIndicator color={COLORS.PRIMARY} />
            </View>
          ) : null}

          <View style={styles.manualProviderRow}>
            <View style={styles.manualProviderInputs}>
              <View style={styles.manualProviderField}>
                <Text style={styles.manualProviderLabel}>Provider name</Text>
                <TextInput
                  value={manualProviderName}
                  onChangeText={setManualProviderName}
                  style={styles.manualProviderInput}
                  autoCorrect={false}
                  autoFocus
                />
              </View>
              <View style={styles.manualProviderField}>
                <Text style={styles.manualProviderLabel}>Specialty</Text>
                <TextInput
                  value={manualProviderSpecialty}
                  onChangeText={setManualProviderSpecialty}
                  style={[styles.manualProviderInput, styles.manualProviderSecondaryInput]}
                  autoCorrect={false}
                />
              </View>
            </View>
          </View>

          <View style={styles.manualProviderActions}>
            <TouchableOpacity
              style={[
                styles.manualProviderButton,
                !manualProviderName.trim() ? styles.manualProviderButtonDisabled : undefined,
              ]}
              onPress={handleManualProviderSubmit}
              disabled={!manualProviderName.trim() || isUpdatingProvider === 'manual'}
            >
              {isUpdatingProvider === 'manual' ? (
                <ActivityIndicator
                  size="small"
                  color={manualProviderName.trim() ? COLORS.WHITE : COLORS.SECONDARY}
                />
              ) : (
                <Text
                  style={[
                    styles.manualProviderButtonText,
                    !manualProviderName.trim() ? styles.manualProviderButtonTextDisabled : undefined,
                  ]}
                >
                  Save
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {matchingProviders.length > 0 ? (
            <View style={styles.manualProviderSuggestions}>
              {matchingProviders.slice(0, 5).map((provider) => {
                const isSaving = isUpdatingProvider === provider.id;
                return (
                  <TouchableOpacity
                    key={provider.id}
                    style={styles.manualProviderSuggestion}
                    onPress={() => handleSelectProvider(provider.id)}
                    disabled={Boolean(isSaving)}
                  >
                    <View>
                      <Text style={styles.manualProviderSuggestionName}>{provider.name}</Text>
                      {provider.specialty ? (
                        <Text style={styles.manualProviderSuggestionMeta}>{provider.specialty}</Text>
                      ) : null}
                    </View>
                    {isSaving ? (
                      <ActivityIndicator size="small" color={COLORS.PRIMARY} />
                    ) : (
                      <Text style={styles.manualProviderSuggestionAction}>Assign</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {providersError ? <Text style={styles.errorText}>{providersError}</Text> : null}

          <TouchableOpacity style={styles.skipButton} onPress={handleSkipTagging}>
            <Text style={styles.skipButtonLabel}>Skip</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.cancelButton}
        onPress={() => {
                    resetRecordedFile().finally(onCancel);
        }}
        disabled={isUploading || isRecording}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  container: {
    flexGrow: 1,
    padding: SIZES.PADDING,
    backgroundColor: COLORS.BACKGROUND,
    paddingBottom: SIZES.XXL,
    gap: SIZES.LG,
  },
  scroll: {
    flex: 1,
  },
  heading: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.DISPLAY,
    color: COLORS.PRIMARY,
    marginBottom: -SIZES.SM,
  },
  providerName: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XXL,
    color: COLORS.PRIMARY,
  },
  providerDetail: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  consentIntro: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 20,
    marginBottom: SIZES.MD,
  },
  consentConfirmation: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
    marginTop: SIZES.XS,
    marginBottom: SIZES.SM,
  },
  recorderCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    alignItems: 'center',
    ...SIZES.SHADOW.MEDIUM,
    gap: SIZES.MD,
  },
  viewVisitButton: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
  },
  viewVisitButtonLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  taggingCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    ...SIZES.SHADOW.MEDIUM,
    gap: SIZES.MD,
  },
  timer: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.DISPLAY,
    color: COLORS.PRIMARY,
  },
  statusText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    lineHeight: 22,
  },
  pauseButton: {
    width: '100%',
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    alignItems: 'center',
  },
  pauseButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.SECONDARY,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: SIZES.MD,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    alignItems: 'center',
    backgroundColor: COLORS.PRIMARY,
  },
  primaryButtonActive: {
    backgroundColor: COLORS.DANGER,
  },
  primaryButtonSecondary: {
    backgroundColor: COLORS.SECONDARY,
  },
  primaryButtonDisabled: {
    backgroundColor: COLORS.GRAY[200],
  },
  primaryButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.WHITE,
  },
  uploadButton: {
    width: '100%',
    paddingVertical: SIZES.MD,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    backgroundColor: COLORS.ACCENT,
    alignItems: 'center',
  },
  uploadButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.BLACK,
  },
  errorText: {
    marginTop: SIZES.SM,
    fontFamily: FONTS.MEDIUM,
    color: COLORS.DANGER,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: SIZES.XL,
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.SECONDARY,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  backButton: {
    paddingVertical: SIZES.XS,
  },
  backLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  consentCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    ...SIZES.SHADOW.MEDIUM,
    gap: SIZES.SM,
  },
  sectionTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  sectionSubtitle: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  consentMessage: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  legalNote: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[500],
    fontSize: SIZES.FONT.SM,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.MD,
  },
  switchLabel: {
    flex: 1,
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  additionalConsent: {
    gap: SIZES.SM,
    backgroundColor: COLORS.BACKGROUND,
    padding: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  additionalConsentText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  advanceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
    backgroundColor: COLORS.CARD_BACKGROUND,
    padding: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  advanceNoticeText: {
    flex: 1,
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
  },
  consentFooterText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  providerLoader: {
    paddingVertical: SIZES.MD,
    alignItems: 'center',
  },
  providerChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.SM,
  },
  providerChip: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    backgroundColor: COLORS.WHITE,
    maxWidth: '100%',
  },
  providerChipActive: {
    borderColor: COLORS.PRIMARY,
    backgroundColor: COLORS.GRAY[50],
  },
  providerChipLabel: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  providerChipLabelActive: {
    color: COLORS.PRIMARY,
  },
  providerChipMeta: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  helperText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  manualProviderRow: {
    flexDirection: 'row',
    gap: SIZES.SM,
    marginTop: SIZES.MD,
  },
  manualProviderInputs: {
    flex: 1,
    gap: SIZES.XS,
  },
  manualProviderField: {
    gap: SIZES.XS,
  },
  manualProviderLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
    fontSize: SIZES.FONT.SM,
  },
  manualProviderInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    backgroundColor: COLORS.WHITE,
  },
  manualProviderSecondaryInput: {
    marginTop: 0,
  },
  manualProviderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.PRIMARY,
  },
  manualProviderButtonDisabled: {
    backgroundColor: COLORS.GRAY[200],
  },
  manualProviderButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
  manualProviderButtonTextDisabled: {
    color: COLORS.SECONDARY,
  },
  manualProviderActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SIZES.SM,
  },
  manualProviderSuggestions: {
    marginTop: SIZES.SM,
    gap: SIZES.XS,
  },
  manualProviderSuggestionLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  manualProviderSuggestion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    backgroundColor: COLORS.WHITE,
  },
  manualProviderSuggestionName: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
  },
  manualProviderSuggestionMeta: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    fontSize: SIZES.FONT.SM,
  },
  manualProviderSuggestionAction: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  skipButton: {
    alignSelf: 'flex-start',
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
  },
  skipButtonLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  postRecordingCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    ...SIZES.SHADOW.MEDIUM,
    gap: SIZES.MD,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SIZES.SM,
  },
  summaryOverview: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.PRIMARY,
    lineHeight: 22,
  },
  summaryStatusText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  keyPointsSection: {
    gap: SIZES.SM,
  },
  keyPointsTitle: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  keyPointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SIZES.XS,
  },
  keyPointBullet: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    marginTop: 2,
  },
  keyPointText: {
    flex: 1,
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  postProviderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: SIZES.SM,
  },
  postProviderLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
    fontSize: SIZES.FONT.SM,
  },
  postProviderValue: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    fontSize: SIZES.FONT.MD,
  },
  postProviderMeta: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    fontSize: SIZES.FONT.SM,
  },
  postProviderButton: {
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    backgroundColor: COLORS.WHITE,
  },
  postProviderButtonText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
  },
  postActionRow: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  postActionButton: {
    flex: 1,
    paddingVertical: SIZES.MD,
    borderRadius: SIZES.BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButton: {
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    backgroundColor: COLORS.WHITE,
  },
  primaryActionButton: {
    backgroundColor: COLORS.PRIMARY,
  },
  primaryActionButtonDisabled: {
    backgroundColor: COLORS.GRAY[200],
  },
  postActionButtonLabel: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.SECONDARY,
  },
  primaryActionText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
  },
});

export default VisitRecorder;
