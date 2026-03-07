/**
 * EducationCard — inline expandable education content for diagnoses and medications.
 * Surfaces GPT-4-generated patient education that was previously hidden on mobile.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, LayoutAnimation, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';
import type { DiagnosisEducation, MedicationEducation } from '../lib/utils/educationHelpers';

/* ---------- Diagnosis Education ---------- */

export function DiagnosisEducationCard({ summary, watchFor }: DiagnosisEducation) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = Boolean(summary || watchFor);
  if (!hasContent) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={toggle} style={styles.trigger} hitSlop={8}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={Colors.primary}
        />
        <Text style={styles.triggerText}>
          {expanded ? 'Hide details' : 'Learn more'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={Colors.primary}
        />
      </Pressable>

      {expanded && (
        <View style={styles.educationBody}>
          {summary && (
            <View style={styles.educationBlock}>
              <Text style={styles.educationLabel}>What is this?</Text>
              <Text style={styles.educationText}>{summary}</Text>
            </View>
          )}
          {watchFor && (
            <View style={styles.educationBlock}>
              <Text style={styles.educationLabel}>What to watch for</Text>
              <Text style={styles.educationText}>{watchFor}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/* ---------- Medication Education ---------- */

export function MedicationEducationCard({
  purpose,
  usage,
  sideEffects,
  whenToCallDoctor,
}: MedicationEducation) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = Boolean(purpose || usage || sideEffects || whenToCallDoctor);
  if (!hasContent) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  };

  return (
    <View style={styles.container}>
      <Pressable onPress={toggle} style={styles.trigger} hitSlop={8}>
        <Ionicons
          name="information-circle-outline"
          size={16}
          color={Colors.primary}
        />
        <Text style={styles.triggerText}>
          {expanded ? 'Hide details' : 'Learn more'}
        </Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={Colors.primary}
        />
      </Pressable>

      {expanded && (
        <View style={styles.educationBody}>
          {purpose && (
            <View style={styles.educationBlock}>
              <Text style={styles.educationLabel}>Purpose</Text>
              <Text style={styles.educationText}>{purpose}</Text>
            </View>
          )}
          {usage && (
            <View style={styles.educationBlock}>
              <Text style={styles.educationLabel}>How to take</Text>
              <Text style={styles.educationText}>{usage}</Text>
            </View>
          )}
          {sideEffects && (
            <View style={styles.educationBlock}>
              <Text style={styles.educationLabel}>Possible side effects</Text>
              <Text style={styles.educationText}>{sideEffects}</Text>
            </View>
          )}
          {whenToCallDoctor && (
            <View style={styles.alertBlock}>
              <View style={styles.alertHeader}>
                <Ionicons name="warning-outline" size={14} color={Colors.error} />
                <Text style={styles.alertLabel}>When to call your doctor</Text>
              </View>
              <Text style={styles.alertText}>{whenToCallDoctor}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  container: {
    marginTop: spacing(1),
    marginLeft: spacing(6), // Align with text content, past the icon
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(1),
  },
  triggerText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  educationBody: {
    backgroundColor: 'rgba(64,201,208,0.08)',
    borderRadius: Radius.md,
    padding: spacing(3),
    marginTop: spacing(1),
    gap: spacing(3),
  },
  educationBlock: {
    gap: spacing(1),
  },
  educationLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  educationText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.text,
    lineHeight: 20,
  },
  alertBlock: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius: Radius.sm,
    padding: spacing(3),
    gap: spacing(1),
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  alertLabel: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.error,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  alertText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.text,
    lineHeight: 20,
  },
});
