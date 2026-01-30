/**
 * StateSelector Component
 *
 * Modal picker for manually selecting US state.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../ui';
import { US_STATES, requiresTwoPartyConsent } from '../../lib/location';

export interface StateSelectorProps {
  visible: boolean;
  currentState: string | null;
  stateSource?: 'location' | 'manual' | null;
  hasLocationPermission?: boolean;
  onSelect: (stateCode: string) => void;
  onUseDeviceLocation?: () => void;
  onClose: () => void;
}

export function StateSelector({
  visible,
  currentState,
  stateSource,
  hasLocationPermission,
  onSelect,
  onUseDeviceLocation,
  onClose,
}: StateSelectorProps) {
  const [selectedState, setSelectedState] = useState<string | null>(currentState);
  const [useAutoDetect, setUseAutoDetect] = useState(stateSource === 'location');

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedState(currentState);
      setUseAutoDetect(stateSource === 'location');
    }
  }, [visible, currentState, stateSource]);

  const handleSelect = (stateCode: string) => {
    setSelectedState(stateCode);
    setUseAutoDetect(false);
  };

  const handleAutoDetect = () => {
    setUseAutoDetect(true);
    setSelectedState(null);
  };

  const handleConfirm = () => {
    if (useAutoDetect && onUseDeviceLocation) {
      onUseDeviceLocation();
    } else if (selectedState) {
      onSelect(selectedState);
    }
    onClose();
  };

  const renderItem = ({ item }: { item: (typeof US_STATES)[number] }) => {
    const isSelected = selectedState === item.code;
    const isTwoParty = requiresTwoPartyConsent(item.code);

    return (
      <Pressable
        style={[styles.stateRow, isSelected && styles.stateRowSelected]}
        onPress={() => handleSelect(item.code)}
      >
        <View style={styles.stateInfo}>
          <Text style={[styles.stateName, isSelected && styles.stateNameSelected]}>
            {item.name}
          </Text>
          {isTwoParty && (
            <Text style={styles.consentBadge}>All-party consent</Text>
          )}
        </View>
        {isSelected && (
          <Ionicons name="checkmark" size={20} color={Colors.primary} />
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Select State</Text>
          <Pressable
            onPress={handleConfirm}
            style={styles.closeButton}
            disabled={!selectedState && !useAutoDetect}
          >
            <Text
              style={[
                styles.doneText,
                (!selectedState && !useAutoDetect) && styles.doneTextDisabled,
              ]}
            >
              Done
            </Text>
          </Pressable>
        </View>

        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.description}>
            Your state determines consent requirements for recording medical visits.
          </Text>
        </View>

        {/* Auto-detect option */}
        {hasLocationPermission && onUseDeviceLocation && (
          <View style={styles.autoDetectSection}>
            <Pressable
              style={[styles.autoDetectRow, useAutoDetect && styles.stateRowSelected]}
              onPress={handleAutoDetect}
            >
              <View style={styles.autoDetectIcon}>
                <Ionicons name="navigate" size={20} color={Colors.primary} />
              </View>
              <View style={styles.stateInfo}>
                <Text style={[styles.stateName, useAutoDetect && styles.stateNameSelected]}>
                  Use Device Location
                </Text>
                <Text style={styles.consentBadge}>Automatically detect your state</Text>
              </View>
              {useAutoDetect && (
                <Ionicons name="checkmark" size={20} color={Colors.primary} />
              )}
            </Pressable>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>Or select manually</Text>
          </View>
        )}

        {/* State List */}
        <FlatList
          data={US_STATES}
          keyExtractor={(item) => item.code}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(4),
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke,
  },
  closeButton: {
    width: 60,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
  },
  doneText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.primary,
  },
  doneTextDisabled: {
    color: Colors.textMuted,
  },
  descriptionContainer: {
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(4),
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke,
  },
  description: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
  },
  listContent: {
    paddingVertical: spacing(2),
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(6),
  },
  stateRowSelected: {
    backgroundColor: Colors.accent,
  },
  stateInfo: {
    flex: 1,
  },
  stateName: {
    fontSize: 16,
    color: Colors.text,
  },
  stateNameSelected: {
    fontWeight: '600',
    color: Colors.primary,
  },
  consentBadge: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: spacing(1),
  },
  separator: {
    height: 1,
    backgroundColor: Colors.stroke,
    marginLeft: spacing(6),
  },
  autoDetectSection: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.stroke,
  },
  autoDetectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing(4),
    paddingHorizontal: spacing(6),
  },
  autoDetectIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  sectionDivider: {
    height: 1,
    backgroundColor: Colors.stroke,
    marginHorizontal: spacing(6),
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing(6),
    paddingVertical: spacing(3),
    backgroundColor: Colors.surface,
  },
});
