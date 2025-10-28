import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const HEALTH_PROFILE_KEY = '@healthProfile';

interface HealthItem {
  id: string;
  value: string;
  notes?: string;
}

export interface HealthProfileData {
  medications: HealthItem[];
  conditions: HealthItem[];
  allergies: HealthItem[];
}

interface HealthProfileProps {
  onComplete?: () => void;
  onDataChange?: (data: HealthProfileData) => void;
}

export const HealthProfile: React.FC<HealthProfileProps> = ({ onComplete, onDataChange }) => {
  const [medications, setMedications] = useState<HealthItem[]>([]);
  const [conditions, setConditions] = useState<HealthItem[]>([]);
  const [allergies, setAllergies] = useState<HealthItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [modalType, setModalType] = useState<'medication' | 'condition' | 'allergy'>('medication');
  const [newItemValue, setNewItemValue] = useState('');
  const [newItemNotes, setNewItemNotes] = useState('');

  // Load health profile from storage
  const loadHealthProfile = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(HEALTH_PROFILE_KEY);
      if (stored) {
        const data: HealthProfileData = JSON.parse(stored);
        setMedications(data.medications || []);
        setConditions(data.conditions || []);
        setAllergies(data.allergies || []);
      }
    } catch (err) {
      console.error('Failed to load health profile', err);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save health profile to storage
  const saveHealthProfile = useCallback(async (data: HealthProfileData) => {
    try {
      await AsyncStorage.setItem(HEALTH_PROFILE_KEY, JSON.stringify(data));
      onDataChange?.(data);
    } catch (err) {
      console.error('Failed to save health profile', err);
    }
  }, [onDataChange]);

  // Load on mount
  useEffect(() => {
    loadHealthProfile();
  }, [loadHealthProfile]);

  // Save whenever data changes
  useEffect(() => {
    if (isLoaded) {
      const data: HealthProfileData = { medications, conditions, allergies };
      saveHealthProfile(data);
    }
  }, [medications, conditions, allergies, isLoaded, saveHealthProfile]);

  const getItems = (type: 'medication' | 'condition' | 'allergy'): HealthItem[] => {
    if (type === 'medication') return medications;
    if (type === 'condition') return conditions;
    return allergies;
  };

  const setItems = (type: 'medication' | 'condition' | 'allergy', items: HealthItem[]) => {
    if (type === 'medication') setMedications(items);
    else if (type === 'condition') setConditions(items);
    else setAllergies(items);
  };

  const handleOpenAdd = (type: 'medication' | 'condition' | 'allergy') => {
    setModalType(type);
    setNewItemValue('');
    setNewItemNotes('');
    setShowAddModal(true);
  };

  const handleAdd = () => {
    if (!newItemValue.trim()) {
      Alert.alert('Required', 'Please enter a value');
      return;
    }

    const newItem: HealthItem = {
      id: Date.now().toString(),
      value: newItemValue.trim(),
      notes: newItemNotes.trim() || undefined,
    };

    const items = getItems(modalType);
    setItems(modalType, [...items, newItem]);
    setShowAddModal(false);
    setNewItemValue('');
    setNewItemNotes('');
  };

  const handleDelete = (type: 'medication' | 'condition' | 'allergy', id: string) => {
    Alert.alert('Delete', 'Are you sure you want to remove this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const items = getItems(type);
          setItems(type, items.filter((item) => item.id !== id));
        },
      },
    ]);
  };

  const handleAddNone = (type: 'medication' | 'condition' | 'allergy') => {
    const noneText =
      type === 'medication' ? 'No medications' :
      type === 'condition' ? 'No medical conditions' :
      'No known allergies';

    const newItem: HealthItem = {
      id: Date.now().toString(),
      value: noneText,
      notes: undefined,
    };

    setItems(type, [newItem]);
  };

  const getTypeLabel = (type: 'medication' | 'condition' | 'allergy'): string => {
    if (type === 'medication') return 'medication';
    if (type === 'condition') return 'medical condition';
    return 'allergy';
  };

  // Calculate completion based on whether each section has been addressed (not total items)
  const hasMedications = medications.length > 0;
  const hasConditions = conditions.length > 0;
  const hasAllergies = allergies.length > 0;
  const completedSections = [hasMedications, hasConditions, hasAllergies].filter(Boolean).length;
  const completionPercent = Math.round((completedSections / 3) * 100); // 33.33% per section

  const renderSection = (
    type: 'medication' | 'condition' | 'allergy',
    title: string,
    placeholder: string
  ) => {
    const items = getItems(type);

    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {title}
          </Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => handleOpenAdd(type)}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>{placeholder}</Text>
            <TouchableOpacity
              style={styles.noneButton}
              onPress={() => handleAddNone(type)}
            >
              <Text style={styles.noneButtonText}>
                {type === 'medication' ? 'No medications' :
                 type === 'condition' ? 'No medical conditions' :
                 'No known allergies'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.itemList}>
            {items.map((item) => (
              <View key={item.id} style={styles.item}>
                <View style={styles.itemContent}>
                  <Text style={styles.itemValue}>{item.value}</Text>
                  {item.notes && (
                    <Text style={styles.itemNotes}>{item.notes}</Text>
                  )}
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDelete(type, item.id)}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Completion Banner */}
      {completionPercent < 100 && (
        <View style={styles.completionBanner}>
          <View style={styles.completionHeader}>
            <Text style={styles.completionTitle}>Complete Your Health Profile</Text>
            <Text style={styles.completionPercent}>{completionPercent}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${completionPercent}%` }]} />
          </View>
          <Text style={styles.completionText}>
            Add your health information for better visit summaries and continuity of care.
          </Text>
        </View>
      )}

      {/* Sections */}
      {renderSection('medication', 'Current Medications', 'No medications added yet')}
      {renderSection('condition', 'Medical Conditions', 'No conditions added yet')}
      {renderSection('allergy', 'Allergies', 'No allergies added yet')}

      {/* Add Item Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalContainer}>
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowAddModal(false)}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add {getTypeLabel(modalType)}</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalContent}>
              <Text style={styles.inputLabel}>
                {modalType === 'medication' ? 'Medication name' :
                 modalType === 'condition' ? 'Condition name' :
                 'Allergy'}
              </Text>
              <TextInput
                style={styles.input}
                value={newItemValue}
                onChangeText={setNewItemValue}
                placeholder={
                  modalType === 'medication' ? 'e.g., Lisinopril 10mg' :
                  modalType === 'condition' ? 'e.g., Type 2 Diabetes' :
                  'e.g., Penicillin'
                }
                placeholderTextColor={COLORS.GRAY[400]}
                autoFocus
              />

              <Text style={styles.inputLabel}>
                Notes (optional)
              </Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newItemNotes}
                onChangeText={setNewItemNotes}
                placeholder={
                  modalType === 'medication' ? 'Dosage, frequency, prescribing doctor...' :
                  modalType === 'condition' ? 'When diagnosed, severity, treating physician...' :
                  'Reaction severity, what to avoid...'
                }
                placeholderTextColor={COLORS.GRAY[400]}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAdd}
              >
                <Text style={styles.saveButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: SIZES.LG,
  },
  completionBanner: {
    backgroundColor: COLORS.ACCENT + '20',
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.MD,
    borderWidth: 1,
    borderColor: COLORS.ACCENT + '40',
    gap: SIZES.SM,
  },
  completionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completionTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  completionPercent: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  progressBar: {
    height: 8,
    backgroundColor: COLORS.GRAY[200],
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.ACCENT,
    borderRadius: 4,
  },
  completionText: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    lineHeight: 18,
  },
  section: {
    gap: SIZES.SM,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.PRIMARY,
  },
  addButton: {
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS - 2,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.PRIMARY,
  },
  addButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.WHITE,
  },
  emptyState: {
    padding: SIZES.MD,
    backgroundColor: COLORS.GRAY[50],
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    borderStyle: 'dashed',
    gap: SIZES.SM,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.GRAY[400],
    textAlign: 'center',
  },
  noneButton: {
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.WHITE,
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
  },
  noneButtonText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  itemList: {
    gap: SIZES.XS,
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: SIZES.SM,
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
  },
  itemContent: {
    flex: 1,
    gap: SIZES.XS - 4,
  },
  itemValue: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  itemNotes: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    lineHeight: 18,
  },
  deleteButton: {
    padding: SIZES.XS - 4,
    marginLeft: SIZES.SM,
  },
  deleteButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.GRAY[400],
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalSheet: {
    backgroundColor: COLORS.WHITE,
    borderTopLeftRadius: SIZES.CARD_BORDER_RADIUS,
    borderTopRightRadius: SIZES.CARD_BORDER_RADIUS,
    paddingTop: SIZES.LG,
    paddingBottom: SIZES.XL,
    paddingHorizontal: SIZES.PADDING,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.MD,
  },
  modalTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  modalClose: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XXL,
    color: COLORS.SECONDARY,
  },
  modalContent: {
    maxHeight: 400,
  },
  inputLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    marginBottom: SIZES.XS,
    marginTop: SIZES.SM,
  },
  input: {
    backgroundColor: COLORS.GRAY[50],
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.SM,
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  textArea: {
    minHeight: 80,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SIZES.SM,
    marginTop: SIZES.LG,
  },
  cancelModalButton: {
    flex: 1,
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
    alignItems: 'center',
  },
  cancelModalText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.SECONDARY,
  },
  saveButton: {
    flex: 1,
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.PRIMARY,
    alignItems: 'center',
  },
  saveButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.WHITE,
  },
});

export default HealthProfile;
