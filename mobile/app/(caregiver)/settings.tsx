import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  Switch,
  Modal,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, spacing, Radius, Card } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import { useCareOverview } from '../../lib/api/hooks';
import { useUpdateUserProfile } from '../../lib/api/mutations';

// ---------------------------------------------------------------------------
// Reusable SettingsRow
// ---------------------------------------------------------------------------

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  destructive,
  rightElement,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  rightElement?: React.ReactNode;
}) {
  return (
    <Pressable style={rowStyles.container} onPress={onPress} disabled={!onPress && !rightElement}>
      <View style={[rowStyles.iconContainer, destructive && { backgroundColor: `${Colors.error}15` }]}>
        <Ionicons name={icon} size={18} color={destructive ? Colors.error : Colors.primary} />
      </View>
      <View style={rowStyles.content}>
        <Text style={[rowStyles.label, destructive && { color: Colors.error }]}>{label}</Text>
        {value ? <Text style={rowStyles.value}>{value}</Text> : null}
      </View>
      {rightElement ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} /> : null)}
    </Pressable>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(3),
  },
  content: { flex: 1 },
  label: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.text,
  },
  value: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    marginTop: 1,
  },
});

// ---------------------------------------------------------------------------
// Hour Picker Modal
// ---------------------------------------------------------------------------

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  if (h === 0) return '12:00 AM';
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return '12:00 PM';
  return `${h - 12}:00 PM`;
}

