/**
 * Record Visit Screen
 * Audio recording interface for medical visits
 *
 * Flow: Start (mic) → Stop (square) → Save / Retake
 * Pause is a secondary text action during recording.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../components/ui';
import { useAudioRecording, MAX_RECORDING_MS } from '../lib/hooks/useAudioRecording';
import { uploadAudioFile, UploadProgress, deleteAudioFile } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api/client';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { KeepDeviceAwake } from '../components/KeepDeviceAwake';

const LONG_RECORDING_CONFIRM_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
const LONG_RECORDING_WARNING_THRESHOLD_MS = 75 * 60 * 1000; // 75 minutes
const RECORDING_LIMIT_MINUTES = MAX_RECORDING_MS / (60 * 1000);

const WAVEFORM_BARS = 35;
const MIN_BAR_HEIGHT = 3;
const MAX_BAR_HEIGHT = 48;

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
    metering,
  } = useAudioRecording();

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Consent gate: shown every time in idle state (two-party consent default).
  // TODO: state-based consent logic can refine this — e.g., one-party states
  // could store dismissal in AsyncStorage (`consent_card_dismissed`).
  const [consentGiven, setConsentGiven] = useState(false);
  const isIdle = recordingState === 'idle';
  const isFinished = recordingState === 'stopped';
  const longRecordingWarningShown = useRef(false);

  // Waveform
  const [waveformBars, setWaveformBars] = useState<number[]>(
    new Array(WAVEFORM_BARS).fill(0)
  );
  const meteringHistoryRef = useRef<number[]>(new Array(WAVEFORM_BARS).fill(0));

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringScaleAnim = useRef(new Animated.Value(1)).current;
  const ringOpacityAnim = useRef(new Animated.Value(0)).current;

  const showError = (message: string) => {
    setErrorMessage(message);
  };

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

  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // ── Handlers ─────────────────────────────────────────────

  const handleStartRecording = async () => {
    try {
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
      setErrorMessage(null);
      longRecordingWarningShown.current = false;
      await startRecording();
    } catch (error: any) {
      console.error('[RecordVisit] Start error:', error);
      showError('We couldn\'t start recording. Please try again.');
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
  };

  const handleStop = async () => {
    try {
      await stopRecording();
    } catch (error: any) {
      console.error('[RecordVisit] Stop error:', error);
      showError('We couldn\'t stop the recording. Please try again.');
      Alert.alert('Error', 'Failed to stop recording. Please try again.');
    }
  };

  const handlePause = async () => {
    try {
      await pauseRecording();
    } catch (error: any) {
      console.error('[RecordVisit] Pause error:', error);
      showError('We ran into a problem pausing. Please try again.');
    }
  };

  const handleResume = async () => {
    try {
      await resumeRecording();
    } catch (error: any) {
      console.error('[RecordVisit] Resume error:', error);
      showError('We couldn\'t resume recording. Please try again.');
    }
  };

  const performUpload = async () => {
    if (!uri || !user) return;

    setUploading(true);
    setUploadProgress(0);
    let uploadedStoragePath: string | null = null;

    try {
      const { downloadUrl, storagePath } = await uploadAudioFile(
        uri,
        user.uid,
        (progress: UploadProgress) => {
          setUploadProgress(progress.progress);
        }
      );

      console.log('[RecordVisit] Audio uploaded:', downloadUrl);
      uploadedStoragePath = storagePath;

      await api.visits.create({
        audioUrl: downloadUrl,
        storagePath,
        status: 'processing',
        notes: '',
      });

      console.log('[RecordVisit] Visit created');

      Alert.alert(
        'Visit Recorded',
        'Your visit has been saved and is being processed.',
        [],
        { cancelable: false }
      );

      setTimeout(() => {
        resetRecording();
        router.replace('/');
      }, 2000);
    } catch (error: any) {
      console.error('[RecordVisit] Upload error:', error);

      if (uploadedStoragePath) {
        try {
          await deleteAudioFile(uploadedStoragePath);
          console.log('[RecordVisit] Cleaned up orphaned upload:', uploadedStoragePath);
        } catch (cleanupError) {
          console.error('[RecordVisit] Failed to clean up orphaned upload:', cleanupError);
        }
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

  // ── Primary button config per state ──────────────────────

  const getPrimaryAction = () => {
    if (isRecording) return handleStop;
    if (isPaused) return handleResume;
    return handleStartRecording;
  };

  const getPrimaryIcon = (): 'stop' | 'play' | 'mic' => {
    if (isRecording) return 'stop';
    if (isPaused) return 'play';
    return 'mic';
  };

  // ── Effects ──────────────────────────────────────────────

  useEffect(() => {
    if (metering != null && isRecording) {
      const normalized = Math.min(1, Math.max(0, (metering + 60) / 60));
      meteringHistoryRef.current = [
        ...meteringHistoryRef.current.slice(1),
        normalized,
      ];
      setWaveformBars([...meteringHistoryRef.current]);
    }
  }, [metering, isRecording]);

  useEffect(() => {
    if (recordingState === 'idle') {
      meteringHistoryRef.current = new Array(WAVEFORM_BARS).fill(0);
      setWaveformBars(new Array(WAVEFORM_BARS).fill(0));
      setConsentGiven(false);
    }
  }, [recordingState]);

  useEffect(() => {
    if (isRecording) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    }
    pulseAnim.setValue(1);
  }, [isRecording, pulseAnim]);

  useEffect(() => {
    if (isRecording) {
      const animation = Animated.loop(
        Animated.parallel([
          Animated.timing(ringScaleAnim, {
            toValue: 1.4,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(ringOpacityAnim, {
              toValue: 0.25,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacityAnim, {
              toValue: 0,
              duration: 1800,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      animation.start();
      return () => {
        animation.stop();
        ringScaleAnim.setValue(1);
        ringOpacityAnim.setValue(0);
      };
    }
    ringScaleAnim.setValue(1);
    ringOpacityAnim.setValue(0);
  }, [isRecording, ringScaleAnim, ringOpacityAnim]);

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

  useEffect(() => {
    if (recordingState === 'idle') {
      longRecordingWarningShown.current = false;
    }
  }, [recordingState]);

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

  // ── Render ───────────────────────────────────────────────

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

          {/* ── Consent card (idle, before consent given) ── */}
          {isIdle && !consentGiven && (
            <ScrollView
              style={{ flex: 1, width: '100%' }}
              contentContainerStyle={styles.consentScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.consentCard}>
                <View style={styles.consentIconCircle}>
                  <Ionicons name="people" size={28} color={Colors.coral} />
                </View>
                <Text style={styles.consentTitle}>Recording Consent</Text>
                <Text style={styles.consentText}>
                  Please confirm that everyone in the room knows this visit is being recorded.
                </Text>
                <Text style={styles.consentSubtext}>
                  Recording medical visits helps ensure accuracy. All recordings are encrypted and stored securely.
                </Text>
                <Pressable
                  style={styles.consentButton}
                  onPress={() => setConsentGiven(true)}
                >
                  <Ionicons name="checkmark-shield" size={20} color="#fff" />
                  <Text style={styles.consentButtonText}>Everyone Consents — Start Recording</Text>
                </Pressable>
                <Pressable
                  style={styles.privacyLink}
                  onPress={() => Linking.openURL('https://lumimd.app/privacy')}
                >
                  <Ionicons name="lock-closed-outline" size={14} color={Colors.primary} />
                  <Text style={styles.privacyLinkText}>Privacy Policy</Text>
                </Pressable>
              </View>
            </ScrollView>
          )}

          {/* ── Normal recording UI (after consent or during recording) ── */}
          {(!isIdle || consentGiven) && (
            <>
              {/* Status */}
              <View style={styles.statusContainer}>
                {isRecording && (
                  <Animated.View style={[styles.recordingDot, { opacity: pulseAnim }]} />
                )}
                <Text style={styles.statusText}>
                  {isIdle && consentGiven && 'Ready to Record'}
                  {isRecording && 'Recording'}
                  {isPaused && 'Paused'}
                  {isFinished && 'Recording Complete'}
                </Text>
              </View>

              {/* Duration */}
              <View style={styles.durationContainer}>
                <Text style={styles.duration}>{formatDuration(duration)}</Text>
              </View>

              {/* Waveform — visible during recording & paused */}
              {(isRecording || isPaused) ? (
                <View style={styles.waveformContainer}>
                  {waveformBars.map((value, index) => (
                    <View
                      key={index}
                      style={[
                        styles.waveformBar,
                        {
                          height:
                            MIN_BAR_HEIGHT + value * (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT),
                          backgroundColor: Colors.primary,
                          opacity: isRecording ? 0.4 + value * 0.6 : 0.3,
                        },
                      ]}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.waveformPlaceholder} />
              )}

              {/* ── Primary circle button (idle / recording / paused) ── */}
              {!isFinished && (
                <View style={styles.buttonArea}>
                  {isRecording && (
                    <Animated.View
                      style={[
                        styles.ringPulse,
                        {
                          transform: [{ scale: ringScaleAnim }],
                          opacity: ringOpacityAnim,
                        },
                      ]}
                    />
                  )}
                  <Pressable
                    style={[
                      styles.iconContainer,
                      isRecording && styles.iconRecording,
                      isPaused && styles.iconPaused,
                    ]}
                    onPress={getPrimaryAction()}
                    disabled={uploading}
                  >
                    <Ionicons name={getPrimaryIcon()} size={64} color="#fff" />
                  </Pressable>
                </View>
              )}

              {/* ── Secondary text action ── */}
              {isRecording && !uploading && (
                <Pressable onPress={handlePause} style={styles.secondaryAction}>
                  <Ionicons name="pause" size={16} color={Colors.textMuted} />
                  <Text style={styles.secondaryActionText}>Pause</Text>
                </Pressable>
              )}
              {isPaused && !uploading && (
                <Pressable onPress={handleStop} style={styles.secondaryAction}>
                  <Ionicons name="stop-circle-outline" size={16} color={Colors.textMuted} />
                  <Text style={styles.secondaryActionText}>End Recording</Text>
                </Pressable>
              )}

              {/* ── Finished: Save + Retake ── */}
              {isFinished && !uploading && (
                <View style={styles.finishedActions}>
                  <Pressable style={styles.saveButton} onPress={handleUpload}>
                    <Ionicons name="cloud-upload-outline" size={22} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Visit</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => resetRecording()}
                    style={styles.secondaryAction}
                  >
                    <Ionicons name="refresh" size={16} color={Colors.textMuted} />
                    <Text style={styles.secondaryActionText}>Retake</Text>
                  </Pressable>
                </View>
              )}

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
              {isIdle && consentGiven && (
                <Text style={styles.instructions}>
                  Tap the microphone to start recording your medical visit
                </Text>
              )}
              {isRecording && !uploading && (
                <Text style={styles.instructionSubtle}>
                  Keep the app open during your visit
                </Text>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
      {isRecording && <KeepDeviceAwake tag="visit-recording" />}
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing(6),
  },

  // Error
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
    fontFamily: 'PlusJakartaSans_400Regular',
  },
  errorDismiss: {
    padding: spacing(1),
  },

  // Status
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginBottom: spacing(2),
  },
  statusText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.error,
  },

  // Duration
  durationContainer: {
    marginBottom: spacing(6),
  },
  duration: {
    fontSize: 52,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: 2,
  },

  // Waveform
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: MAX_BAR_HEIGHT + 8,
    gap: 3,
    marginBottom: spacing(8),
    paddingHorizontal: spacing(4),
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  waveformPlaceholder: {
    height: MAX_BAR_HEIGHT + 8,
    marginBottom: spacing(8),
  },

  // Primary button
  buttonArea: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 160,
    height: 160,
    marginBottom: spacing(4),
  },
  ringPulse: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: Colors.error,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRecording: {
    backgroundColor: Colors.error,
  },
  iconPaused: {
    backgroundColor: Colors.primary,
  },

  // Secondary text-link action
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
  },
  secondaryActionText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },

  // Finished state
  finishedActions: {
    alignItems: 'center',
    gap: spacing(2),
    width: '100%',
    maxWidth: 300,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: spacing(4),
    borderRadius: 16,
    gap: spacing(2),
    width: '100%',
  },
  saveButtonText: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },

  // Upload
  uploadContainer: {
    alignItems: 'center',
    marginTop: spacing(4),
  },
  uploadText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    marginTop: spacing(2),
  },

  // Instructions
  instructions: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  instructionSubtle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    opacity: 0.7,
  },

  // Consent card
  consentScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: spacing(4),
  },
  consentCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: spacing(6),
    alignItems: 'center',
    gap: spacing(4),
    borderWidth: 1,
    borderColor: `${Colors.coral}25`,
    shadowColor: 'rgba(38,35,28,0.5)',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  consentIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.coral}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consentTitle: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  consentText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 24,
  },
  consentSubtext: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  consentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(5),
    borderRadius: Radius.md,
    gap: spacing(2),
    width: '100%',
    marginTop: spacing(2),
  },
  consentButtonText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },
  privacyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(1),
  },
  privacyLinkText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.primary,
  },
});
