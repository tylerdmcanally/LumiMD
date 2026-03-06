/**
 * MedicationReviewSheet
 *
 * Bottom sheet that appears after visit processing completes with medication changes.
 * Shows new/changed/discontinued medications for user review and confirmation.
 * Users can toggle which medications to confirm, edit dose/frequency/notes inline,
 * and see safety warnings per entry.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';
import { MedicationWarningBanner } from './MedicationWarningBanner';
import type { MedicationWarning } from './MedicationWarningBanner';
import { api } from '../lib/api/client';
import type { MedicationChanges, MedicationEntry } from '@lumimd/sdk';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MedicationReviewSheetProps {
  visible: boolean;
  visitId: string;
  visitDate: string | null;
  pendingMedicationChanges: MedicationChanges;
  onClose: () => void;
  onConfirmComplete?: (confirmedCount: number) => void;
}

interface EditableMedEntry extends MedicationEntry {
  confirmed: boolean;
  editing: boolean;
  editDose: string;
  editFrequency: string;
  editNote: string;
}

function toEditable(entry: MedicationEntry): EditableMedEntry {
  return {
    ...entry,
    confirmed: true,
    editing: false,
    editDose: entry.dose ?? '',
    editFrequency: entry.frequency ?? '',
    editNote: entry.note ?? '',
  };
}

function formatVisitDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function MedicationReviewSheet({
  visible,
  visitId,
  visitDate,
  pendingMedicationChanges,
  onClose,
  onConfirmComplete,
}: MedicationReviewSheetProps) {
  const [started, setStarted] = useState<EditableMedEntry[]>([]);
  const [changed, setChanged] = useState<EditableMedEntry[]>([]);
  const [stopped, setStopped] = useState<EditableMedEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [slideAnim] = useState(new Animated.Value(SCREEN_HEIGHT));

  // Initialize editable state from pending changes
  useEffect(() => {
    if (visible && pendingMedicationChanges) {
      setStarted((pendingMedicationChanges.started ?? []).map(toEditable));
      setChanged((pendingMedicationChanges.changed ?? []).map(toEditable));
      setStopped((pendingMedicationChanges.stopped ?? []).map(toEditable));
    }
  }, [visible, pendingMedicationChanges]);

  // Animate sheet
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_HEIGHT,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const confirmedCount = useMemo(() => {
    return (
      started.filter((e) => e.confirmed).length +
      changed.filter((e) => e.confirmed).length +
      stopped.filter((e) => e.confirmed).length
    );
  }, [started, changed, stopped]);

  const toggleConfirmed = useCallback(
    (section: 'started' | 'changed' | 'stopped', index: number) => {
      const setter =
        section === 'started' ? setStarted : section === 'changed' ? setChanged : setStopped;
      setter((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], confirmed: !next[index].confirmed };
        return next;
      });
    },
    [],
  );

  const toggleEditing = useCallback(
    (section: 'started' | 'changed' | 'stopped', index: number) => {
      const setter =
        section === 'started' ? setStarted : section === 'changed' ? setChanged : setStopped;
      setter((prev) => {
        const next = [...prev];
        const entry = next[index];
        if (entry.editing) {
          // Save edits
          next[index] = {
            ...entry,
            editing: false,
            dose: entry.editDose || entry.dose,
            frequency: entry.editFrequency || entry.frequency,
            note: entry.editNote || entry.note,
          };
        } else {
          next[index] = { ...entry, editing: true };
        }
        return next;
      });
    },
    [],
  );

  const updateField = useCallback(
    (
      section: 'started' | 'changed' | 'stopped',
      index: number,
      field: 'editDose' | 'editFrequency' | 'editNote',
      value: string,
    ) => {
      const setter =
        section === 'started' ? setStarted : section === 'changed' ? setChanged : setStopped;
      setter((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    },
    [],
  );

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      const toPayloadEntry = (e: EditableMedEntry) => ({
        name: e.name,
        dose: e.editDose || e.dose || undefined,
        frequency: e.editFrequency || e.frequency || undefined,
        note: e.editNote || e.note || undefined,
        confirmed: e.confirmed,
      });

      const result = await api.visits.confirmMedications(visitId, {
        medications: {
          started: started.map(toPayloadEntry),
          stopped: stopped.map(toPayloadEntry),
          changed: changed.map(toPayloadEntry),
        },
      });

      onConfirmComplete?.(result.confirmedCount);
      onClose();
    } catch (error) {
      console.error('[MedicationReviewSheet] Confirm failed:', error);
      Alert.alert('Error', 'Failed to confirm medication changes. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    try {
      await api.visits.skipMedicationConfirmation(visitId);
    } catch (error) {
      console.error('[MedicationReviewSheet] Skip failed:', error);
    }
    onClose();
  };

  if (!visible) return null;

  const dateStr = formatVisitDate(visitDate);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={styles.title}>Review Medication Changes</Text>
            {dateStr ? (
              <Text style={styles.subtitle}>From your visit on {dateStr}</Text>
            ) : (
              <Text style={styles.subtitle}>
                Confirm which medications should be saved
              </Text>
            )}
          </View>

          {/* Scrollable Content */}
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentInner}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {/* New Medications */}
            {started.length > 0 && (
              <MedicationSection
                title="New Medications"
                accentColor="#34D399"
                entries={started}
                section="started"
                onToggleConfirmed={toggleConfirmed}
                onToggleEditing={toggleEditing}
                onUpdateField={updateField}
              />
            )}

            {/* Changed Medications */}
            {changed.length > 0 && (
              <MedicationSection
                title="Changed Medications"
                accentColor="#FBBF24"
                entries={changed}
                section="changed"
                onToggleConfirmed={toggleConfirmed}
                onToggleEditing={toggleEditing}
                onUpdateField={updateField}
              />
            )}

            {/* Discontinued Medications */}
            {stopped.length > 0 && (
              <MedicationSection
                title="Discontinued"
                accentColor="#F87171"
                entries={stopped}
                section="stopped"
                onToggleConfirmed={toggleConfirmed}
                onToggleEditing={toggleEditing}
                onUpdateField={updateField}
                isDiscontinued
              />
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                confirmedCount === 0 && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.confirmButtonText}>
                    {confirmedCount === 0
                      ? 'No medications selected'
                      : `Confirm ${confirmedCount} Medication${confirmedCount > 1 ? 's' : ''}`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
              <Text style={styles.skipButtonText}>I'll review later</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// --- Section Component ---

interface MedicationSectionProps {
  title: string;
  accentColor: string;
  entries: EditableMedEntry[];
  section: 'started' | 'changed' | 'stopped';
  onToggleConfirmed: (section: 'started' | 'changed' | 'stopped', index: number) => void;
  onToggleEditing: (section: 'started' | 'changed' | 'stopped', index: number) => void;
  onUpdateField: (
    section: 'started' | 'changed' | 'stopped',
    index: number,
    field: 'editDose' | 'editFrequency' | 'editNote',
    value: string,
  ) => void;
  isDiscontinued?: boolean;
}

function MedicationSection({
  title,
  accentColor,
  entries,
  section,
  onToggleConfirmed,
  onToggleEditing,
  onUpdateField,
  isDiscontinued,
}: MedicationSectionProps) {
  return (
    <View style={styles.section}>
      <View style={[styles.sectionHeader, { borderLeftColor: accentColor }]}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{entries.length}</Text>
      </View>
      {entries.map((entry, index) => (
        <MedicationCard
          key={`${section}-${index}-${entry.name}`}
          entry={entry}
          accentColor={accentColor}
          onToggleConfirmed={() => onToggleConfirmed(section, index)}
          onToggleEditing={() => onToggleEditing(section, index)}
          onUpdateField={(field, value) => onUpdateField(section, index, field, value)}
          isDiscontinued={isDiscontinued}
        />
      ))}
    </View>
  );
}

// --- Card Component ---

interface MedicationCardProps {
  entry: EditableMedEntry;
  accentColor: string;
  onToggleConfirmed: () => void;
  onToggleEditing: () => void;
  onUpdateField: (field: 'editDose' | 'editFrequency' | 'editNote', value: string) => void;
  isDiscontinued?: boolean;
}

function MedicationCard({
  entry,
  accentColor,
  onToggleConfirmed,
  onToggleEditing,
  onUpdateField,
  isDiscontinued,
}: MedicationCardProps) {
  const warnings = (entry.warning ?? []) as MedicationWarning[];

  return (
    <View
      style={[
        styles.card,
        { borderLeftColor: accentColor },
        !entry.confirmed && styles.cardUnchecked,
      ]}
    >
      {/* Top row: checkbox, name, edit button */}
      <View style={styles.cardHeader}>
        <TouchableOpacity
          onPress={onToggleConfirmed}
          style={[styles.checkbox, entry.confirmed && styles.checkboxChecked]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {entry.confirmed && <Ionicons name="checkmark" size={16} color="#fff" />}
        </TouchableOpacity>

        <View style={styles.cardNameContainer}>
          <Text
            style={[
              styles.cardName,
              isDiscontinued && styles.cardNameStrikethrough,
              !entry.confirmed && styles.cardNameDimmed,
            ]}
          >
            {entry.name}
          </Text>
          {!entry.editing && (entry.dose || entry.frequency) && (
            <Text style={styles.cardDetail}>
              {[entry.dose, entry.frequency].filter(Boolean).join(' · ')}
            </Text>
          )}
          {!entry.editing && entry.note && (
            <Text style={styles.cardNote}>{entry.note}</Text>
          )}
        </View>

        {!isDiscontinued && (
          <TouchableOpacity
            onPress={onToggleEditing}
            style={styles.editButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={entry.editing ? 'checkmark' : 'create-outline'}
              size={20}
              color={entry.editing ? Colors.accent : Colors.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Inline edit fields */}
      {entry.editing && !isDiscontinued && (
        <View style={styles.editFields}>
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Dose</Text>
            <TextInput
              style={styles.editInput}
              value={entry.editDose}
              onChangeText={(v) => onUpdateField('editDose', v)}
              placeholder="e.g. 10mg"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Frequency</Text>
            <TextInput
              style={styles.editInput}
              value={entry.editFrequency}
              onChangeText={(v) => onUpdateField('editFrequency', v)}
              placeholder="e.g. once daily"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={styles.editRow}>
            <Text style={styles.editLabel}>Notes</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMultiline]}
              value={entry.editNote}
              onChangeText={(v) => onUpdateField('editNote', v)}
              placeholder="Optional notes"
              placeholderTextColor={Colors.textMuted}
              multiline
            />
          </View>
        </View>
      )}

      {/* Safety warnings */}
      {warnings.length > 0 && (
        <View style={styles.warningContainer}>
          <MedicationWarningBanner warnings={warnings} />
        </View>
      )}
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_HEIGHT * 0.85,
    paddingBottom: spacing(8),
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing(3),
    paddingBottom: spacing(4),
    paddingHorizontal: spacing(6),
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.stroke,
    borderRadius: 2,
    marginBottom: spacing(4),
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(2),
  },
  scrollContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContentInner: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(4),
  },
  // Sections
  section: {
    marginBottom: spacing(5),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 3,
    paddingLeft: spacing(3),
    marginBottom: spacing(3),
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    backgroundColor: Colors.stroke,
    borderRadius: 10,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    overflow: 'hidden',
  },
  // Cards
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.stroke,
    borderLeftWidth: 3,
    padding: spacing(4),
    marginBottom: spacing(2),
  },
  cardUnchecked: {
    opacity: 0.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(3),
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  cardNameContainer: {
    flex: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  cardNameStrikethrough: {
    textDecorationLine: 'line-through',
    color: Colors.textMuted,
  },
  cardNameDimmed: {
    color: Colors.textMuted,
  },
  cardDetail: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardNote: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  editButton: {
    padding: spacing(1),
  },
  // Edit fields
  editFields: {
    marginTop: spacing(3),
    gap: spacing(3),
    paddingLeft: spacing(9), // align with name (past checkbox)
  },
  editRow: {
    gap: spacing(1),
  },
  editLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editInput: {
    borderWidth: 1,
    borderColor: Colors.stroke,
    borderRadius: Radius.sm,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  editInputMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  // Warnings
  warningContainer: {
    marginTop: spacing(3),
  },
  // Footer
  footer: {
    paddingHorizontal: spacing(6),
    paddingTop: spacing(4),
    borderTopWidth: 1,
    borderTopColor: Colors.stroke,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(2),
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingVertical: spacing(4),
  },
  confirmButtonDisabled: {
    backgroundColor: Colors.textMuted,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: spacing(4),
  },
  skipButtonText: {
    fontSize: 15,
    color: Colors.textMuted,
  },
});
