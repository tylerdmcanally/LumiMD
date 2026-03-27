/**
 * ProviderIntroModal
 *
 * Pre-recording modal that offers to play a short audio clip introducing
 * LumiMD to the patient's healthcare provider. Addresses physician resistance
 * by proactively reassuring them that no raw audio is saved.
 *
 * Flow: Play Introduction → clip plays through speaker → onComplete()
 *       Skip             → onSkip() immediately
 *
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { Colors, spacing, Radius } from './ui';

// ── Types ─────────────────────────────────────────────────────────────────────

type PlaybackState = 'idle' | 'playing';

type Props = {
  visible: boolean;
  /** Called when the intro clip finishes naturally or the user taps stop. */
  onComplete: () => void;
  /** Called when the user taps "Skip". */
  onSkip: () => void;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const BAR_COUNT = 5;
// Initial scaleY values create a mountain shape at rest
const INITIAL_BAR_SCALES = [0.35, 0.65, 1.0, 0.65, 0.35];
// Different durations per bar so they feel organic, not mechanical
const BAR_DURATIONS_MS = [380, 290, 340, 410, 310];

// ── Component ─────────────────────────────────────────────────────────────────

export function ProviderIntroModal({ visible, onComplete, onSkip }: Props) {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const soundRef = useRef<Audio.Sound | null>(null);
  const waveAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const barAnims = useRef(
    INITIAL_BAR_SCALES.map(v => new Animated.Value(v))
  ).current;

  // ── Animations ─────────────────────────────────────────────────────────────

  const resetBarAnims = useCallback(() => {
    barAnims.forEach((anim, i) => anim.setValue(INITIAL_BAR_SCALES[i]));
  }, [barAnims]);

  const startWaveAnimation = useCallback(() => {
    const animations = barAnims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 1.0,
            duration: BAR_DURATIONS_MS[i],
            useNativeDriver: true,
          }),
          Animated.timing(anim, {
            toValue: 0.2,
            duration: BAR_DURATIONS_MS[i],
            useNativeDriver: true,
          }),
        ])
      )
    );
    waveAnimRef.current = Animated.parallel(animations);
    waveAnimRef.current.start();
  }, [barAnims]);

  const stopWaveAnimation = useCallback(() => {
    waveAnimRef.current?.stop();
    waveAnimRef.current = null;
    resetBarAnims();
  }, [resetBarAnims]);

  // ── Audio ──────────────────────────────────────────────────────────────────

  const cleanupSound = useCallback(async () => {
    if (!soundRef.current) return;
    try {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
    } catch {
      // best-effort; resource may already be released
    }
    soundRef.current = null;
  }, []);

  const stopPlayback = useCallback(async () => {
    stopWaveAnimation();
    await cleanupSound();
    setPlaybackState('idle');
  }, [stopWaveAnimation, cleanupSound]);

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  // When the app is backgrounded during playback: stop audio, keep modal
  // visible. When the user returns, they can replay or skip — the doctor
  // context may have changed and they shouldn't be surprised by audio resuming.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        void stopPlayback();
      }
    });
    return () => subscription.remove();
  }, [stopPlayback]);

  // Reset to idle when modal becomes visible; clean up when it's hidden.
  useEffect(() => {
    if (visible) {
      setPlaybackState('idle');
      resetBarAnims();
    } else {
      void stopPlayback();
    }
    // stopPlayback is stable (useCallback with stable deps); resetBarAnims too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      stopWaveAnimation();
      void cleanupSound();
    };
  }, [stopWaveAnimation, cleanupSound]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handlePlay = useCallback(async () => {
    try {
      // Route audio to the device's built-in speaker so the provider can
      // hear the clip from across the exam room, regardless of whether the
      // patient has Bluetooth earbuds connected or the phone is on silent.
      //
      // allowsRecordingIOS: false → Playback audio session (built-in speaker)
      // playsInSilentModeIOS: true → Override the silent/vibrate switch
      // playThroughEarpieceAndroid: false → Force speaker on Android
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });

      const { sound } = await Audio.Sound.createAsync(
        require('../assets/audio/lumi-intro.mp3'),
        { shouldPlay: true, volume: 1.0 }
      );
      soundRef.current = sound;
      setPlaybackState('playing');
      startWaveAnimation();

      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          stopWaveAnimation();
          void cleanupSound();
          setPlaybackState('idle');
          onComplete();
        }
      });
    } catch (error) {
      console.error('[ProviderIntroModal] Playback error:', error);
      setPlaybackState('idle');
    }
  }, [startWaveAnimation, stopWaveAnimation, cleanupSound, onComplete]);

  const handleStop = useCallback(async () => {
    await stopPlayback();
    onComplete();
  }, [stopPlayback, onComplete]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Icon */}
          <View style={styles.iconCircle}>
            <Ionicons name="mic-circle" size={36} color={Colors.primary} />
          </View>

          {/* Header copy */}
          <Text style={styles.title}>Introduce Lumi to your provider?</Text>
          <Text style={styles.subtitle}>
            A short clip explains what LumiMD does and reassures your provider
            that no audio is saved.
          </Text>

          {/* Volume reminder */}
          <View style={styles.volumeRow}>
            <Ionicons name="volume-high-outline" size={14} color={Colors.textMuted} />
            <Text style={styles.volumeText}>Turn up your volume so your provider can hear</Text>
          </View>

          {/* ── Idle state: Play + Skip ── */}
          {playbackState === 'idle' && (
            <>
              <Pressable
                style={styles.playButton}
                onPress={() => void handlePlay()}
                accessibilityLabel="Play LumiMD introduction for provider"
                accessibilityRole="button"
              >
                <Ionicons name="play-circle" size={22} color="#fff" />
                <Text style={styles.playButtonText}>Play Introduction</Text>
              </Pressable>

              <Pressable
                style={styles.skipButton}
                onPress={onSkip}
                accessibilityLabel="Skip introduction, provider already knows"
                accessibilityRole="button"
              >
                <Text style={styles.skipButtonText}>Skip — my provider already knows</Text>
              </Pressable>
            </>
          )}

          {/* ── Playing state: waveform + stop ── */}
          {playbackState === 'playing' && (
            <>
              <View
                style={styles.waveform}
                accessibilityLabel="Introduction audio playing"
                accessibilityRole="image"
              >
                {barAnims.map((anim, i) => (
                  <Animated.View
                    key={i}
                    style={[styles.waveBar, { transform: [{ scaleY: anim }] }]}
                  />
                ))}
              </View>

              <Text style={styles.playingText}>Playing introduction…</Text>

              <Pressable
                style={styles.stopButton}
                onPress={() => void handleStop()}
                accessibilityLabel="Stop introduction"
                accessibilityRole="button"
              >
                <Ionicons name="stop-circle-outline" size={18} color={Colors.textMuted} />
                <Text style={styles.stopButtonText}>Tap to stop</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(6),
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    paddingVertical: spacing(7),
    paddingHorizontal: spacing(6),
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: spacing(4),
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  // Header
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}18`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
    textAlign: 'center',
    lineHeight: 26,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },

  // Volume reminder
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    backgroundColor: Colors.background,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: 9999,
  },
  volumeText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },

  // Play button (primary)
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    paddingVertical: spacing(4),
    borderRadius: Radius.md,
    gap: spacing(2),
    width: '100%',
    marginTop: spacing(2),
  },
  playButtonText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: '#fff',
  },

  // Skip button (secondary text-link)
  skipButton: {
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
  },
  skipButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // Waveform animation
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    gap: spacing(1.5),
    marginTop: spacing(2),
  },
  waveBar: {
    width: 5,
    height: 36,
    borderRadius: 3,
    backgroundColor: Colors.primary,
  },

  // Playing state text
  playingText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },

  // Stop button
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1.5),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
  },
  stopButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
});
