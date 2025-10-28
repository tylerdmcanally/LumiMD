import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Pressable,
} from 'react-native';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';

interface TagInputProps {
  existingTags: string[];
  selectedTags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  placeholder?: string;
  maxTags?: number;
}

export const TagInput: React.FC<TagInputProps> = ({
  existingTags,
  selectedTags,
  onAddTag,
  onRemoveTag,
  placeholder = 'Add tag...',
  maxTags = 10,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = existingTags.filter(
    (tag) =>
      tag.toLowerCase().includes(inputValue.toLowerCase()) &&
      !selectedTags.includes(tag) &&
      tag !== inputValue
  );

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim();
    if (!trimmedTag) return;
    if (selectedTags.includes(trimmedTag)) return;
    if (selectedTags.length >= maxTags) return;

    onAddTag(trimmedTag);
    setInputValue('');
    setShowSuggestions(false);
  };

  const handleInputChange = (text: string) => {
    setInputValue(text);
    setShowSuggestions(text.length > 0);
  };

  const handleSubmit = () => {
    if (inputValue.trim()) {
      handleAddTag(inputValue);
    }
  };

  return (
    <View style={styles.container}>
      {/* Selected Tags Display */}
      {selectedTags.length > 0 && (
        <View style={styles.tagsContainer}>
          {selectedTags.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={styles.tag}
              onPress={() => onRemoveTag(tag)}
              activeOpacity={0.7}
            >
              <Text style={styles.tagText}>{tag}</Text>
              <Text style={styles.tagRemove}>×</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Input Field */}
      {selectedTags.length < maxTags && (
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={handleInputChange}
            onSubmitEditing={handleSubmit}
            placeholder={placeholder}
            placeholderTextColor={COLORS.GRAY[400]}
            returnKeyType="done"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {inputValue.trim().length > 0 && (
            <TouchableOpacity style={styles.addButton} onPress={handleSubmit}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Suggestions List */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsLabel}>Suggestions:</Text>
          <FlatList
            data={filteredSuggestions.slice(0, 5)}
            keyExtractor={(item) => item}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.suggestion}
                onPress={() => handleAddTag(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.suggestionText}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {selectedTags.length >= maxTags && (
        <Text style={styles.limitText}>Maximum {maxTags} tags reached</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: SIZES.SM,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.XS,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS - 2,
    borderRadius: SIZES.BORDER_RADIUS,
    gap: SIZES.XS,
  },
  tagText: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.WHITE,
  },
  tagRemove: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.LG,
    color: COLORS.WHITE,
    marginLeft: SIZES.XS,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.SM,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
    borderRadius: SIZES.BORDER_RADIUS,
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.SM,
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.MD,
    color: COLORS.PRIMARY,
  },
  addButton: {
    backgroundColor: COLORS.PRIMARY,
    paddingHorizontal: SIZES.MD,
    paddingVertical: SIZES.SM,
    borderRadius: SIZES.BORDER_RADIUS,
  },
  addButtonText: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.WHITE,
    fontSize: SIZES.FONT.SM,
  },
  suggestionsContainer: {
    gap: SIZES.XS,
  },
  suggestionsLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  suggestionsList: {
    gap: SIZES.XS,
  },
  suggestion: {
    backgroundColor: COLORS.GRAY[100],
    paddingHorizontal: SIZES.SM,
    paddingVertical: SIZES.XS,
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[300],
  },
  suggestionText: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.PRIMARY,
  },
  limitText: {
    fontFamily: FONTS.REGULAR,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
    fontStyle: 'italic',
  },
});

export default TagInput;
