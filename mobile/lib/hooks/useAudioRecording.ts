/**
 * useAudioRecording Hook
 * Manages audio recording state and operations
 */

import { useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

export interface UseAudioRecordingResult {
  // State
  recordingState: RecordingState;
  duration: number; // in milliseconds
  uri: string | null;
  isRecording: boolean;
  isPaused: boolean;
  
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
  const [durationInterval, setDurationInterval] = useState<NodeJS.Timeout | null>(null);

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

  // Configure audio mode for recording
  const configureAudioMode = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  };

  // Start recording
  const startRecording = async () => {
    try {
      // Check permission
      if (!hasPermission) {
        const granted = await requestPermission();
        if (!granted) {
          throw new Error('Microphone permission not granted');
        }
      }

      // Configure audio
      await configureAudioMode();

      console.log('[Recording] Starting recording...');
      
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setRecordingState('recording');
      setDuration(0);
      setUri(null);

      // Start duration tracker
      const interval = setInterval(() => {
        setDuration(prev => prev + 100);
      }, 100);
      setDurationInterval(interval);

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
      setRecordingState('paused');
      
      if (durationInterval) {
        clearInterval(durationInterval);
        setDurationInterval(null);
      }
      
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
      
      await recording.startAsync();
      setRecordingState('recording');
      
      // Restart duration tracker
      const interval = setInterval(() => {
        setDuration(prev => prev + 100);
      }, 100);
      setDurationInterval(interval);
      
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
      
      const recordingUri = recording.getURI();
      await recording.stopAndUnloadAsync();
      
      setUri(recordingUri);
      setRecording(null);
      setRecordingState('stopped');
      
      if (durationInterval) {
        clearInterval(durationInterval);
        setDurationInterval(null);
      }
      
      console.log('[Recording] Stopped. URI:', recordingUri);
    } catch (error) {
      console.error('[Recording] Failed to stop:', error);
      throw error;
    }
  };

  // Reset to initial state
  const resetRecording = () => {
    if (durationInterval) {
      clearInterval(durationInterval);
      setDurationInterval(null);
    }
    
    setRecording(null);
    setRecordingState('idle');
    setDuration(0);
    setUri(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recording) {
        recording.stopAndUnloadAsync().catch((error) => {
          // Ignore errors if already unloaded
          console.log('[Recording] Cleanup - recording already unloaded');
        });
      }
      if (durationInterval) {
        clearInterval(durationInterval);
      }
    };
  }, [recording, durationInterval]);

  return {
    recordingState,
    duration,
    uri,
    isRecording: recordingState === 'recording',
    isPaused: recordingState === 'paused',
    hasPermission,
    requestPermission,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
  };
}

