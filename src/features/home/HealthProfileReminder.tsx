import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import {
    dismissHealthReminder,
    getHealthProfileCompletionPercent,
    shouldShowHealthReminder,
} from '@/shared/utils/healthProfile';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export const HealthProfileReminder: React.FC = () => {
  const [show, setShow] = useState(false);
  const [completion, setCompletion] = useState(0);

  useEffect(() => {
    const checkReminder = async () => {
      const shouldShow = await shouldShowHealthReminder();
      if (shouldShow) {
        const percent = await getHealthProfileCompletionPercent();
        setCompletion(percent);
        setShow(true);
      }
    };
    checkReminder();
  }, []);

  const handleDismiss = async () => {
    await dismissHealthReminder();
    setShow(false);
  };

  const handleComplete = () => {
    router.push('/(app)/(profile)');
  };

  if (!show) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Complete Your Health Profile</Text>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.dismissText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${completion}%` }]} />
      </View>

      <Text style={styles.description}>
        Add your medications, conditions, and allergies for better visit summaries.
      </Text>

      <TouchableOpacity style={styles.actionButton} onPress={handleComplete}>
        <Text style={styles.actionButtonText}>Complete Profile →</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.ACCENT + '20',
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.MD,
    borderWidth: 1,
    borderColor: COLORS.ACCENT + '40',
    gap: SIZES.SM,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
    lineHeight: 20,
  },
  dismissButton: {
    padding: SIZES.XS - 4,
    marginLeft: SIZES.SM,
  },
  dismissText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.GRAY[400],
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.GRAY[200],
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.ACCENT,
    borderRadius: 3,
  },
  description: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    lineHeight: 18,
  },
  actionButton: {
    alignSelf: 'flex-start',
    paddingVertical: SIZES.XS,
    paddingHorizontal: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.PRIMARY,
    marginTop: SIZES.XS - 2,
  },
  actionButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.WHITE,
  },
});

export default HealthProfileReminder;
