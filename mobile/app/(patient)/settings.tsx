import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text, ScrollView, StyleSheet, Pressable, Switch, Linking, Alert, Share, Platform, TextInput, Modal, FlatList } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, spacing, Radius, Card } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { hasPasswordProvider, linkEmailPassword } from '../../lib/auth';
import { openWebDashboard } from '../../lib/linking';
import { cfg } from '../../lib/config';
import {
  clearStoredPushToken,
  getNotificationPermissions,
  getStoredPushToken,
  getExpoPushToken,
  registerPushToken,
  setStoredPushToken,
  unregisterPushToken,
} from '../../lib/notifications';
import { api } from '../../lib/api/client';
import { useUpdateUserProfile } from '../../lib/api/mutations';
import {
  getTelemetryConsent,
  isTelemetryConfigured,
  refreshTelemetryConsentFromServer,
  setTelemetryConsent,
} from '../../lib/telemetry';

// ---------------------------------------------------------------------------
// Hour picker for quiet hours
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHourLabel(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

function QuietHourPickerModal({
  visible,
  title,
  selectedHour,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  selectedHour: number;
  onSelect: (h: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={HOURS}
            keyExtractor={(h) => String(h)}
            renderItem={({ item: h }) => (
              <Pressable
                style={[pickerStyles.hourRow, h === selectedHour && pickerStyles.hourRowSelected]}
                onPress={() => { onSelect(h); onClose(); }}
              >
                <Text style={[pickerStyles.hourText, h === selectedHour && pickerStyles.hourTextSelected]}>
                  {formatHourLabel(h)}
                </Text>
                {h === selectedHour && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '60%',
    paddingBottom: spacing(8),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke,
  },
  title: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
  },
  hourRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
  },
  hourRowSelected: {
    backgroundColor: Colors.primaryMuted,
  },
  hourText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
  },
  hourTextSelected: {
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut, availableRoles, setRoleOverride } = useAuth();
  const queryClient = useQueryClient();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [isLoadingPush, setIsLoadingPush] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [hasPassword, setHasPassword] = useState(true);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSettingPassword, setIsSettingPassword] = useState(false);

  // Notification preferences state
  const updateProfile = useUpdateUserProfile();
  const [notifPrefsLoaded, setNotifPrefsLoaded] = useState(false);
  const [medReminders, setMedReminders] = useState(true);
  const [medFollowUps, setMedFollowUps] = useState(true);
  const [actionReminders, setActionReminders] = useState(true);
  const [healthNudges, setHealthNudges] = useState(true);
  const [visitReady, setVisitReady] = useState(true);
  const [caregiverMessages, setCaregiverMessages] = useState(true);
  const [quietHoursStart, setQuietHoursStart] = useState(21);
  const [quietHoursEnd, setQuietHoursEnd] = useState(8);
  const [showQuietStartPicker, setShowQuietStartPicker] = useState(false);
  const [showQuietEndPicker, setShowQuietEndPicker] = useState(false);

  // Ref tracks latest prefs to avoid stale closures on rapid toggles
  const notifPrefsRef = useRef({
    medicationReminders: true,
    medicationFollowUps: true,
    actionReminders: true,
    healthNudges: true,
    visitReady: true,
    caregiverMessages: true,
    quietHoursStart: 21,
    quietHoursEnd: 8,
  });

  // Check if user has a password provider linked
  useEffect(() => {
    if (user) {
      setHasPassword(hasPasswordProvider());
    }
  }, [user]);

  // Check notification permission status on mount
  useEffect(() => {
    const checkPushStatus = async () => {
      try {
        const permissionStatus = await getNotificationPermissions();
        const isGranted = permissionStatus === 'granted';
        setPushEnabled(isGranted);

        if (isGranted) {
          const storedToken = await getStoredPushToken();

          if (storedToken) {
            setPushToken(storedToken);
          } else {
            // Get new token if we have permission but no stored token
            const token = await getExpoPushToken();
            if (token) {
              setPushToken(token);
              await setStoredPushToken(token);
              try {
                await registerPushToken(token);
              } catch (error) {
                console.error('[Settings] Failed to register push token:', error);
              }
            }
          }
        }
      } catch (error) {
        console.error('[Settings] Error checking push status:', error);
      }
    };

    if (user) {
      checkPushStatus();
    }
  }, [user]);

  useEffect(() => {
    let mounted = true;

    const loadAnalyticsConsent = async () => {
      try {
        if (user) {
          const remoteState = await refreshTelemetryConsentFromServer();
          if (mounted) {
            setAnalyticsEnabled(Boolean(remoteState.granted));
          }
        } else {
          const consent = await getTelemetryConsent();
          if (mounted) {
            setAnalyticsEnabled(consent);
          }
        }
      } catch (error) {
        console.error('[Settings] Error loading analytics consent from server:', error);
        try {
          const localConsent = await getTelemetryConsent();
          if (mounted) {
            setAnalyticsEnabled(localConsent);
          }
        } catch {
          if (mounted) {
            setAnalyticsEnabled(false);
          }
        }
      } finally {
        if (mounted) {
          setIsLoadingAnalytics(false);
        }
      }
    };

    loadAnalyticsConsent();

    return () => {
      mounted = false;
    };
  }, [user]);

  // Load notification preferences from profile
  useEffect(() => {
    if (notifPrefsLoaded || !user) return;
    (async () => {
      try {
        const { getIdToken } = await import('../../lib/auth');
        const token = await getIdToken();
        const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api';
        const res = await fetch(`${baseUrl}/v1/users/me`, {
          headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const profile = await res.json();
          const np = profile.notificationPreferences;
          if (np) {
            if (typeof np.medicationReminders === 'boolean') { setMedReminders(np.medicationReminders); notifPrefsRef.current.medicationReminders = np.medicationReminders; }
            if (typeof np.medicationFollowUps === 'boolean') { setMedFollowUps(np.medicationFollowUps); notifPrefsRef.current.medicationFollowUps = np.medicationFollowUps; }
            if (typeof np.actionReminders === 'boolean') { setActionReminders(np.actionReminders); notifPrefsRef.current.actionReminders = np.actionReminders; }
            if (typeof np.healthNudges === 'boolean') { setHealthNudges(np.healthNudges); notifPrefsRef.current.healthNudges = np.healthNudges; }
            if (typeof np.visitReady === 'boolean') { setVisitReady(np.visitReady); notifPrefsRef.current.visitReady = np.visitReady; }
            if (typeof np.caregiverMessages === 'boolean') { setCaregiverMessages(np.caregiverMessages); notifPrefsRef.current.caregiverMessages = np.caregiverMessages; }
            if (typeof np.quietHoursStart === 'number') { setQuietHoursStart(np.quietHoursStart); notifPrefsRef.current.quietHoursStart = np.quietHoursStart; }
            if (typeof np.quietHoursEnd === 'number') { setQuietHoursEnd(np.quietHoursEnd); notifPrefsRef.current.quietHoursEnd = np.quietHoursEnd; }
          }
        }
      } catch {
        // Use defaults
      }
      setNotifPrefsLoaded(true);
    })();
  }, [notifPrefsLoaded, user]);

  // Save notification preference (sends full object to avoid partial overwrites)
  const saveNotifPref = useCallback(
    (field: string, value: boolean | number) => {
      (notifPrefsRef.current as any)[field] = value;
      updateProfile.mutate({ notificationPreferences: { ...notifPrefsRef.current } } as any);
    },
    [updateProfile],
  );

  const handlePushToggle = async (enabled: boolean) => {
    setIsLoadingPush(true);
    try {
      if (enabled) {
        // Enable push notifications
        const token = await getExpoPushToken();
        if (token) {
          setPushToken(token);
          await setStoredPushToken(token);
          await registerPushToken(token);
          setPushEnabled(true);
        } else {
          Alert.alert(
            'Permission Required',
            'Please enable notifications in your device settings to receive push notifications.',
          );
          setPushEnabled(false);
        }
      } else {
        // Disable push notifications
        if (pushToken) {
          try {
            await unregisterPushToken(pushToken);
          } catch (error) {
            console.error('[Settings] Error unregistering push token:', error);
          }
        }
        await clearStoredPushToken();
        setPushToken(null);
        setPushEnabled(false);
      }
    } catch (error) {
      console.error('[Settings] Error toggling push notifications:', error);
      Alert.alert('Error', 'Failed to update notification settings. Please try again.');
      // Revert toggle state on error
      setPushEnabled(!enabled);
    } finally {
      setIsLoadingPush(false);
    }
  };

  const handleAnalyticsToggle = async (enabled: boolean) => {
    if (enabled && !isTelemetryConfigured()) {
      Alert.alert(
        'Unavailable in this build',
        'Privacy-safe analytics are disabled unless this build is explicitly configured for analytics.',
      );
      return;
    }

    const previous = analyticsEnabled;
    setAnalyticsEnabled(enabled);
    try {
      await setTelemetryConsent(enabled, {
        syncRemote: true,
        source: 'settings_toggle',
        platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
      });
    } catch (error) {
      console.error('[Settings] Error updating analytics consent:', error);
      setAnalyticsEnabled(previous);
      Alert.alert('Update failed', 'Unable to save analytics preference. Please try again.');
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            // Token cleanup is now handled centrally in AuthContext.signOut()
            setPushToken(null);
            setPushEnabled(false);
            await signOut();
            router.replace('/sign-in');
          },
        },
      ]
    );
  };

  const handleSetPassword = async () => {
    if (!newPassword.trim() || !confirmNewPassword.trim()) {
      Alert.alert('Required', 'Please fill in both password fields.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters.');
      return;
    }

    const email = user?.email;
    if (!email) {
      Alert.alert('No email', 'Your account does not have an email address. Please contact support.');
      return;
    }

    setIsSettingPassword(true);
    const { error } = await linkEmailPassword(email, newPassword);
    setIsSettingPassword(false);

    if (error) {
      Alert.alert('Unable to set password', error);
    } else {
      setHasPassword(true);
      setShowSetPassword(false);
      setNewPassword('');
      setConfirmNewPassword('');
      Alert.alert(
        'Password set!',
        `You can now sign in to the web portal at lumimd.app with ${email} and your new password.`,
      );
    }
  };

  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  const handleExportData = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to export your data.');
      return;
    }
    setIsExporting(true);
    try {
      const data = await api.user.exportData();
      const json = JSON.stringify(data, null, 2);
      await Share.share({
        message: json,
        title: 'LumiMD Data Export',
      });
    } catch (error) {
      console.error('[Settings] Export failed', error);
      Alert.alert('Export failed', 'Unable to export your data right now. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportProviderReport = async () => {
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to export your report.');
      return;
    }
    setIsExportingReport(true);
    let downloadedUri: string | null = null;
    try {
      const baseUrl = cfg.apiBaseUrl;

      const token = await user.getIdToken(true);

      // Download PDF from API directly to file (avoids base64 conversion on RN)
      const fileName = `LumiMD-Health-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
      // Use cache to avoid persisting PHI on-device; we delete after share.
      const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!dir) {
        throw new Error('No writable directory available');
      }
      const fileUri = dir + fileName;
      const response = await FileSystem.downloadAsync(
        `${baseUrl}/v1/health-logs/provider-report`,
        fileUri,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/pdf',
          },
        }
      );

      if (response.status !== 200) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      downloadedUri = response.uri ?? fileUri;

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(downloadedUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Health Report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Sharing not available', 'Unable to share files on this device.');
      }
    } catch (error) {
      console.error('[Settings] Provider report export failed', error);
      Alert.alert('Export failed', 'Unable to generate provider report. Please try again.');
    } finally {
      if (downloadedUri) {
        try {
          await FileSystem.deleteAsync(downloadedUri, { idempotent: true });
        } catch {}
      }
      setIsExportingReport(false);
    }
  };

  const handleDeleteAccount = () => {
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to delete your account.');
      return;
    }

    Alert.alert(
      'Delete Account',
      'This will permanently delete your visits, medications, action items, and caregiver access. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await api.user.deleteAccount();
              await signOut();
              router.replace('/sign-in');
            } catch (error) {
              console.error('[Settings] Delete account failed', error);
              Alert.alert('Delete failed', 'Unable to delete your account. Please try again.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Account Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account</Text>

            <Card style={styles.card}>
              <View style={styles.accountInfo}>
                <View style={styles.avatar}>
                  <Ionicons name="person" size={32} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.accountName}>
                    {user?.displayName || 'User Account'}
                  </Text>
                  <Text style={styles.accountEmail}>
                    {user?.email || 'No email'}
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          {/* Web Access Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Web Access</Text>

            <Card style={styles.card}>
              <Pressable
                style={styles.linkRow}
                onPress={() => openWebDashboard()}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="globe-outline" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkLabel, { marginLeft: 0 }]}>Open Web Portal</Text>
                  <Text style={styles.settingDescription}>
                    View your dashboard in the browser
                  </Text>
                </View>
                <Ionicons name="open-outline" size={20} color={Colors.textMuted} />
              </Pressable>

              {!hasPassword && (
                <>
                  <View style={styles.divider} />

                  {!showSetPassword ? (
                    <Pressable
                      style={styles.linkRow}
                      onPress={() => setShowSetPassword(true)}
                    >
                      <View style={styles.settingIcon}>
                        <Ionicons name="key-outline" size={22} color={Colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.linkLabel, { marginLeft: 0 }]}>Set Password for Web</Text>
                        <Text style={styles.settingDescription}>
                          Add a password so you can sign in directly on the web
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                    </Pressable>
                  ) : (
                    <View style={styles.setPasswordContainer}>
                      <Text style={styles.setPasswordLabel}>
                        Set a password for {user?.email}
                      </Text>
                      {user?.email?.includes('privaterelay.appleid.com') && (
                        <Text style={[styles.setPasswordLabel, { color: Colors.coral, marginBottom: spacing(2) }]}>
                          Note: This is your Apple private relay email. You'll need to use this exact address to sign in on the web.
                        </Text>
                      )}
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="New password"
                        placeholderTextColor={Colors.textMuted}
                        secureTextEntry
                        value={newPassword}
                        onChangeText={setNewPassword}
                        autoCapitalize="none"
                      />
                      <TextInput
                        style={styles.passwordInput}
                        placeholder="Confirm password"
                        placeholderTextColor={Colors.textMuted}
                        secureTextEntry
                        value={confirmNewPassword}
                        onChangeText={setConfirmNewPassword}
                        autoCapitalize="none"
                      />
                      <View style={styles.setPasswordButtons}>
                        <Pressable
                          style={styles.cancelButton}
                          onPress={() => {
                            setShowSetPassword(false);
                            setNewPassword('');
                            setConfirmNewPassword('');
                          }}
                        >
                          <Text style={styles.cancelButtonText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.saveButton, isSettingPassword && { opacity: 0.5 }]}
                          onPress={handleSetPassword}
                          disabled={isSettingPassword}
                        >
                          <Text style={styles.saveButtonText}>
                            {isSettingPassword ? 'Setting...' : 'Set Password'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  )}
                </>
              )}
            </Card>
          </View>

          {/* Preferences Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>

            <Card style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingIcon}>
                  <Ionicons name="notifications" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Push Notifications</Text>
                  <Text style={styles.settingDescription}>
                    Get notified when your visit summary is ready
                  </Text>
                </View>
                <Switch
                  value={pushEnabled}
                  onValueChange={handlePushToggle}
                  disabled={isLoadingPush}
                  trackColor={{ false: '#d1d5db', true: Colors.accent }}
                  thumbColor={pushEnabled ? Colors.primary : '#f3f4f6'}
                />
              </View>

              <View style={styles.divider} />

              <Pressable
                style={styles.linkRow}
                onPress={() => router.replace('/caregiver-sharing')}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="people-outline" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkLabel, { marginLeft: 0 }]}>Caregiver Sharing</Text>
                  <Text style={styles.settingDescription}>
                    Share your health info with family
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>
            </Card>
          </View>

          {/* Notification Preferences — Reminders */}
          {pushEnabled && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Reminders</Text>
              <Card style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}>
                    <Ionicons name="alarm-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Medication Reminders</Text>
                    <Text style={styles.settingDescription}>
                      Reminders when it's time to take your medications
                    </Text>
                  </View>
                  <Switch
                    value={medReminders}
                    onValueChange={(val) => { setMedReminders(val); saveNotifPref('medicationReminders', val); if (!val) { setMedFollowUps(false); saveNotifPref('medicationFollowUps', false); } }}
                    trackColor={{ false: '#d1d5db', true: Colors.accent }}
                    thumbColor={medReminders ? Colors.primary : '#f3f4f6'}
                  />
                </View>

                {medReminders && (
                  <>
                    <View style={styles.divider} />
                    <View style={[styles.settingRow, { paddingLeft: spacing(4) + 36 + spacing(3) }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.settingLabel}>Dose Follow-ups</Text>
                        <Text style={styles.settingDescription}>
                          Check-in if you haven't logged a dose
                        </Text>
                      </View>
                      <Switch
                        value={medFollowUps}
                        onValueChange={(val) => { setMedFollowUps(val); saveNotifPref('medicationFollowUps', val); }}
                        trackColor={{ false: '#d1d5db', true: Colors.accent }}
                        thumbColor={medFollowUps ? Colors.primary : '#f3f4f6'}
                      />
                    </View>
                  </>
                )}

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}>
                    <Ionicons name="clipboard-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Action Item Reminders</Text>
                    <Text style={styles.settingDescription}>
                      Due dates for follow-ups, lab work, and referrals
                    </Text>
                  </View>
                  <Switch
                    value={actionReminders}
                    onValueChange={(val) => { setActionReminders(val); saveNotifPref('actionReminders', val); }}
                    trackColor={{ false: '#d1d5db', true: Colors.accent }}
                    thumbColor={actionReminders ? Colors.primary : '#f3f4f6'}
                  />
                </View>
              </Card>
            </View>
          )}

          {/* Notification Preferences — Updates */}
          {pushEnabled && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Updates</Text>
              <Card style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}>
                    <Ionicons name="pulse-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Health Check-ins</Text>
                    <Text style={styles.settingDescription}>
                      Periodic check-ins about your conditions and medications
                    </Text>
                  </View>
                  <Switch
                    value={healthNudges}
                    onValueChange={(val) => { setHealthNudges(val); saveNotifPref('healthNudges', val); }}
                    trackColor={{ false: '#d1d5db', true: Colors.accent }}
                    thumbColor={healthNudges ? Colors.primary : '#f3f4f6'}
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}>
                    <Ionicons name="document-text-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Visit Summaries</Text>
                    <Text style={styles.settingDescription}>
                      When your visit summary is ready to view
                    </Text>
                  </View>
                  <Switch
                    value={visitReady}
                    onValueChange={(val) => { setVisitReady(val); saveNotifPref('visitReady', val); }}
                    trackColor={{ false: '#d1d5db', true: Colors.accent }}
                    thumbColor={visitReady ? Colors.primary : '#f3f4f6'}
                  />
                </View>

                <View style={styles.divider} />

                <View style={styles.settingRow}>
                  <View style={styles.settingIcon}>
                    <Ionicons name="chatbubble-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Caregiver Messages</Text>
                    <Text style={styles.settingDescription}>
                      Messages from your caregiver
                    </Text>
                  </View>
                  <Switch
                    value={caregiverMessages}
                    onValueChange={(val) => { setCaregiverMessages(val); saveNotifPref('caregiverMessages', val); }}
                    trackColor={{ false: '#d1d5db', true: Colors.accent }}
                    thumbColor={caregiverMessages ? Colors.primary : '#f3f4f6'}
                  />
                </View>
              </Card>
            </View>
          )}

          {/* Notification Preferences — Schedule */}
          {pushEnabled && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Schedule</Text>
              <Card style={styles.card}>
                <Pressable
                  style={styles.settingRow}
                  onPress={() => setShowQuietStartPicker(true)}
                >
                  <View style={styles.settingIcon}>
                    <Ionicons name="moon-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Quiet Hours</Text>
                    <Text style={styles.settingDescription}>
                      {formatHourLabel(quietHoursStart)} – {formatHourLabel(quietHoursEnd)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </Pressable>
              </Card>
            </View>
          )}

          {!pushEnabled && (
            <View style={styles.section}>
              <Card style={[styles.card, { padding: spacing(4) }]}>
                <Text style={[styles.settingDescription, { textAlign: 'center' }]}>
                  Enable push notifications above to configure individual alerts
                </Text>
              </Card>
            </View>
          )}

          {/* Legal Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Legal</Text>

            <Card style={styles.card}>
              <Pressable
                style={styles.linkRow}
                onPress={() => openLink('https://lumimd.app/terms')}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="document-text-outline" size={22} color={Colors.textMuted} />
                </View>
                <Text style={styles.linkLabel}>Terms of Service</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                style={styles.linkRow}
                onPress={() => openLink('https://lumimd.app/privacy')}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="shield-checkmark-outline" size={22} color={Colors.textMuted} />
                </View>
                <Text style={styles.linkLabel}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>
            </Card>
          </View>

          {/* Data & Privacy */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data & Privacy</Text>
            <Card style={styles.card}>
              <Pressable
                style={styles.linkRow}
                onPress={handleExportData}
                disabled={isExporting}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="download-outline" size={22} color={Colors.textMuted} />
                </View>
                <Text style={styles.linkLabel}>
                  {isExporting ? 'Preparing export…' : 'Export my data'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                style={styles.linkRow}
                onPress={handleExportProviderReport}
                disabled={isExportingReport}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="document-attach-outline" size={22} color={Colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.linkLabel, { marginLeft: 0 }]}>
                    {isExportingReport ? 'Generating report…' : 'Provider Health Report'}
                  </Text>
                  <Text style={styles.settingDescription}>
                    PDF report for your healthcare provider
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>

              <View style={styles.divider} />

              <Pressable
                style={styles.linkRow}
                onPress={handleDeleteAccount}
                disabled={isDeleting}
              >
                <View style={styles.settingIcon}>
                  <Ionicons name="trash-outline" size={22} color={Colors.error} />
                </View>
                <Text style={[styles.linkLabel, { color: Colors.error }]}>
                  {isDeleting ? 'Deleting account…' : 'Delete account'}
                </Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
              </Pressable>
            </Card>
          </View>

          {/* Role Switch (dual-role users) */}
          {availableRoles && availableRoles.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Experience</Text>
              <Card style={styles.card}>
                <Pressable
                  style={styles.linkRow}
                  onPress={() => {
                    Alert.alert(
                      'Switch to Caregiver',
                      "You'll switch to the caregiver experience.",
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Switch',
                          onPress: () => {
                            queryClient.clear();
                            setRoleOverride('caregiver');
                            router.replace('/');
                          },
                        },
                      ],
                    );
                  }}
                >
                  <View style={styles.settingIcon}>
                    <Ionicons name="swap-horizontal-outline" size={22} color={Colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.linkLabel, { marginLeft: 0 }]}>Switch to Caregiver</Text>
                    <Text style={styles.settingDescription}>
                      You have both roles on this account
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
                </Pressable>
              </Card>
            </View>
          )}

          {/* Sign Out */}
          <View style={styles.section}>
            <Pressable
              style={styles.signOutButton}
              onPress={handleSignOut}
            >
              <Ionicons name="log-out-outline" size={22} color={Colors.error} />
              <Text style={styles.signOutText}>Sign Out</Text>
            </Pressable>
          </View>

          {/* Medical Disclaimer (Tier 1) */}
          <View style={styles.disclaimerSection}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textMuted} style={{ marginBottom: spacing(1) }} />
            <Text style={styles.disclaimerText}>
              LumiMD is not intended to be a substitute for professional medical advice, diagnosis, or treatment.
            </Text>
          </View>

          {/* App Version */}
          <View style={styles.versionSection}>
            <Text style={styles.versionText}>LumiMD v1.0.0</Text>
          </View>
        </ScrollView>
      </View >

      <QuietHourPickerModal
        visible={showQuietStartPicker}
        title="Quiet Hours Start"
        selectedHour={quietHoursStart}
        onSelect={(h) => {
          setQuietHoursStart(h);
          saveNotifPref('quietHoursStart', h);
          // After selecting start, open end picker
          setTimeout(() => setShowQuietEndPicker(true), 300);
        }}
        onClose={() => setShowQuietStartPicker(false)}
      />
      <QuietHourPickerModal
        visible={showQuietEndPicker}
        title="Quiet Hours End"
        selectedHour={quietHoursEnd}
        onSelect={(h) => {
          setQuietHoursEnd(h);
          saveNotifPref('quietHoursEnd', h);
        }}
        onClose={() => setShowQuietEndPicker(false)}
      />
    </SafeAreaView >
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing(5),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(4),
  },
  backButton: {
    padding: spacing(1),
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: 'Fraunces_600SemiBold',
    color: Colors.text,
    letterSpacing: -0.2,
  },
  section: {
    marginBottom: spacing(6),
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing(3),
  },
  card: {
    padding: 0,
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(4),
  },
  accountName: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    marginBottom: spacing(1),
  },
  accountEmail: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
  },
  linkLabel: {
    flex: 1,
    fontSize: 16,
    color: Colors.text,
    marginLeft: spacing(3),
  },
  divider: {
    height: 1,
    backgroundColor: Colors.stroke,
    marginLeft: spacing(4) + 36 + spacing(3),
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(4),
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  signOutText: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.error,
    marginLeft: spacing(2),
  },
  disclaimerSection: {
    alignItems: 'center',
    paddingHorizontal: spacing(6),
    paddingTop: spacing(4),
  },
  disclaimerText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  versionSection: {
    alignItems: 'center',
    paddingVertical: spacing(8),
  },
  versionText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  setPasswordContainer: {
    padding: spacing(4),
  },
  setPasswordLabel: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: spacing(3),
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: Colors.stroke,
    borderRadius: Radius.md,
    padding: spacing(3),
    fontSize: 16,
    color: Colors.text,
    marginBottom: spacing(3),
    backgroundColor: Colors.background,
  },
  setPasswordButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(3),
    marginTop: spacing(1),
  },
  cancelButton: {
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(4),
    borderRadius: Radius.md,
  },
  cancelButtonText: {
    fontSize: 15,
    color: Colors.textMuted,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  saveButton: {
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(4),
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  saveButtonText: {
    fontSize: 15,
    color: '#fff',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});
