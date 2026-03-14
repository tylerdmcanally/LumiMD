import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../../../../components/ui';
import { useCareVisitDetail } from '../../../../lib/api/hooks';

function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card style={sectionStyles.card}>
      <Pressable style={sectionStyles.header} onPress={() => setOpen(!open)}>
        <Ionicons name={icon} size={18} color={Colors.primary} />
        <Text style={sectionStyles.title}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
      </Pressable>
      {open && <View style={sectionStyles.body}>{children}</View>}
    </Card>
  );
}

const sectionStyles = StyleSheet.create({
  card: { marginBottom: spacing(3) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  body: { marginTop: spacing(3) },
});

function BulletList({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={bulletStyles.row}>
          <Text style={bulletStyles.dot}>•</Text>
          <Text style={bulletStyles.text}>{item}</Text>
        </View>
      ))}
    </>
  );
}

const bulletStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing(1) },
  dot: { fontSize: 14, color: Colors.textMuted, marginRight: spacing(2), lineHeight: 20 },
  text: { flex: 1, fontSize: 14, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.text, lineHeight: 20 },
});

function MedSection({
  title,
  meds,
  color,
}: {
  title: string;
  meds: Array<{ name: string; dose?: string; frequency?: string; reason?: string }>;
  color: string;
}) {
  if (!meds || meds.length === 0) return null;
  return (
    <View style={{ marginBottom: spacing(3) }}>
      <Text style={[medStyles.sectionLabel, { color }]}>{title}</Text>
      {meds.map((med, i) => (
        <View key={i} style={medStyles.row}>
          <Text style={medStyles.name}>{med.name}</Text>
          {med.dose && <Text style={medStyles.detail}>{med.dose}{med.frequency ? ` — ${med.frequency}` : ''}</Text>}
          {med.reason && <Text style={medStyles.reason}>{med.reason}</Text>}
        </View>
      ))}
    </View>
  );
}

const medStyles = StyleSheet.create({
  sectionLabel: { fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing(2) },
  row: { marginBottom: spacing(2), paddingLeft: spacing(2) },
  name: { fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold', color: Colors.text },
  detail: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.textMuted, marginTop: 1 },
  reason: { fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular', color: Colors.textWarm, fontStyle: 'italic', marginTop: 1 },
});

export default function CaregiverVisitDetailScreen() {
  const { patientId, visitId } = useLocalSearchParams<{ patientId: string; visitId: string }>();
  const router = useRouter();

  const { data: visit, isLoading } = useCareVisitDetail(patientId, visitId);

  if (isLoading || !visit) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const date = visit.visitDate || visit.createdAt;
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : 'Unknown date';

  const hasMeds =
    (visit.medications?.started?.length ?? 0) > 0 ||
    (visit.medications?.changed?.length ?? 0) > 0 ||
    (visit.medications?.stopped?.length ?? 0) > 0 ||
    (visit.medications?.continued?.length ?? 0) > 0;

  const isProcessing = visit.processingStatus !== 'completed';

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
          <Text style={styles.headerTitle}>Visit Summary</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Meta info */}
        <View style={styles.meta}>
          <Text style={styles.date}>{formattedDate}</Text>
          {visit.provider && (
            <Text style={styles.provider}>
              {visit.provider}{visit.specialty ? ` — ${visit.specialty}` : ''}
            </Text>
          )}
        </View>

        {/* Processing state */}
        {isProcessing && (
          <Card style={styles.processingCard}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.processingText}>This visit is still being processed.</Text>
          </Card>
        )}

        {/* Summary */}
        {visit.summary && (
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryText}>{visit.summary}</Text>
          </Card>
        )}

        {/* Diagnoses */}
        {visit.diagnoses && visit.diagnoses.length > 0 && (
          <CollapsibleSection title="Diagnoses" icon="heart-outline" defaultOpen>
            <BulletList items={visit.diagnoses} />
          </CollapsibleSection>
        )}

        {/* Medications */}
        {hasMeds && (
          <CollapsibleSection title="Medications" icon="medical-outline" defaultOpen>
            <MedSection title="Started" meds={visit.medications?.started ?? []} color={Colors.success} />
            <MedSection title="Changed" meds={visit.medications?.changed ?? []} color={Colors.warning} />
            <MedSection title="Stopped" meds={visit.medications?.stopped ?? []} color={Colors.error} />
            <MedSection title="Continued" meds={visit.medications?.continued ?? []} color={Colors.textMuted} />
          </CollapsibleSection>
        )}

        {/* Next Steps */}
        {visit.nextSteps && visit.nextSteps.length > 0 && (
          <CollapsibleSection title="Next Steps" icon="arrow-forward-outline" defaultOpen>
            <BulletList items={visit.nextSteps} />
          </CollapsibleSection>
        )}

        {/* Follow-ups */}
        {visit.followUps && visit.followUps.length > 0 && (
          <CollapsibleSection title="Follow-ups" icon="calendar-outline">
            {visit.followUps.map((fu, i) => {
              // Handle both string and object formats from GPT-4 extraction
              const desc = typeof fu === 'string' ? fu : (fu?.description ?? '');
              const due = typeof fu === 'string' ? undefined : fu?.dueDate;
              return (
                <View key={i} style={{ marginBottom: spacing(2) }}>
                  <Text style={bulletStyles.text}>{desc}</Text>
                  {due && (
                    <Text style={medStyles.detail}>
                      Due: {new Date(due).toLocaleDateString()}
                    </Text>
                  )}
                </View>
              );
            })}
          </CollapsibleSection>
        )}

        {/* Tests Ordered */}
        {visit.testsOrdered && visit.testsOrdered.length > 0 && (
          <CollapsibleSection title="Tests Ordered" icon="flask-outline">
            <BulletList items={visit.testsOrdered} />
          </CollapsibleSection>
        )}

        {/* Education */}
        {visit.education?.keyTakeaways && visit.education.keyTakeaways.length > 0 && (
          <CollapsibleSection title="Key Takeaways" icon="school-outline" defaultOpen>
            <BulletList items={visit.education.keyTakeaways} />
            {visit.education.redFlags && visit.education.redFlags.length > 0 && (
              <View style={{ marginTop: spacing(3) }}>
                <Text style={[medStyles.sectionLabel, { color: Colors.error }]}>Warning Signs</Text>
                <BulletList items={visit.education.redFlags} />
              </View>
            )}
          </CollapsibleSection>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing(4), paddingBottom: spacing(8) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing(2),
    marginBottom: spacing(3),
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: spacing(2),
  },
  meta: { marginBottom: spacing(4) },
  date: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  provider: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    marginTop: 2,
  },
  processingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginBottom: spacing(4),
    backgroundColor: Colors.primaryMuted,
    borderColor: Colors.primary,
  },
  processingText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.accent,
  },
  summaryCard: { marginBottom: spacing(4) },
  summaryText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.text,
    lineHeight: 22,
  },
});
