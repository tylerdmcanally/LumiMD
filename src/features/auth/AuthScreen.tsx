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
} from 'react-native';
import { useAuth } from '@/shared/context/AuthContext';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';

const formatDateOfBirthInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const normalizeDateOfBirthForSubmission = (value: string): string | null => {
  const [month = '', day = '', year = ''] = value.split('/');

  if (!/^\d{2}$/.test(month) || !/^\d{2}$/.test(day) || !/^\d{4}$/.test(year)) {
    return null;
  }

  const isoString = `${year}-${month}-${day}`;
  const parsed = new Date(isoString);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return isoString;
};

export const AuthScreen = () => {
  const { login, register, loading, error, clearError } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dateOfBirthError, setDateOfBirthError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [invitationPin, setInvitationPin] = useState('');

  const switchMode = (next: 'login' | 'register') => {
    clearError();
    setDateOfBirthError(null);
    setMode(next);
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) return;
    await login(loginEmail.trim(), loginPassword);
  };

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password) return;

    const normalizedDob = normalizeDateOfBirthForSubmission(dateOfBirth);
    if (!normalizedDob) {
      setDateOfBirthError('Enter date as MM/DD/YYYY.');
      return;
    }

    setDateOfBirthError(null);

    await register({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password,
      dateOfBirth: normalizedDob,
      phone: phone.trim() || undefined,
      invitationPin: invitationPin.trim() || undefined,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>LumiMD</Text>
          <Text style={styles.heroSubtitle}>
            Record every visit with ease. We’ll transcribe, summarize, and highlight what matters for you and the people who care for you.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.toggleContainer}>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'login' && styles.toggleButtonActive]}
              onPress={() => switchMode('login')}
              disabled={loading}
            >
              <Text style={[styles.toggleText, mode === 'login' && styles.toggleTextActive]}>Log in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, mode === 'register' && styles.toggleButtonActive]}
              onPress={() => switchMode('register')}
              disabled={loading}
            >
              <Text style={[styles.toggleText, mode === 'register' && styles.toggleTextActive]}>Create account</Text>
            </TouchableOpacity>
          </View>

          {mode === 'login' ? (
            <View style={styles.form}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={loginEmail}
                  onChangeText={setLoginEmail}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  secureTextEntry
                  value={loginPassword}
                  onChangeText={setLoginPassword}
                />
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color={COLORS.WHITE} />
                ) : (
                  <Text style={styles.primaryButtonText}>Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.inputHalf]}>
                  <Text style={styles.inputLabel}>First name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Sarah"
                    value={firstName}
                    onChangeText={setFirstName}
                  />
                </View>
                <View style={[styles.inputGroup, styles.inputHalf]}>
                  <Text style={styles.inputLabel}>Last name</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Nguyen"
                    value={lastName}
                    onChangeText={setLastName}
                  />
                </View>
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Create a secure password"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Date of birth</Text>
                <TextInput
                  style={styles.input}
                  placeholder="MM/DD/YYYY"
                  value={dateOfBirth}
                  onChangeText={(text) => {
                    const formatted = formatDateOfBirthInput(text);
                    setDateOfBirth(formatted);

                    if (dateOfBirthError && normalizeDateOfBirthForSubmission(formatted)) {
                      setDateOfBirthError(null);
                    }
                  }}
                />
                {dateOfBirthError ? <Text style={styles.inputErrorText}>{dateOfBirthError}</Text> : null}
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="(555) 555-5555"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Invitation PIN (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 6-digit PIN if you received one"
                  keyboardType="number-pad"
                  maxLength={6}
                  value={invitationPin}
                  onChangeText={setInvitationPin}
                />
                <Text style={styles.helperText}>
                  If a family member invited you to access their health info, enter their PIN code here.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={COLORS.WHITE} />
                ) : (
                  <Text style={styles.primaryButtonText}>Create account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.XL,
    justifyContent: 'center',
    gap: SIZES.XL,
  },
  scroll: {
    flex: 1,
  },
  hero: {
    gap: SIZES.SM,
  },
  heroTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.HEADING,
    color: COLORS.PRIMARY,
  },
  heroSubtitle: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 22,
  },
  card: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    gap: SIZES.LG,
    ...SIZES.SHADOW.MEDIUM,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.SECTION_BACKGROUND,
    borderRadius: SIZES.BORDER_RADIUS,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  toggleButtonActive: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    ...SIZES.SHADOW.LIGHT,
  },
  toggleText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  toggleTextActive: {
    color: COLORS.PRIMARY,
  },
  form: {
    gap: SIZES.MD,
  },
  row: {
    flexDirection: 'row',
    gap: SIZES.SM,
  },
  inputHalf: {
    flex: 1,
  },
  inputGroup: {
    gap: SIZES.XS,
  },
  inputLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.SM,
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
    backgroundColor: COLORS.WHITE,
  },
  helperText: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.XS,
    color: COLORS.SECONDARY,
    lineHeight: 16,
  },
  inputErrorText: {
    color: COLORS.DANGER,
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.XS,
  },
  primaryButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingVertical: SIZES.SM + 2,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.WHITE,
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
  },
  errorText: {
    color: COLORS.DANGER,
    fontFamily: FONTS.MEDIUM,
  },
});

export default AuthScreen;
