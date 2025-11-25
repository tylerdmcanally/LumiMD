/**
 * useAudioRecording Hook
 * Simplified wall-clock timer with pause/resume recording control
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';
export type AutoStopReason = 'interruption' | 'maxDuration';

export const MAX_RECORDING_MS = 90 * 60 * 1000; // 90 minutes
const TIMER_INTERVAL_MS = 100;

export interface UseAudioRecordingResult {
  recordingState: RecordingState;
  duration: number; // milliseconds
  uri: string | null;
  isRecording: boolean;
  isPaused: boolean;
  autoStopReason: AutoStopReason | null;
  startRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
  hasPermission: boolean | null;
  requestPermission: () => Promise<boolean>;
}

export function useAudioRecording(): UseAudioRecordingResult {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [autoStopReason, setAutoStopReason] = useState<AutoStopReason | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);
  const recordingStateRef = useRef<RecordingState>('idle');
  const finalizingRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const updateDuration = useCallback(() => {
    if (segmentStartRef.current) {
      const elapsed = accumulatedMsRef.current + (Date.now() - segmentStartRef.current);
      setDuration(elapsed);
      return elapsed;
    }

    setDuration(accumulatedMsRef.current);
    return accumulatedMsRef.current;
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
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
  }, []);

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    recordingStateRef.current = recordingState;
  }, [recordingState]);

  const configureAudioMode = useCallback(async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  }, []);

  const finalizeRecording = useCallback(
    async (reason?: AutoStopReason) => {
      if (finalizingRef.current) {
        return;
      }
      finalizingRef.current = true;

      clearTimer();

      if (segmentStartRef.current) {
        accumulatedMsRef.current += Date.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }

      setDuration(accumulatedMsRef.current);

      const recording = recordingRef.current;
      if (recording) {
        try {
          recording.setOnRecordingStatusUpdate(null);
        } catch {
          // ignore
        }

        try {
          await recording.stopAndUnloadAsync();
        } catch (error) {
          if (reason === 'interruption') {
            console.warn('[Recording] stopAndUnloadAsync after interruption:', error);
          } else {
            console.error('[Recording] Failed to stop recording cleanly:', error);
          }
        }

        setUri(recording.getURI() ?? null);
        recordingRef.current = null;
      }

      recordingStateRef.current = 'stopped';
      setRecordingState('stopped');
      setAutoStopReason(reason ?? null);
      finalizingRef.current = false;
    },
    [clearTimer],
  );

  const startTimer = useCallback(() => {
    clearTimer();

    timerRef.current = setInterval(() => {
      const elapsed = updateDuration();

      if (recordingStateRef.current === 'recording' && elapsed >= MAX_RECORDING_MS) {
        finalizeRecording('maxDuration').catch((error) => {
          console.error('[Recording] Failed to auto-stop at max duration:', error);
        });
      }
    }, TIMER_INTERVAL_MS);
  }, [clearTimer, finalizeRecording, updateDuration]);

  const registerStatusUpdates = useCallback(
    (rec: Audio.Recording) => {
      rec.setProgressUpdateInterval(500);
      rec.setOnRecordingStatusUpdate((status) => {
        if (recordingStateRef.current !== 'recording') {
          return;
        }

        if (!status.isRecording && !status.canRecord) {
          finalizeRecording('interruption').catch((error) => {
            console.error('[Recording] Failed to finalize after interruption:', error);
          });
        }
      });
    },
    [finalizeRecording],
  );

  const startRecording = useCallback(async () => {
    try {
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          throw new Error('Microphone permission not granted');
        }
      }

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

      const { recording } = await Audio.Recording.createAsync(recordingOptions);
      recordingRef.current = recording;
      registerStatusUpdates(recording);

      accumulatedMsRef.current = 0;
      segmentStartRef.current = Date.now();
      setDuration(0);
      setUri(null);
      setAutoStopReason(null);
      finalizingRef.current = false;
      recordingStateRef.current = 'recording';
      setRecordingState('recording');

      startTimer();
      console.log('[Recording] Recording started');
    } catch (error) {
      console.error('[Recording] Failed to start:', error);
      throw error;
    }
  }, [configureAudioMode, hasPermission, registerStatusUpdates, requestPermission, startTimer]);

  const pauseRecording = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;

      await recording.pauseAsync();
      clearTimer();

      if (segmentStartRef.current) {
        accumulatedMsRef.current += Date.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }

      setDuration(accumulatedMsRef.current);
      recordingStateRef.current = 'paused';
      setRecordingState('paused');
      console.log('[Recording] Paused');
    } catch (error) {
      console.error('[Recording] Failed to pause:', error);
      throw error;
    }
  }, [clearTimer]);

  const resumeRecording = useCallback(async () => {
    try {
      const recording = recordingRef.current;
      if (!recording) return;

      await configureAudioMode();
      await recording.startAsync();
      registerStatusUpdates(recording);

      segmentStartRef.current = Date.now();
      recordingStateRef.current = 'recording';
      setRecordingState('recording');
      startTimer();

      console.log('[Recording] Resumed');
    } catch (error) {
      console.error('[Recording] Failed to resume:', error);
      throw error;
    }
  }, [configureAudioMode, registerStatusUpdates, startTimer]);

  const stopRecording = useCallback(async () => {
    console.log('[Recording] Stopping recording...');
    await finalizeRecording();
  }, [finalizeRecording]);

  const resetRecording = useCallback(() => {
    clearTimer();

    if (recordingRef.current) {
      try {
        recordingRef.current.setOnRecordingStatusUpdate(null);
        recordingRef.current.stopAndUnloadAsync().catch(() => {
          console.log('[Recording] Reset - recording already stopped');
        });
      } catch {
        // ignore
      }
    }

    recordingRef.current = null;
    segmentStartRef.current = null;
    accumulatedMsRef.current = 0;
    finalizingRef.current = false;
    recordingStateRef.current = 'idle';

    setRecordingState('idle');
    setDuration(0);
    setUri(null);
    setAutoStopReason(null);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {
          console.log('[Recording] Cleanup - already stopped');
        });
      }
    };
  }, [clearTimer]);

  return {
    recordingState,
    duration,
    uri,
    isRecording: recordingState === 'recording',
    isPaused: recordingState === 'paused',
    autoStopReason,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    hasPermission,
    requestPermission,
  };
}

