import React, { useCallback, useMemo } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../../components/ui';
import { PatientStatusCard } from '../../components/caregiver/PatientStatusCard';
import { AlertBanner } from '../../components/caregiver/AlertBanner';
import { useAuth } from '../../contexts/AuthContext';
import { useCareOverview, CareOverviewPatient } from '../../lib/api/hooks';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Build a short briefing digest string from overview data (matches push notification format). */
function buildBriefingDigest(patients: CareOverviewPatient[]): string {
  if (patients.length === 0) return '';
  const parts: string[] = [];
  for (const p of patients) {
    const name = (p.patientName ?? 'Patient').split(' ')[0]; // first name only
    const taken = p.medicationsToday?.taken ?? 0;
    const total = p.medicationsToday?.total ?? 0;
    const medPart = total > 0 ? `${name} took ${taken}/${total} meds` : null;
    const pending = p.pendingActions ?? 0;
    const actionPart = pending > 0
      ? `${pending} pending action${pending > 1 ? 's' : ''}`
      : null;
    if (medPart && actionPart) {
      parts.push(`${medPart}, ${actionPart}`);
    } else if (medPart) {
      parts.push(medPart);
    } else if (actionPart) {
      parts.push(`${name}: ${actionPart}`);
    } else {
      parts.push(`${name}: all clear`);
    }
  }
  return parts.join('. ') + '.';
}

function BriefingCard({ patients }: { patients: CareOverviewPatient[] }) {
  const digest = useMemo(() => buildBriefingDigest(patients), [patients]);
  if (!digest) return null;

  // Count totals for the summary row
  const totalMedsTaken = patients.reduce((s, p) => s + (p.medicationsToday?.taken ?? 0), 0);
  const totalMedsTotal = patients.reduce((s, p) => s + (p.medicationsToday?.total ?? 0), 0);
  const totalPending = patients.reduce((s, p) => s + (p.pendingActions ?? 0), 0);

  return (
    <Card style={briefingStyles.card}>
      <View style={briefingStyles.header}>
        <View style={briefingStyles.iconCircle}>
          <Ionicons name="sunny-outline" size={18} color={Colors.primary} />
        </View>
        <Text style={briefingStyles.title}>Today's Briefing</Text>
      </View>
      <Text style={briefingStyles.digest}>{digest}</Text>
      <View style={briefingStyles.statsRow}>
        <View style={briefingStyles.stat}>
          <Text style={briefingStyles.statValue}>
            {totalMedsTotal > 0 ? `${totalMedsTaken}/${totalMedsTotal}` : '—'}
          </Text>
          <Text style={briefingStyles.statLabel}>Meds taken</Text>
        </View>
        <View style={briefingStyles.statDivider} />
        <View style={briefingStyles.stat}>
          <Text style={briefingStyles.statValue}>{totalPending}</Text>
          <Text style={briefingStyles.statLabel}>Pending actions</Text>
        </View>
        <View style={briefingStyles.statDivider} />
        <View style={briefingStyles.stat}>
          <Text style={briefingStyles.statValue}>{patients.length}</Text>
          <Text style={briefingStyles.statLabel}>{patients.length === 1 ? 'Patient' : 'Patients'}</Text>
        </View>
      </View>
    </Card>
  );
}

const briefingStyles = StyleSheet.create({
  card: {
    marginBottom: spacing(5),
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing(2),
  },
  title: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
  },
  digest: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing(3),
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: Radius.md,
    padding: spacing(3),
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.borderSubtle,
  },
});

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    data: overview,
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useCareOverview();

  const patients = overview?.patients ?? [];

  // Aggregate all alerts across patients, sorted by severity
  const aggregatedAlerts = useMemo(() => {
    const all: Array<CareOverviewPatient['alerts'][number] & { patientId: string; patientName: string }> = [];
    for (const patient of patients) {
      if (patient.alerts) {
        for (const alert of patient.alerts) {
          all.push({
            ...alert,
            patientId: patient.patientId,
            patientName: patient.patientName,
          });
        }
      }
    }
    const severityOrder = { high: 0, medium: 1, low: 2 };
    all.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));
    return all;
  }, [patients]);

  const needsAttentionAlerts = useMemo(
    () => aggregatedAlerts.filter((a) => a.severity === 'high' || a.severity === 'medium'),
    [aggregatedAlerts],
  );

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handlePatientPress = useCallback(
    (patientId: string) => {
      // Phase 4 will add the patient detail screen; for now navigate to placeholder
      router.push(`/(caregiver)/patient/${patientId}` as any);
    },
    [router],
  );

  const handleAlertPress = useCallback(
    (patientId: string) => {
      router.push(`/(caregiver)/patient/${patientId}` as any);
    },
    [router],
  );

  const handleSettingsPress = useCallback(() => {
    router.push('/(caregiver)/settings' as any);
  }, [router]);

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Display name
  const displayName = user?.displayName?.split(' ')[0] ?? '';
  const greeting = displayName
    ? `${getGreeting()}, ${displayName}`
    : getGreeting();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.subtitle}>Here's how your patients are doing today</Text>
          </View>
          <Pressable onPress={handleSettingsPress} hitSlop={12}>
            <Ionicons name="settings-outline" size={24} color={Colors.textMuted} />
          </Pressable>
        </View>

        {/* Error state */}
        {error && (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={20} color={Colors.error} />
            <Text style={styles.errorText}>Unable to load data. Pull to retry.</Text>
          </View>
        )}

        {/* Daily Briefing Card */}
        {!error && patients.length > 0 && (
          <BriefingCard patients={patients} />
        )}

        {/* Empty state */}
        {!error && patients.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="people-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No patients yet</Text>
            <Text style={styles.emptySubtitle}>
              Once your patient accepts the invitation, their data will appear here.
            </Text>
          </View>
        )}

        {/* Needs Attention section */}
        {needsAttentionAlerts.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs Attention</Text>
            {needsAttentionAlerts.map((alert, index) => (
              <AlertBanner
                key={`${alert.patientId}-${alert.type}-${index}`}
                type={alert.type}
                severity={alert.severity}
                title={alert.title}
                description={alert.description}
                patientName={alert.patientName}
                timestamp={alert.timestamp}
                onPress={() => handleAlertPress(alert.patientId)}
              />
            ))}
          </View>
        )}

        {/* Patient Status Cards */}
        {patients.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Patients</Text>
            {patients.map((patient) => (
              <PatientStatusCard
                key={patient.patientId}
                name={patient.patientName ?? 'Patient'}
                medicationsToday={patient.medicationsToday ?? null}
                pendingActions={patient.pendingActions ?? 0}
                lastActive={patient.lastActive ?? null}
                onPress={() => handlePatientPress(patient.patientId)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(8),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: spacing(4),
    marginBottom: spacing(5),
  },
  headerText: {
    flex: 1,
    marginRight: spacing(3),
  },
  greeting: {
    fontSize: 26,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    marginBottom: spacing(1),
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: `${Colors.error}10`,
    padding: spacing(3),
    borderRadius: Radius.md,
    marginBottom: spacing(4),
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.error,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: spacing(16),
    paddingHorizontal: spacing(6),
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${Colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing(4),
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: spacing(2),
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  section: {
    marginBottom: spacing(5),
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
    marginBottom: spacing(3),
  },
});
