import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';

interface TagDisplayProps {
  tags: string[];
  variant?: 'default' | 'compact';
  maxVisible?: number;
}

export const TagDisplay: React.FC<TagDisplayProps> = ({
  tags,
  variant = 'default',
  maxVisible,
}) => {
  if (!tags || tags.length === 0) {
    return null;
  }

  const visibleTags = maxVisible ? tags.slice(0, maxVisible) : tags;
  const remainingCount = maxVisible && tags.length > maxVisible ? tags.length - maxVisible : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {visibleTags.map((tag, index) => (
          <View
            key={`${tag}-${index}`}
            style={[
              styles.tag,
              variant === 'compact' && styles.tagCompact,
            ]}
          >
            <Text style={[
              styles.tagText,
              variant === 'compact' && styles.tagTextCompact,
            ]}>
              {tag}
            </Text>
          </View>
        ))}
        {remainingCount > 0 && (
          <View style={[styles.tag, styles.tagMore]}>
            <Text style={styles.tagTextMore}>+{remainingCount}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  scrollContent: {
    gap: SIZES.XS,
    paddingVertical: 2,
  },
  tag: {
    backgroundColor: COLORS.PRIMARY + '15',
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS - 2,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.PRIMARY + '30',
  },
  tagCompact: {
    paddingHorizontal: SIZES.XS + 2,
    paddingVertical: 2,
  },
  tagText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  tagTextCompact: {
    fontSize: SIZES.FONT.XS,
  },
  tagMore: {
    backgroundColor: COLORS.GRAY[200],
    borderColor: COLORS.GRAY[300],
  },
  tagTextMore: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
});

export default TagDisplay;
