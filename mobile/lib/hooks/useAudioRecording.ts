/**
 * useAudioRecording Hook
 * Manages audio recording state and operations
 */

import { useState, useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';
export type AutoStopReason = 'interruption' | 'maxDuration';

export const MAX_RECORDING_MS = 90 * 60 * 1000; // 90 minutes

export interface UseAudioRecordingResult {
  // State
  recordingState: RecordingState;
  duration: number; // in milliseconds
  uri: string | null;
  isRecording: boolean;
  isPaused: boolean;
  autoStopReason: AutoStopReason | null;
  
  // Actions
  startRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
  
  // Permission
  hasPermission: boolean | null;
  requestPermission: () => Promise<boolean>;
}

export function useAudioRecording(): UseAudioRecordingResult {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [duration, setDuration] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [autoStopReason, setAutoStopReason] = useState<AutoStopReason | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordingStateRef = useRef<RecordingState>('idle');
  const activeSegmentStartRef = useRef<number | null>(null);
  const accumulatedDurationRef = useRef(0);

  const getCurrentDuration = () => {
    if (activeSegmentStartRef.current == null) {
      return accumulatedDurationRef.current;
    }
    return accumulatedDurationRef.current + (Date.now() - activeSegmentStartRef.current);
  };

  const commitActiveSegment = () => {
    if (activeSegmentStartRef.current != null) {
      accumulatedDurationRef.current += Date.now() - activeSegmentStartRef.current;
      activeSegmentStartRef.current = null;
    }
  };

  const updateDisplayedDuration = () => {
    const nextDuration = getCurrentDuration();
    setDuration(nextDuration);
    return nextDuration;
  };

  const clearDurationTimer = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  };

  const finalizeRecording = async (
    activeRecording: Audio.Recording,
    options: { reason?: AutoStopReason } = {}
  ) => {
    clearDurationTimer();

    commitActiveSegment();
    setDuration(accumulatedDurationRef.current);

    try {
      activeRecording.setOnRecordingStatusUpdate(null);
      await activeRecording.stopAndUnloadAsync();
    } catch (stopError) {
      if (options.reason === 'interruption') {
        console.warn('[Recording] stopAndUnloadAsync called after interruption:', stopError);
      } else {
        console.error('[Recording] Failed to stop recording cleanly:', stopError);
      }
    }

    const recordingUri = activeRecording.getURI() ?? null;
    setUri(recordingUri);
    setRecording(null);
    recordingRef.current = null;
    recordingStateRef.current = 'stopped';
    accumulatedDurationRef.current = 0;
    activeSegmentStartRef.current = null;
    setRecordingState('stopped');

    if (options.reason === 'interruption') {
      console.warn('[Recording] Recording stopped unexpectedly (likely background interruption).');
    }

    if (options.reason) {
      setAutoStopReason(options.reason);
    } else {
      setAutoStopReason(null);
    }
  };

  const registerRecordingStatusUpdates = (rec: Audio.Recording) => {
    rec.setProgressUpdateInterval(500);
    rec.setOnRecordingStatusUpdate((status) => {
      if (recordingStateRef.current !== 'recording') {
        return;
      }

      if (
        typeof status.durationMillis === 'number' &&
        status.durationMillis >= MAX_RECORDING_MS
      ) {
        finalizeRecording(rec, { reason: 'maxDuration' }).catch((error) => {
          console.error('[Recording] Failed to finalize after max duration:', error);
        });
        return;
      }

      if (!status.isRecording && !status.canRecord) {
        finalizeRecording(rec, { reason: 'interruption' }).catch((error) => {
          console.error('[Recording] Failed to finalize after interruption:', error);
        });
      }
    });
  };

  const unregisterRecordingStatusUpdates = (rec: Audio.Recording) => {
    rec.setOnRecordingStatusUpdate(null);
  };

  const cleanupDanglingRecording = async () => {
    if (!recordingRef.current) return;

    try {
      recordingRef.current.setOnRecordingStatusUpdate(null);
      await recordingRef.current.stopAndUnloadAsync();
    } catch (cleanupError) {
      console.warn('[Recording] Failed to cleanup dangling recording before restart:', cleanupError);
    } finally {
      recordingRef.current = null;
      setRecording(null);
    }
  };

  const startDurationTimer = (activeRecording: Audio.Recording) => {
    clearDurationTimer();

    durationIntervalRef.current = setInterval(() => {
      const currentDuration = updateDisplayedDuration();

      if (
        currentDuration >= MAX_RECORDING_MS &&
        recordingStateRef.current === 'recording'
      ) {
        finalizeRecording(activeRecording, { reason: 'maxDuration' }).catch((error) => {
          console.error('[Recording] Failed to auto-stop after max duration:', error);
        });
      }
    }, 250);
  };

  // Request microphone permission
  const requestPermission = async (): Promise<boolean> => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      const granted = status === 'granted';
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error('[Recording] Permission error:', error);
      setHasPermission(false);
      return false;
    }
  };

  // Check permission on mount
  useEffect(() => {
    requestPermission();
  }, []);

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  // Configure audio mode for recording
  const configureAudioMode = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  };

  // Start recording
  const startRecording = async () => {
    try {
      if (recordingStateRef.current === 'recording' || recordingStateRef.current === 'paused') {
        console.warn('[Recording] Attempted to start while a session is already active. Ignoring request.');
        return;
      }

      if (recordingRef.current) {
        await cleanupDanglingRecording();
      }

      // Check permission
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          throw new Error('Microphone permission not granted');
        }
      }

      setAutoStopReason(null);
      // Configure audio
      await configureAudioMode();

      console.log('[Recording] Starting recording...');
      
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
        },
      };
      const { recording: newRecording } = await Audio.Recording.createAsync(recordingOptions);

      setRecording(newRecording);
      recordingRef.current = newRecording;
      recordingStateRef.current = 'recording';
      setRecordingState('recording');
      setDuration(0);
      setUri(null);
      accumulatedDurationRef.current = 0;
      activeSegmentStartRef.current = Date.now();
      registerRecordingStatusUpdates(newRecording);

      // Start duration tracker
      startDurationTimer(newRecording);

      console.log('[Recording] Recording started');
    } catch (error) {
      console.error('[Recording] Failed to start:', error);
      throw error;
    }
  };

  // Pause recording
  const pauseRecording = async () => {
    try {
      if (!recording) return;
      
      await recording.pauseAsync();
      unregisterRecordingStatusUpdates(recording);
      recordingStateRef.current = 'paused';
      setRecordingState('paused');
      
      clearDurationTimer();
      commitActiveSegment();
      setDuration(accumulatedDurationRef.current);

      console.log('[Recording] Paused');
    } catch (error) {
      console.error('[Recording] Failed to pause:', error);
      throw error;
    }
  };

  // Resume recording
  const resumeRecording = async () => {
    try {
      if (!recording) return;
      
      await configureAudioMode();
      await recording.startAsync();
      activeSegmentStartRef.current = Date.now();
      registerRecordingStatusUpdates(recording);
      recordingStateRef.current = 'recording';
      setRecordingState('recording');
      
      // Restart duration tracker
      startDurationTimer(recording);
      updateDisplayedDuration();
      
      console.log('[Recording] Resumed');
    } catch (error) {
      console.error('[Recording] Failed to resume:', error);
      throw error;
    }
  };

  // Stop recording
  const stopRecording = async () => {
    try {
      if (!recording) return;

      console.log('[Recording] Stopping recording...');
      
      await finalizeRecording(recording);

      console.log('[Recording] Stopped. URI:', recording.getURI());
    } catch (error) {
      console.error('[Recording] Failed to stop:', error);
      throw error;
    }
  };

  // Reset to initial state
  const resetRecording = () => {
    clearDurationTimer();
    
    if (recording) {
      unregisterRecordingStatusUpdates(recording);
    }
    setRecording(null);
    recordingRef.current = null;
    recordingStateRef.current = 'idle';
    setRecordingState('idle');
    setDuration(0);
    setUri(null);
    setAutoStopReason(null);
    accumulatedDurationRef.current = 0;
    activeSegmentStartRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {
          // Ignore errors if already unloaded
          console.log('[Recording] Cleanup - recording already unloaded');
        });
      }
      clearDurationTimer();
      activeSegmentStartRef.current = null;
    };
  }, []);

  return {
    recordingState,
    duration,
    uri,
    isRecording: recordingState === 'recording',
    isPaused: recordingState === 'paused',
    autoStopReason,
    hasPermission,
    requestPermission,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
  };
}