function HourPickerModal({
  visible,
  selectedHour,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedHour: number;
  onSelect: (h: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={pickerStyles.overlay}>
        <View style={pickerStyles.sheet}>
          <View style={pickerStyles.header}>
            <Text style={pickerStyles.title}>Briefing Time</Text>
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
                  {formatHour(h)}
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
    borderBottomColor: Colors.borderSubtle,
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

// ---------------------------------------------------------------------------
// Main Settings Screen
// ---------------------------------------------------------------------------

export default function CaregiverSettingsScreen() {
  const router = useRouter();
  const { user, signOut, role, availableRoles, setRoleOverride } = useAuth();
  const queryClient = useQueryClient();
  const { data: overview } = useCareOverview();
  const updateProfile = useUpdateUserProfile();

  const patients = overview?.patients ?? [];

  // Notification preference state (loaded from profile, saved on change)
  const [briefingEnabled, setBriefingEnabled] = useState(true);
  const [briefingHour, setBriefingHour] = useState(8);
  const [alertMissedMeds, setAlertMissedMeds] = useState(true);
  const [alertVisitReady, setAlertVisitReady] = useState(true);
  const [alertOverdueActions, setAlertOverdueActions] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showHourPicker, setShowHourPicker] = useState(false);

  // Ref tracks latest alert preference values to avoid stale closures on rapid toggles
  const alertPrefsRef = useRef({ missedMedications: true, visitReady: true, overdueActions: true });

  // Load preferences from profile on mount
  useEffect(() => {
    if (prefsLoaded) return;
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
          if (typeof profile.briefingEnabled === 'boolean') setBriefingEnabled(profile.briefingEnabled);
          if (typeof profile.briefingHour === 'number') setBriefingHour(profile.briefingHour);
          if (profile.alertPreferences) {
            const ap = profile.alertPreferences;
            if (typeof ap.missedMedications === 'boolean') { setAlertMissedMeds(ap.missedMedications); alertPrefsRef.current.missedMedications = ap.missedMedications; }
            if (typeof ap.visitReady === 'boolean') { setAlertVisitReady(ap.visitReady); alertPrefsRef.current.visitReady = ap.visitReady; }
            if (typeof ap.overdueActions === 'boolean') { setAlertOverdueActions(ap.overdueActions); alertPrefsRef.current.overdueActions = ap.overdueActions; }
          }
        }
      } catch {
        // Use defaults
      }
      setPrefsLoaded(true);
    })();
  }, [prefsLoaded]);

  // Persist a preference change to the profile
  const savePref = useCallback(
    (update: Record<string, unknown>) => {
      updateProfile.mutate(update as any);
    },
    [updateProfile],
  );

  const handleBriefingToggle = useCallback(
    (val: boolean) => {
      setBriefingEnabled(val);
      savePref({ briefingEnabled: val });
    },
    [savePref],
  );

  const handleBriefingHour = useCallback(
    (hour: number) => {
      setBriefingHour(hour);
      savePref({ briefingHour: hour });
    },
    [savePref],
  );

  const handleAlertMissedMeds = useCallback(
    (val: boolean) => {
      setAlertMissedMeds(val);
      alertPrefsRef.current.missedMedications = val;
      savePref({ alertPreferences: { ...alertPrefsRef.current } });
    },
    [savePref],
  );

  const handleAlertVisitReady = useCallback(
    (val: boolean) => {
      setAlertVisitReady(val);
      alertPrefsRef.current.visitReady = val;
      savePref({ alertPreferences: { ...alertPrefsRef.current } });
    },
    [savePref],
  );

  const handleAlertOverdueActions = useCallback(
    (val: boolean) => {
      setAlertOverdueActions(val);
      alertPrefsRef.current.overdueActions = val;
      savePref({ alertPreferences: { ...alertPrefsRef.current } });
    },
    [savePref],
  );

  // Role switching (5c)
  const canSwitchRole = availableRoles && availableRoles.length > 1;
  const otherRole = role === 'caregiver' ? 'patient' : 'caregiver';

  const handleRoleSwitch = useCallback(() => {
    Alert.alert(
      `Switch to ${otherRole === 'patient' ? 'Patient' : 'Caregiver'}`,
      `You'll switch to the ${otherRole} experience.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: () => {
            queryClient.clear();
            setRoleOverride(otherRole);
            router.replace('/');
          },
        },
      ],
    );
  }, [otherRole, queryClient, setRoleOverride, router]);

  const handleSignOut = useCallback(() => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/');
        },
      },
    ]);
  }, [signOut, router]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Account section */}
        <Text style={styles.sectionTitle}>Account</Text>
        <Card style={styles.sectionCard}>
          <SettingsRow
            icon="person-outline"
            label={user?.displayName ?? 'Caregiver'}
            value={user?.email ?? undefined}
          />
        </Card>

        {/* Notification Preferences */}
        <Text style={styles.sectionTitle}>Notifications</Text>
        <Card style={styles.sectionCard}>
          <SettingsRow
            icon="sunny-outline"
            label="Daily Briefing"
            value={briefingEnabled ? `Enabled · ${formatHour(briefingHour)}` : 'Disabled'}
            rightElement={
              <Switch
                value={briefingEnabled}
                onValueChange={handleBriefingToggle}
                trackColor={{ true: Colors.primary, false: Colors.borderSubtle }}
              />
            }
          />
          {briefingEnabled && (
            <SettingsRow
              icon="time-outline"
              label="Briefing Time"
              value={formatHour(briefingHour)}
              onPress={() => setShowHourPicker(true)}
            />
          )}
          <SettingsRow
            icon="medkit-outline"
            label="Missed Medications"
            rightElement={
              <Switch
                value={alertMissedMeds}
                onValueChange={handleAlertMissedMeds}
                trackColor={{ true: Colors.primary, false: Colors.borderSubtle }}
              />
            }
          />
          <SettingsRow
            icon="document-text-outline"
            label="Visit Ready"
            rightElement={
              <Switch
                value={alertVisitReady}
                onValueChange={handleAlertVisitReady}
                trackColor={{ true: Colors.primary, false: Colors.borderSubtle }}
              />
            }
          />
          <SettingsRow
            icon="alert-circle-outline"
            label="Overdue Actions"
            rightElement={
              <Switch
                value={alertOverdueActions}
                onValueChange={handleAlertOverdueActions}
                trackColor={{ true: Colors.primary, false: Colors.borderSubtle }}
              />
            }
          />
        </Card>

        {/* Linked Patients */}
        <Text style={styles.sectionTitle}>Linked Patients</Text>
        <Card style={styles.sectionCard}>
          {patients.length > 0 ? (
            patients.map((p) => (
              <SettingsRow
                key={p.patientId}
                icon="people-outline"
                label={p.patientName}
                value={`${p.medicationsToday.taken}/${p.medicationsToday.total} meds today`}
              />
            ))
          ) : (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>No linked patients</Text>
            </View>
          )}
        </Card>

        {/* Role Switch */}
        {canSwitchRole && (
          <>
            <Text style={styles.sectionTitle}>Experience</Text>
            <Card style={styles.sectionCard}>
              <SettingsRow
                icon="swap-horizontal-outline"
                label={`Switch to ${otherRole === 'patient' ? 'Patient' : 'Caregiver'}`}
                value="You have both roles on this account"
                onPress={handleRoleSwitch}
              />
            </Card>
          </>
        )}

        {/* Sign Out */}
        <Card style={styles.sectionCard}>
          <SettingsRow
            icon="log-out-outline"
            label="Sign Out"
            onPress={handleSignOut}
            destructive
          />
        </Card>
      </ScrollView>

      <HourPickerModal
        visible={showHourPicker}
        selectedHour={briefingHour}
        onSelect={handleBriefingHour}
        onClose={() => setShowHourPicker(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(8),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing(2),
    marginBottom: spacing(4),
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: spacing(2),
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing(2),
    marginTop: spacing(4),
  },
  sectionCard: {
    marginBottom: spacing(2),
  },
  emptyRow: {
    paddingVertical: spacing(3),
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
  },
});
