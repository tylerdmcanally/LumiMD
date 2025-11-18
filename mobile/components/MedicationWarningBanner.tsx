/**
 * MedicationWarningBanner Component
 *
 * Displays medication safety warnings with appropriate severity styling
 * Used to alert patients about duplicate therapy, drug interactions, and allergies
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, spacing } from './ui';

export interface MedicationWarning {
  type: 'duplicate_therapy' | 'drug_interaction' | 'allergy_alert';
  severity: 'critical' | 'high' | 'moderate' | 'low';
  message: string;
  details: string;
  conflictingMedication?: string;
  allergen?: string;
  recommendation: string;
}

interface MedicationWarningBannerProps {
  warnings: MedicationWarning[];
  onDismiss?: () => void;
  style?: any;
}

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'critical':
      return {
        background: '#FEE2E2',
        border: '#FCA5A5',
        text: '#991B1B',
        icon: '\u26A0\uFE0F', // ⚠️
      };
    case 'high':
      return {
        background: '#FEF3C7',
        border: '#FCD34D',
        text: '#92400E',
        icon: '\u26A0\uFE0F', // ⚠️
      };
    case 'moderate':
      return {
        background: '#DBEAFE',
        border: '#93C5FD',
        text: '#1E40AF',
        icon: '\u2139\uFE0F', // ℹ️
      };
    case 'low':
      return {
        background: '#F3F4F6',
        border: '#D1D5DB',
        text: '#374151',
        icon: '\u2139\uFE0F', // ℹ️
      };
    default:
      return {
        background: '#F3F4F6',
        border: '#D1D5DB',
        text: '#374151',
        icon: '\u2139\uFE0F',
      };
  }
};

const getWarningTypeLabel = (type: string) => {
  switch (type) {
    case 'allergy_alert':
      return 'ALLERGY ALERT';
    case 'drug_interaction':
      return 'DRUG INTERACTION';
    case 'duplicate_therapy':
      return 'DUPLICATE THERAPY';
    default:
      return 'WARNING';
  }
};

export const MedicationWarningBanner: React.FC<MedicationWarningBannerProps> = ({
  warnings,
  onDismiss,
  style,
}) => {
  if (!warnings || warnings.length === 0) {
    return null;
  }

  // Sort warnings by severity (critical first)
  const severityOrder = { critical: 0, high: 1, moderate: 2, low: 3 };
  const sortedWarnings = [...warnings].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
  );

  return (
    <View style={[styles.container, style]}>
      {sortedWarnings.map((warning, index) => {
        const colors = getSeverityColor(warning.severity);
        return (
          <View
            key={index}
            style={[
              styles.warningCard,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.warningHeader}>
              <Text style={styles.warningIcon}>{colors.icon}</Text>
              <View style={styles.warningHeaderText}>
                <Text style={[styles.warningType, { color: colors.text }]}>
                  {getWarningTypeLabel(warning.type)}
                </Text>
                <Text style={[styles.severityBadge, { color: colors.text }]}>
                  {warning.severity.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={[styles.warningMessage, { color: colors.text }]}>
              {warning.message}
            </Text>

            <Text style={[styles.warningDetails, { color: colors.text }]}>
              {warning.details}
            </Text>

            {warning.conflictingMedication && (
              <View style={styles.conflictBox}>
                <Text style={[styles.conflictLabel, { color: colors.text }]}>
                  Conflicting medication:
                </Text>
                <Text style={[styles.conflictValue, { color: colors.text }]}>
                  {warning.conflictingMedication}
                </Text>
              </View>
            )}

            {warning.allergen && (
              <View style={styles.conflictBox}>
                <Text style={[styles.conflictLabel, { color: colors.text }]}>
                  Known allergy:
                </Text>
                <Text style={[styles.conflictValue, { color: colors.text }]}>
                  {warning.allergen}
                </Text>
              </View>
            )}

            <View
              style={[
                styles.recommendationBox,
                {
                  backgroundColor:
                    warning.severity === 'critical' || warning.severity === 'high'
                      ? colors.border
                      : 'transparent',
                },
              ]}
            >
              <Text style={[styles.recommendationLabel, { color: colors.text }]}>
                What to do:
              </Text>
              <Text style={[styles.recommendationText, { color: colors.text }]}>
                {warning.recommendation}
              </Text>
            </View>
          </View>
        );
      })}

      {onDismiss && (
        <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
          <Text style={styles.dismissButtonText}>I understand</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: spacing(3),
  },
  warningCard: {
    borderRadius: spacing(3),
    borderWidth: 2,
    padding: spacing(4),
    gap: spacing(3),
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(2),
  },
  warningIcon: {
    fontSize: 24,
    lineHeight: 24,
  },
  warningHeaderText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  warningType: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  severityBadge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: spacing(1),
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  warningMessage: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
  },
  warningDetails: {
    fontSize: 14,
    lineHeight: 20,
  },
  conflictBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    flexWrap: 'wrap',
  },
  conflictLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  conflictValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  recommendationBox: {
    marginTop: spacing(2),
    padding: spacing(3),
    borderRadius: spacing(2),
    gap: spacing(1),
  },
  recommendationLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recommendationText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  dismissButton: {
    backgroundColor: Colors.primary,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(4),
    borderRadius: spacing(2),
    alignItems: 'center',
    marginTop: spacing(2),
  },
  dismissButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
