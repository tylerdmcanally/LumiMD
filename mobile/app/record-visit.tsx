/**
 * Record Visit Screen
 * Audio recording interface for medical visits
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Linking,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing } from '../components/ui';
import { useAudioRecording, MAX_RECORDING_MS } from '../lib/hooks/useAudioRecording';
import { useConsentFlow } from '../lib/hooks/useConsentFlow';
import { uploadAudioFile, UploadProgress } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { KeepDeviceAwake } from '../components/KeepDeviceAwake';
import { useCanRecord, useSubscription } from '../contexts/SubscriptionContext';
import {
  ConsentRequiredModal,
  ConsentEducationalModal,
  LocationSetupModal,
  StateSelector,
} from '../components/consent';
import type { ConsentRecord } from '../lib/location';

const LONG_RECORDING_CONFIRM_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
const LONG_RECORDING_WARNING_THRESHOLD_MS = 75 * 60 * 1000; // 75 minutes
const RECORDING_LIMIT_MINUTES = MAX_RECORDING_MS / (60 * 1000);

export default function RecordVisitScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    recordingState,
    duration,
    uri,
    isRecording,
    isPaused,
    hasPermission,
    requestPermission,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    autoStopReason,
  } = useAudioRecording();

  const {
    userState,
    stateSource,
    isLoading: isLocationLoading,
    checkConsentRequired,
    generateConsentRecord,
    setSkipEducationalPrompt,
    setManualState,
    requestLocationPermission,
    refreshLocation,
    hasLocationPermission,
  } = useConsentFlow();

  const { canRecord, showPaywall } = useCanRecord();
  const { freeVisitsUsed, isSubscribed, paywallEnabled, refreshSubscription } = useSubscription();
  
  // Track visits completed in this session (since freeVisitsUsed may not update immediately)
  const sessionVisitsCompleted = useRef(0);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showConsentRequired, setShowConsentRequired] = useState(false);
  const [showConsentEducational, setShowConsentEducational] = useState(false);
  const [showLocationSetup, setShowLocationSetup] = useState(false);
  const [showStateSelector, setShowStateSelector] = useState(false);
  const [consentRecord, setConsentRecord] = useState<ConsentRecord | null>(null);
  const isIdle = recordingState === 'idle';
  const isFinished = recordingState === 'stopped';
  const longRecordingWarningShown = useRef(false);
  const [pendingConsentCheck, setPendingConsentCheck] = useState(false);
  const showError = (message: string) => {
    setErrorMessage(message);
  };

  const isPrimaryDisabled = uploading || isFinished;
  const primaryIconName = isRecording ? 'pause' : isPaused ? 'play' : 'mic';
  const primaryIconColor = isRecording || isPaused ? Colors.surface : Colors.primary;

  const extractUserMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object') {
      const maybeMessage = (error as any).userMessage || (error as any).message;
      if (maybeMessage && typeof maybeMessage === 'string') {
        return maybeMessage;
      }
      if (typeof (error as any).status === 'number') {
        const status = (error as any).status;
        if (status === 401 || status === 403) {
          return 'Your session expired. Please sign in again.';
        }
        if (status >= 500) {
          return 'We ran into an issue saving your visit. Please try again in a moment.';
        }
      }
      if ((error as any).code === 'network_error' || (error as any).code === 'timeout') {
        return 'We had trouble uploading due to a connection issue. Please try again when you have a stable connection.';
      }
    }
    return fallback;
  };

  // Format duration as MM:SS
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleStartRecording = async () => {
    try {
      // Check subscription/trial status before allowing recording
      if (!canRecord) {
        showPaywall();
        return;
      }

      // Check microphone permission first
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          Alert.alert(
            'Permission Required',
            'Microphone access is needed to record your visit. Please enable it in Settings.',
            [{ text: 'OK' }]
          );
          showError('Microphone permission is required to record a visit. Enable it in Settings and try again.');
          return;
        }
      }

      // Check if we need to set up location first
      // Show setup if:
      // 1. No state is set at all, OR
      // 2. Location permission is denied (false) and no manual override
      // Note: hasLocationPermission can be null (still checking), false (denied), or true (granted)
      const needsLocationSetup = 
        (!userState && !stateSource) || 
        (stateSource !== 'manual' && hasLocationPermission !== true && !isLocationLoading);
      
      if (needsLocationSetup) {
        setShowLocationSetup(true);
        return;
      }

      // Check consent requirements
      const consentCheck = await checkConsentRequired();
      if (!consentCheck.canProceed) {
        if (consentCheck.modalType === 'required') {
          setShowConsentRequired(true);
          return;
        } else if (consentCheck.modalType === 'educational') {
          setShowConsentEducational(true);
          return;
        }
      }

      // Proceed with recording
      await proceedWithRecording(consentCheck.twoPartyRequired);
    } catch (error: any) {
      console.error('[RecordVisit] Start error:', error);
      showError("We couldn't start recording. Please try again.");
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const proceedWithRecording = async (consentAcknowledged: boolean) => {
    try {
      setErrorMessage(null);
      longRecordingWarningShown.current = false;
      
      // Generate consent record for this visit
      const record = generateConsentRecord(consentAcknowledged);
      setConsentRecord(record);
      
      await startRecording();
    } catch (error: any) {
      console.error('[RecordVisit] Start error:', error);
      showError("We couldn't start recording. Please try again.");
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const handleConsentConfirm = () => {
    setShowConsentRequired(false);
    void proceedWithRecording(true);
  };

  const handleConsentCancel = () => {
    setShowConsentRequired(false);
    setShowConsentEducational(false);
  };

  const handleEducationalProceed = async (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      await setSkipEducationalPrompt(true);
    }
    setShowConsentEducational(false);
    void proceedWithRecording(false);
  };

  const handleLocationEnable = async (): Promise<boolean> => {
    const granted = await requestLocationPermission();
    if (granted) {
      await refreshLocation();
      setShowLocationSetup(false);
      // Set flag to run consent check once location state updates
      setPendingConsentCheck(true);
      return true;
    }
    
    // Permission denied - prompt user to enable in Settings
    Alert.alert(
      'Location Access Denied',
      'Location permission was denied. To use automatic location detection, please enable location access in Settings.',
      [
        { text: 'Select Manually', onPress: handleLocationSelectManually },
        { 
          text: 'Open Settings', 
          onPress: () => {
            setShowLocationSetup(false);
            setPendingConsentCheck(true);
            Linking.openSettings();
          } 
        },
      ]
    );
    return false;
  };

  // Handle return from Settings - refresh location when app becomes active
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && pendingConsentCheck && !userState) {
        // Try to refresh location in case permission was just granted
        await refreshLocation();
      }
    });

    return () => subscription.remove();
  }, [pendingConsentCheck, userState, refreshLocation]);

  // Run consent check once we have a valid state after pending
  // Only run if we're in idle state (not already recording)
  useEffect(() => {
    if (pendingConsentCheck && userState && !isLocationLoading && isIdle) {
      setPendingConsentCheck(false);
      console.log('[RecordVisit] Running consent check after location setup');
      void runConsentCheck();
    }
  }, [pendingConsentCheck, userState, isLocationLoading, isIdle]);

  const runConsentCheck = async () => {
    const consentCheck = await checkConsentRequired();
    console.log('[RecordVisit] Consent check result:', JSON.stringify(consentCheck));
    
    if (!consentCheck.canProceed) {
      if (consentCheck.modalType === 'required') {
        console.log('[RecordVisit] Showing required consent modal');
        setShowConsentRequired(true);
      } else if (consentCheck.modalType === 'educational') {
        console.log('[RecordVisit] Showing educational consent modal');
        setShowConsentEducational(true);
      }
    } else {
      console.log('[RecordVisit] Consent check passed, proceeding with recording');
      await proceedWithRecording(consentCheck.twoPartyRequired);
    }
  };

  const handleLocationSelectManually = () => {
    setShowLocationSetup(false);
    setShowStateSelector(true);
  };

  const handleStateSelected = async (stateCode: string) => {
    await setManualState(stateCode);
    setShowStateSelector(false);
    // Re-trigger the recording flow now that we have a state
    setTimeout(() => {
      void handleStartRecording();
    }, 100);
  };

  const handleLocationSetupCancel = () => {
    setShowLocationSetup(false);
  };

  const handleStateSelectorCancel = () => {
    setShowStateSelector(false);
  };

  const handleStopAndSave = async () => {
    try {
      await stopRecording();
    } catch (error: any) {
      console.error('[RecordVisit] Stop error:', error);
      showError('We couldn’t stop the recording. Please try again.');
      Alert.alert('Error', 'Failed to stop recording. Please try again.');
    }
  };

  const handlePauseToggle = async () => {
    try {
      if (isPaused) {
        await resumeRecording();
      } else {
        await pauseRecording();
      }
    } catch (error: any) {
      console.error('[RecordVisit] Pause/resume error:', error);
      showError('We ran into a problem updating the recording. Please try again.');
      Alert.alert('Recording issue', 'We couldn’t update the recording state. Please try again.');
    }
  };

  const handlePrimaryAction = async () => {
    if (uploading || isFinished) return;

    if (isRecording || isPaused) {
      await handlePauseToggle();
      return;
    }

    if (isIdle) {
      await handleStartRecording();
    }
  };

  const performUpload = async () => {
    if (!uri || !user) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Upload audio file
      const { downloadUrl, storagePath } = await uploadAudioFile(
        uri,
        user.uid,
        (progress: UploadProgress) => {
          setUploadProgress(progress.progress);
        }
      );

      console.log('[RecordVisit] Audio uploaded:', downloadUrl);

      // Create visit record with consent metadata
      await api.visits.create({
        audioUrl: downloadUrl,
        storagePath,
        status: 'processing',
        notes: '',
        ...(consentRecord && {
          consentAcknowledged: consentRecord.consentAcknowledged,
          consentAcknowledgedAt: consentRecord.consentAcknowledgedAt?.toISOString(),
          recordingStateCode: consentRecord.recordingStateCode,
          twoPartyConsentRequired: consentRecord.twoPartyConsentRequired,
          consentFlowVersion: consentRecord.consentFlowVersion,
        }),
      });

      console.log('[RecordVisit] Visit created');

      // Increment session counter and refresh subscription in background
      sessionVisitsCompleted.current += 1;
      refreshSubscription().catch(() => {}); // Fire and forget

      // Success! Show trial status for free users
      // Use freeVisitsUsed + sessionVisitsCompleted to account for visits not yet synced
      const FREE_VISIT_LIMIT = 3;
      const visitsAfterThis = freeVisitsUsed + sessionVisitsCompleted.current;
      const showTrialStatus = paywallEnabled && !isSubscribed && visitsAfterThis <= FREE_VISIT_LIMIT;

      if (showTrialStatus) {
        const remaining = FREE_VISIT_LIMIT - visitsAfterThis;
        Alert.alert(
          'Visit Recorded',
          remaining > 0
            ? `Your visit is being processed.\n\nYou've used ${visitsAfterThis} of ${FREE_VISIT_LIMIT} free visits. ${remaining} remaining.`
            : `Your visit is being processed.\n\nYou've used all ${FREE_VISIT_LIMIT} free visits. Subscribe to continue recording.`,
          remaining > 0
            ? [{ text: 'OK', onPress: () => { resetRecording(); router.replace('/'); } }]
            : [
                { text: 'Later', style: 'cancel', onPress: () => { resetRecording(); router.replace('/'); } },
                { text: 'View Plans', onPress: () => { resetRecording(); router.replace('/paywall'); } },
              ],
          { cancelable: false }
        );
      } else {
        Alert.alert(
          'Visit Recorded',
          'Your visit has been saved and is being processed.',
          [{ text: 'OK', onPress: () => { resetRecording(); router.replace('/'); } }],
          { cancelable: false }
        );
      }
    } catch (error: any) {
      console.error('[RecordVisit] Upload error:', error);

      // Check for trial limit reached (402 Payment Required)
      if (error?.status === 402 && error?.code === 'trial_limit_reached') {
        Alert.alert(
          'Free Trial Ended',
          'You\'ve used all your free visits. Subscribe to continue recording.',
          [
            { text: 'Not Now', style: 'cancel', onPress: () => {
              resetRecording();
              router.back();
            }},
            { text: 'View Plans', onPress: () => {
              resetRecording();
              router.replace('/paywall');
            }},
          ]
        );
        return;
      }

      showError(extractUserMessage(error, 'Failed to save your recording. Please try again.'));
      Alert.alert(
        'Upload Failed',
        extractUserMessage(error, 'Failed to save your recording. Please try again.'),
        [{ text: 'OK' }]
      );
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = () => {
    if (!uri || !user || uploading) return;

    if (duration >= LONG_RECORDING_CONFIRM_THRESHOLD_MS) {
      Alert.alert(
        'Upload long recording?',
        'This visit runs longer than an hour. Long recordings cost more to transcribe. Do you still want to send it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send',
            style: 'destructive',
            onPress: () => {
              void performUpload();
            },
          },
        ]
      );
      return;
    }

    void performUpload();
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Recording',
      'Are you sure you want to cancel this recording?',
      [
        { text: 'Keep Recording', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: () => {
            resetRecording();
            // If opened via widget (no back history), go to home
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/');
            }
          },
        },
      ]
    );
  };

  // Warn before reaching the recording cap
  useEffect(() => {
    if (
      isRecording &&
      duration >= LONG_RECORDING_WARNING_THRESHOLD_MS &&
      !longRecordingWarningShown.current
    ) {
      Alert.alert(
        'Recording still running',
        `Recordings stop automatically after ${RECORDING_LIMIT_MINUTES} minutes. Wrap up soon and tap stop when the visit ends.`
      );
      longRecordingWarningShown.current = true;
    }
  }, [duration, isRecording]);

  // Reset long-recording warning when returning to idle
  useEffect(() => {
    if (recordingState === 'idle') {
      longRecordingWarningShown.current = false;
    }
  }, [recordingState]);

  // Notify about auto-stop reasons
  useEffect(() => {
    if (!autoStopReason) return;

    if (autoStopReason === 'maxDuration') {
      showError(`Recording stopped after reaching the ${RECORDING_LIMIT_MINUTES}-minute limit.`);
      Alert.alert(
        'Recording saved',
        `We automatically stopped recording after ${RECORDING_LIMIT_MINUTES} minutes. Tap Save to upload or Retake to start over.`
      );
    } else if (autoStopReason === 'interruption') {
      showError(
        'Recording stopped because the app lost microphone access. Please keep the app open to continue recording.'
      );
      Alert.alert(
        'Recording interrupted',
        'We lost access to the microphone. Keep LumiMD open during the visit to avoid losing audio.'
      );
    }
  }, [autoStopReason]);

  return (
    <ErrorBoundary
      title="Recording encountered an issue"
      description="If this keeps happening, force close the app and reopen before trying again."
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleCancel} style={styles.headerButton}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Record Visit</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Main Content */}
        <View style={styles.content}>
          {errorMessage && (
            <View style={styles.errorBanner}>
              <Ionicons name="warning" size={18} color={Colors.error} />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
              <Pressable onPress={() => setErrorMessage(null)} style={styles.errorDismiss}>
                <Ionicons name="close" size={18} color={Colors.error} />
              </Pressable>
            </View>
          )}

          {/* Status */}
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>
              {recordingState === 'idle' && 'Ready to record'}
              {recordingState === 'recording' && 'Recording...'}
              {recordingState === 'paused' && 'Paused'}
              {recordingState === 'stopped' && 'Recording complete'}
            </Text>
          </View>

          {/* Duration */}
          <View style={styles.durationContainer}>
            <Text style={styles.duration}>{formatDuration(duration)}</Text>
            {isRecording && (
              <View style={styles.recordingIndicator}>
                <View style={styles.recordingDot} />
              </View>
            )}
          </View>
          {/* Primary Control */}
          <Pressable
            style={[
              styles.iconContainer,
              isRecording && styles.iconRecording,
              isPaused && styles.iconPaused,
              isPrimaryDisabled && styles.iconDisabled,
            ]}
            onPress={handlePrimaryAction}
            disabled={isPrimaryDisabled}
          >
            <Ionicons
              name={primaryIconName}
              size={80}
              color={primaryIconColor}
            />
          </Pressable>

          {/* Upload Progress */}
          {uploading && (
            <View style={styles.uploadContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.uploadText}>
                Uploading... {Math.round(uploadProgress)}%
              </Text>
            </View>
          )}

          {/* Instructions */}
          {isIdle && (
            <Text style={styles.instructions}>
              Tap the microphone to start recording your medical visit
            </Text>
          )}
          {isPaused && !uploading && (
            <Text style={styles.instructions}>
              Tap the play button to resume recording or use Stop Recording to wrap up your visit
            </Text>
          )}
          {isFinished && !uploading && (
            <Text style={styles.instructions}>
              Tap save to upload your recording or retake to start over
            </Text>
          )}
        </View>

        {/* Controls */}
        {/* Stop + Post Actions */}
        {isFinished && !uploading && (
          <View style={styles.controls}>
            <Pressable
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={() => {
                resetRecording();
              }}
            >
              <Ionicons name="refresh" size={20} color={Colors.primary} />
              <Text style={styles.secondaryButtonText}>Retake</Text>
            </Pressable>

            <Pressable
              style={[styles.actionButton, styles.saveButton]}
              onPress={handleUpload}
            >
              <Ionicons name="checkmark" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Visit</Text>
            </Pressable>
          </View>
        )}

        {(recordingState === 'recording' || recordingState === 'paused') && (
          <Pressable
            onPress={handleStopAndSave}
            disabled={uploading}
            style={({ pressed }) => [
              styles.stopBar,
              pressed && styles.stopBarPressed,
              uploading && styles.stopBarDisabled,
            ]}
          >
            <Ionicons name="stop" size={24} color="#fff" />
            <Text style={styles.stopBarText}>Stop Recording</Text>
          </Pressable>
        )}
      </SafeAreaView>
      {isRecording && <KeepDeviceAwake tag="visit-recording" />}

      {/* Location Setup Modal */}
      <LocationSetupModal
        visible={showLocationSetup}
        isLoading={isLocationLoading}
        onEnableLocation={handleLocationEnable}
        onSelectManually={handleLocationSelectManually}
        onCancel={handleLocationSetupCancel}
      />

      {/* State Selector Modal */}
      <StateSelector
        visible={showStateSelector}
        currentState={userState}
        onSelect={handleStateSelected}
        onClose={handleStateSelectorCancel}
      />

      {/* Consent Modals */}
      <ConsentRequiredModal
        visible={showConsentRequired}
        stateCode={userState}
        onConfirm={handleConsentConfirm}
        onCancel={handleConsentCancel}
      />
      <ConsentEducationalModal
        visible={showConsentEducational}
        onProceed={handleEducationalProceed}
        onCancel={handleConsentCancel}
      />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
    fontWeight: '600',
    color: Colors.text,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing(6),
  },
  statusContainer: {
    marginBottom: spacing(4),
  },
  statusText: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(8),
  },
  duration: {
    fontSize: 56,
    fontWeight: '300',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  recordingIndicator: {
    marginLeft: spacing(3),
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.error,
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(8),
    gap: spacing(2),
  },
  iconRecording: {
    backgroundColor: Colors.error,
    borderWidth: 0,
  },
  iconPaused: {
    backgroundColor: Colors.primary,
    borderWidth: 0,
  },
  iconDisabled: {
    opacity: 0.4,
  },
  uploadContainer: {
    alignItems: 'center',
    marginTop: spacing(4),
  },
  uploadText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: spacing(2),
  },
  errorBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: `${Colors.error}10`,
    borderColor: `${Colors.error}40`,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: spacing(2),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    marginBottom: spacing(4),
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: Colors.error,
  },
  errorDismiss: {
    padding: spacing(1),
  },
  instructions: {
    fontSize: 15,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  controls: {
    flexDirection: 'row',
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(6),
    gap: spacing(3),
  },
  secondaryButton: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  stopButton: {
    backgroundColor: Colors.error,
  },
  stoppedControls: {
    flexDirection: 'row',
    gap: spacing(3),
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(4),
    borderRadius: 12,
    gap: spacing(2),
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  saveButton: {
    backgroundColor: Colors.primary,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  stopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    backgroundColor: Colors.error,
    paddingVertical: spacing(4),
    marginHorizontal: spacing(4),
    marginBottom: spacing(6),
    borderRadius: 16,
  },
  stopBarPressed: {
    opacity: 0.85,
  },
  stopBarDisabled: {
    opacity: 0.5,
  },
  stopBarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

