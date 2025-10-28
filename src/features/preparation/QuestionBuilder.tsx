import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { COLORS, SIZES, FONTS } from '@/shared/constants/AppConstants';

interface QuestionBuilderProps {
  onQuestionsGenerated?: (questions: string[]) => void;
}

/**
 * Placeholder for future appointment preparation experience.
 * The original AI-driven symptom assessment flow has been removed while we
 * realign the mobile app around visit capture and coordination.
 */
export const QuestionBuilder: React.FC<QuestionBuilderProps> = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Appointment Preparation</Text>
      <Text style={styles.body}>
        We are rebuilding this experience to focus on questions that matter for
        recorded visits and follow-up care. Stay tuned for upcoming updates.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: SIZES.PADDING,
    borderRadius: SIZES.BORDER_RADIUS,
    backgroundColor: COLORS.BACKGROUND,
  },
  title: {
    fontSize: SIZES.FONT.XL,
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
    marginBottom: SIZES.SM,
  },
  body: {
    fontSize: SIZES.FONT.MD,
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[700],
    lineHeight: 22,
  },
});

export default QuestionBuilder;
