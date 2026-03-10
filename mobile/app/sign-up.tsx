/**
 * Sign Up Screen
 * Warm aesthetic matching sign-in design
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { isAppleSignInAvailable } from '../lib/appleAuth';

import { Colors, spacing, Radius } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp, signInGoogle, signInApple, isAuthenticated, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  // Guard: if already authenticated (e.g. deep link, nav stack glitch),
  // redirect to home which handles onboarding/dashboard routing.
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/');
    }
  }, [authLoading, isAuthenticated, router]);

  const isDisabled = loading || socialLoading !== null;

  const handleGoogleSignUp = async () => {
    setError('');
    setSocialLoading('google');
    try {
      const { error: googleError } = await signInGoogle();
      if (googleError) {
        if (googleError !== 'Sign in was cancelled') setError(googleError);
        setSocialLoading(null);
        return;
      }
      router.replace('/onboarding');
    } catch {
      setError('An unexpected error occurred');
      setSocialLoading(null);
    }
  };

  const handleAppleSignUp = async () => {
    setError('');
    setSocialLoading('apple');
    try {
      const { error: appleError } = await signInApple();
      if (appleError) {
        if (appleError !== 'Sign in was cancelled') setError(appleError);
        setSocialLoading(null);
        return;
      }
      router.replace('/onboarding');
    } catch {
      setError('An unexpected error occurred');
      setSocialLoading(null);
    }
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: signUpError } = await signUp(email.trim(), password);
      if (signUpError) {
        setError(signUpError);
        setLoading(false);
        return;
      }

      router.replace('/onboarding');
    } catch (err: any) {
      console.error('[SignUp] Error:', err);
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[Colors.background, '#F5F0EA', 'rgba(126,205,181,0.08)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            {/* Brand Header */}
            <View style={styles.header}>
              <Text style={styles.logo}>Join LumiMD</Text>
              <Text style={styles.tagline}>Create your health companion</Text>
            </View>

            {/* Form Card */}
            <View style={styles.formCard}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="your@email.com"
                    placeholderTextColor={Colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    editable={!isDisabled}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="At least 6 characters"
                    placeholderTextColor={Colors.textMuted}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    editable={!isDisabled}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Re-enter password"
                    placeholderTextColor={Colors.textMuted}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="newPassword"
                    editable={!isDisabled}
                  />
                </View>
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Ionicons name="alert-circle" size={16} color={Colors.coral} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, isDisabled && styles.buttonDisabled]}
                onPress={handleSignUp}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#0A99A4', '#078A94']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.buttonGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Create Account</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              <Text style={styles.disclaimer}>
                By signing up, you agree to our Terms of Use and Privacy Policy
              </Text>
            </View>

            {/* Social Sign-Up */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or sign up with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={handleGoogleSignUp}
                disabled={isDisabled}
                activeOpacity={0.85}
              >
                {socialLoading === 'google' ? (
                  <ActivityIndicator size="small" color={Colors.text} />
                ) : (
                  <>
                    <Text style={styles.socialIcon}>G</Text>
                    <Text style={styles.socialButtonText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {appleAvailable && (
                <TouchableOpacity
                  style={[styles.socialButton, styles.appleButton]}
                  onPress={handleAppleSignUp}
                  disabled={isDisabled}
                  activeOpacity={0.85}
                >
                  {socialLoading === 'apple' ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={20} color="#fff" />
                      <Text style={[styles.socialButtonText, styles.appleButtonText]}>Apple</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Already a member?</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Footer */}
            <TouchableOpacity
              style={styles.signInButton}
              onPress={() => router.back()}
              disabled={isDisabled}
            >
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing(6),
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing(7),
  },
  logo: {
    fontSize: 40,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    marginBottom: spacing(2),
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
  },
  formCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.xl,
    padding: spacing(6),
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: 'rgba(38,35,28,0.5)',
    shadowOpacity: 0.06,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    marginBottom: spacing(6),
  },
  inputGroup: {
    marginBottom: spacing(4),
  },
  label: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    marginBottom: spacing(2),
    letterSpacing: 0.2,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceWarm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: spacing(3.5),
  },
  inputIcon: {
    marginRight: spacing(2.5),
  },
  input: {
    flex: 1,
    paddingVertical: spacing(3.5),
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: Colors.coralMuted,
    borderRadius: Radius.sm,
    padding: spacing(3),
    marginBottom: spacing(4),
  },
  errorText: {
    flex: 1,
    color: Colors.coral,
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
  },
  button: {
    borderRadius: Radius.md,
    overflow: 'hidden',
    marginBottom: spacing(3),
    shadowColor: '#0A99A4',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  buttonGradient: {
    paddingVertical: spacing(4),
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  disclaimer: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(1),
    lineHeight: 17,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(4),
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    paddingHorizontal: spacing(3),
  },
  socialRow: {
    flexDirection: 'row',
    gap: spacing(3),
    marginBottom: spacing(6),
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    paddingVertical: spacing(3.5),
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  socialIcon: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
  },
  socialButtonText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  appleButton: {
    backgroundColor: '#000',
    borderColor: '#000',
  },
  appleButtonText: {
    color: '#fff',
  },
  signInButton: {
    alignItems: 'center',
    paddingVertical: spacing(3.5),
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    backgroundColor: 'transparent',
  },
  signInText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.accent,
  },
});
