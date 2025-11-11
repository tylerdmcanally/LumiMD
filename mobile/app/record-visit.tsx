/**
 * Record Visit Screen
 * Audio recording interface for medical visits
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing } from '../components/ui';
import { useAudioRecording } from '../lib/hooks/useAudioRecording';
import { uploadAudioFile, UploadProgress } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api/client';
import { ErrorBoundary } from '../components/ErrorBoundary';

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
  } = useAudioRecording();

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isIdle = recordingState === 'idle';
  const isFinished = recordingState === 'stopped';
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

  // Format duration as MM:SS
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

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
      await startRecording();
    } catch (error: any) {
      console.error('[RecordVisit] Start error:', error);
      showError('We couldn’t start recording. Please try again.');
      Alert.alert('Error', 'Failed to start recording. Please try again.');
    }
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

  const handleMicPress = async () => {
    if (isIdle && !uploading) {
      await handleStartRecording();
    }
  };

  const handleUpload = async () => {
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

      // Create visit record
      await api.visits.create({
        audioUrl: downloadUrl,
        storagePath,
        status: 'processing',
        notes: '',
      });

      console.log('[RecordVisit] Visit created');

      // Success!
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
            router.back();
          },
        },
      ]
    );
  };

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

          {/* Microphone Icon */}
          <Pressable
            style={[
              styles.iconContainer,
              isRecording && styles.iconRecording,
              !isIdle && styles.iconDisabled,
            ]}
            onPress={handleMicPress}
            disabled={!isIdle || uploading}
          >
            <Ionicons
              name={isRecording ? 'stop-circle' : 'mic'}
              size={80}
              color={isRecording ? Colors.error : Colors.primary}
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
          {isFinished && !uploading && (
            <Text style={styles.instructions}>
              Tap save to upload your recording or retake to start over
            </Text>
          )}
        </View>

        {/* Controls */}
        {(recordingState === 'recording' || recordingState === 'paused' || isFinished) && (
          <View style={styles.controls}>
            {(recordingState === 'recording' || recordingState === 'paused') && (
              <View style={styles.recordingControls}>
                <Pressable
                  style={[styles.controlButton, styles.secondaryButton]}
                  onPress={isPaused ? resumeRecording : pauseRecording}
                >
                  <Ionicons
                    name={isPaused ? 'play' : 'pause'}
                    size={24}
                    color={Colors.primary}
                  />
                </Pressable>

                <Pressable
                  style={[styles.controlButton, styles.stopButton]}
                  onPress={handleStopAndSave}
                >
                  <Ionicons name="stop" size={24} color="#fff" />
                </Pressable>
              </View>
            )}

            {isFinished && !uploading && (
              <View style={styles.stoppedControls}>
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
          </View>
        )}
      </SafeAreaView>
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
  },
  iconRecording: {
    backgroundColor: Colors.surface,
    borderWidth: 4,
    borderColor: Colors.error,
  },
  iconDisabled: {
    opacity: 1,
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
    paddingHorizontal: spacing(6),
    paddingBottom: spacing(6),
  },
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(4),
    borderRadius: 16,
    gap: spacing(2),
  },
  recordButton: {
    backgroundColor: Colors.primary,
  },
  mainButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  recordingControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing(4),
  },
  controlButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
});

