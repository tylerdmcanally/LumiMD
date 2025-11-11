/**
 * Forgot Password Screen
 * Send password reset email
 */

import React, { useState } from 'react';
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing } from '../components/ui';
import { resetPassword } from '../lib/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleResetPassword = async () => {
    // Validation
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const { error: resetError } = await resetPassword(email.trim());
      
      if (resetError) {
        setError('Failed to send reset email. Please try again.');
        setLoading(false);
        return;
      }

      // Success
      setSuccess(true);
      setLoading(false);
      
      Alert.alert(
        'Email Sent',
        'Check your email (including spam folder) for a link to reset your password. The link may need to be copied and pasted into your browser.',
        [
          {
            text: 'OK',
            onPress: () => router.back(),
          },
        ]
      );
    } catch (err: any) {
      console.error('[ForgotPassword] Error:', err);
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView 
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
              disabled={loading}
            >
              <Ionicons name="chevron-back" size={28} color={Colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Enter your email address and we'll send you a link to reset your password.
            </Text>

            {/* Form */}
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email</Text>
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
                  editable={!loading && !success}
                />
              </View>

              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              {success ? (
                <View style={styles.successContainer}>
                  <Ionicons name="checkmark-circle" size={24} color="#10B981" />
                  <Text style={styles.successText}>
                    Reset email sent! Check your inbox.
                  </Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.button, (loading || success) && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading || success}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Send Reset Email</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing(6),
  },
  header: {
    paddingTop: spacing(2),
    marginBottom: spacing(4),
  },
  backButton: {
    padding: spacing(1),
    marginLeft: -spacing(1),
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: spacing(2),
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    lineHeight: 24,
    marginBottom: spacing(8),
  },
  form: {
    marginBottom: spacing(6),
  },
  inputGroup: {
    marginBottom: spacing(4),
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(2),
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: Colors.text,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: spacing(3),
    marginBottom: spacing(4),
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
  },
  successContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    padding: spacing(3),
    marginBottom: spacing(4),
  },
  successText: {
    color: '#059669',
    fontSize: 14,
    marginLeft: spacing(2),
    flex: 1,
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: spacing(4),
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

