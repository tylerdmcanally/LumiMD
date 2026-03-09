/**
 * Visit Walkthrough Overlay
 *
 * Bottom-sheet style overlay that guides patients through their visit:
 * Step 1: What happened (diagnoses, key topics)
 * Step 2: What changed (medications, action items)
 * Step 3: What's next (tracking plans, follow-ups, Q&A)
 *
 * Designed for elderly users: large text, simple language, clear actions.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Card, spacing, Radius } from './ui';
import type { VisitWalkthrough as VisitWalkthroughType } from '@lumimd/sdk';
import { api } from '../lib/api/client';

// =============================================================================
// Types
// =============================================================================

type Props = {
  visible: boolean;
  walkthrough: VisitWalkthroughType;
  visitId: string;
  onDismiss: () => void;
  onFlag: () => void;
};

type QAEntry = {
  question: string;
  answer: string;
  source: string;
};

// =============================================================================
// Component
// =============================================================================

export function VisitWalkthrough({ visible, walkthrough, visitId, onDismiss, onFlag }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [customQuestion, setCustomQuestion] = useState('');
  const [customAnswers, setCustomAnswers] = useState<QAEntry[]>([]);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);

  const totalSteps = 3;
  const { whatHappened, whatChanged, whatsNext } = walkthrough.steps;

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const toggleQuestion = useCallback((index: number) => {
    setExpandedQuestions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const handleAskQuestion = useCallback(async () => {
    const q = customQuestion.trim();
    if (!q || isAskingQuestion) return;

    setIsAskingQuestion(true);
    try {
      const result = await api.visits.ask(visitId, q);
      setCustomAnswers((prev) => [
        ...prev,
        {
          question: q,
          answer: result.answer,
          source: result.source,
        },
      ]);
      setCustomQuestion('');
    } catch {
      setCustomAnswers((prev) => [
        ...prev,
        {
          question: q,
          answer: "I'm not sure about that one. Your care team would be the best people to ask.",
          source: 'error',
        },
      ]);
      setCustomQuestion('');
    } finally {
      setIsAskingQuestion(false);
    }
  }, [customQuestion, isAskingQuestion, visitId]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onDismiss}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.backdrop} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.lumibotIcon}>
                <Ionicons name="sparkles" size={18} color="#fff" />
              </View>
              <Text style={styles.headerTitle}>LumiBot</Text>
            </View>
            <Pressable onPress={onDismiss} hitSlop={12}>
              <Ionicons name="close" size={24} color={Colors.textMuted} />
            </Pressable>
          </View>

          <Text style={styles.subtitle}>Let's go through your visit</Text>

          {/* Step content */}
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentInner}
            showsVerticalScrollIndicator={false}
          >
            {currentStep === 0 && (
              <StepWhatHappened data={whatHappened} onFlag={onFlag} />
            )}
            {currentStep === 1 && (
              <StepWhatChanged data={whatChanged} />
            )}
            {currentStep === 2 && (
              <StepWhatsNext
                data={whatsNext}
                suggestedQuestions={walkthrough.suggestedQuestions}
                expandedQuestions={expandedQuestions}
                onToggleQuestion={toggleQuestion}
                customQuestion={customQuestion}
                onChangeQuestion={setCustomQuestion}
                onAskQuestion={handleAskQuestion}
                isAskingQuestion={isAskingQuestion}
                customAnswers={customAnswers}
              />
            )}
          </ScrollView>

          {/* Footer navigation */}
          <View style={styles.footer}>
            <View style={styles.footerNav}>
              {currentStep > 0 ? (
                <Pressable onPress={handleBack} style={styles.backButton}>
                  <Ionicons name="chevron-back" size={20} color={Colors.primary} />
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>
              ) : (
                <View style={{ width: 80 }} />
              )}

              <Text style={styles.stepIndicator}>
                Step {currentStep + 1} of {totalSteps}
              </Text>

              {currentStep < totalSteps - 1 ? (
                <Pressable onPress={handleNext} style={styles.nextButton}>
                  <Text style={styles.nextButtonText}>Next</Text>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </Pressable>
              ) : (
                <Pressable onPress={onDismiss} style={styles.doneButton}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// =============================================================================
// Step 1: What Happened
// =============================================================================

function StepWhatHappened({
  data,
  onFlag,
}: {
  data: VisitWalkthroughType['steps']['whatHappened'];
  onFlag: () => void;
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{data.title}</Text>

      {data.diagnoses.length > 0 && (
        <View style={styles.itemGroup}>
          {data.diagnoses.map((diag, idx) => (
            <View key={idx} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Ionicons name="medical" size={18} color={Colors.primary} />
                <Text style={styles.itemName}>{diag.name}</Text>
                {diag.isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>New</Text>
                  </View>
                )}
              </View>
              <Text style={styles.itemDescription}>{diag.plainEnglish}</Text>
            </View>
          ))}
        </View>
      )}

      {data.keyTopics.length > 0 && (
        <View style={styles.itemGroup}>
          <Text style={styles.subheading}>Also discussed</Text>
          {data.keyTopics.map((topic, idx) => (
            <View key={idx} style={styles.topicRow}>
              <Ionicons name="chatbubble-outline" size={16} color={Colors.textMuted} />
              <Text style={styles.topicText}>{topic}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.flagSection}>
        <Text style={styles.flagPrompt}>{data.flagPrompt}</Text>
        <View style={styles.flagButtons}>
          <Pressable style={styles.flagButton} onPress={onFlag}>
            <Ionicons name="flag-outline" size={18} color={Colors.coral} />
            <Text style={styles.flagButtonText}>Something seems off</Text>
          </Pressable>
          <Pressable style={styles.looksGoodButton}>
            <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
            <Text style={styles.looksGoodText}>Looks good</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// =============================================================================
// Step 2: What Changed
// =============================================================================

function StepWhatChanged({
  data,
}: {
  data: VisitWalkthroughType['steps']['whatChanged'];
}) {
  const hasMeds = data.medicationsStarted.length > 0 ||
    data.medicationsStopped.length > 0 ||
    data.medicationsChanged.length > 0;

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{data.title}</Text>

      {hasMeds && (
        <View style={styles.itemGroup}>
          {data.medicationsStarted.length > 0 && (
            <>
              <Text style={styles.subheading}>Started</Text>
              {data.medicationsStarted.map((med, idx) => (
                <View key={idx} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Ionicons name="add-circle" size={18} color={Colors.success} />
                    <Text style={styles.itemName}>{med.name}</Text>
                  </View>
                  {(med.dose || med.frequency) && (
                    <Text style={styles.medDetail}>
                      {[med.dose, med.frequency].filter(Boolean).join(' • ')}
                    </Text>
                  )}
                  <Text style={styles.itemDescription}>{med.plainEnglish}</Text>
                  <Text style={styles.disclaimer}>{med.disclaimer}</Text>
                </View>
              ))}
            </>
          )}

          {data.medicationsStopped.length > 0 && (
            <>
              <Text style={styles.subheading}>Stopped</Text>
              {data.medicationsStopped.map((med, idx) => (
                <View key={idx} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Ionicons name="remove-circle" size={18} color={Colors.coral} />
                    <Text style={styles.itemName}>{med.name}</Text>
                  </View>
                  <Text style={styles.itemDescription}>{med.plainEnglish}</Text>
                </View>
              ))}
            </>
          )}

          {data.medicationsChanged.length > 0 && (
            <>
              <Text style={styles.subheading}>Changed</Text>
              {data.medicationsChanged.map((med, idx) => (
                <View key={idx} style={styles.itemCard}>
                  <View style={styles.itemHeader}>
                    <Ionicons name="swap-horizontal" size={18} color={Colors.warning} />
                    <Text style={styles.itemName}>{med.name}</Text>
                  </View>
                  <Text style={styles.medDetail}>{med.change}</Text>
                  <Text style={styles.itemDescription}>{med.plainEnglish}</Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {data.newActionItems.length > 0 && (
        <View style={styles.itemGroup}>
          <Text style={styles.subheading}>Action Items</Text>
          {data.newActionItems.map((item, idx) => (
            <View key={idx} style={styles.actionRow}>
              <Ionicons name="ellipse-outline" size={16} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>{item.description}</Text>
                {item.dueDate && (
                  <Text style={styles.actionDue}>{item.dueDate}</Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {!hasMeds && data.newActionItems.length === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle" size={32} color={Colors.success} />
          <Text style={styles.emptyText}>No medication changes this visit.</Text>
        </View>
      )}
    </View>
  );
}

// =============================================================================
// Step 3: What's Next + Q&A
// =============================================================================

function StepWhatsNext({
  data,
  suggestedQuestions,
  expandedQuestions,
  onToggleQuestion,
  customQuestion,
  onChangeQuestion,
  onAskQuestion,
  isAskingQuestion,
  customAnswers,
}: {
  data: VisitWalkthroughType['steps']['whatsNext'];
  suggestedQuestions: VisitWalkthroughType['suggestedQuestions'];
  expandedQuestions: Set<number>;
  onToggleQuestion: (index: number) => void;
  customQuestion: string;
  onChangeQuestion: (text: string) => void;
  onAskQuestion: () => void;
  isAskingQuestion: boolean;
  customAnswers: QAEntry[];
}) {
  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>{data.title}</Text>

      {data.trackingPlans.length > 0 && (
        <View style={styles.itemGroup}>
          <Text style={styles.subheading}>Health Tracking</Text>
          {data.trackingPlans.map((plan, idx) => (
            <View key={idx} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <Ionicons name="pulse" size={18} color={Colors.primary} />
                <Text style={styles.itemName}>{plan.what}</Text>
              </View>
              <Text style={styles.itemDescription}>{plan.why}</Text>
              <Text style={styles.trackingWhen}>{plan.when}</Text>
            </View>
          ))}
        </View>
      )}

      {data.followUps.length > 0 && (
        <View style={styles.itemGroup}>
          <Text style={styles.subheading}>Follow-ups</Text>
          {data.followUps.map((fu, idx) => (
            <View key={idx} style={styles.actionRow}>
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionText}>{fu.description}</Text>
                {fu.dueBy && <Text style={styles.actionDue}>{fu.dueBy}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.closingMessage}>{data.closingMessage}</Text>

      {/* Suggested Q&A */}
      {suggestedQuestions.length > 0 && (
        <View style={styles.qaSection}>
          <Text style={styles.qaTitle}>Common Questions</Text>
          {suggestedQuestions.map((sq, idx) => (
            <Pressable
              key={idx}
              style={styles.qaCard}
              onPress={() => onToggleQuestion(idx)}
            >
              <View style={styles.qaHeader}>
                <Text style={styles.qaQuestion}>{sq.question}</Text>
                <Ionicons
                  name={expandedQuestions.has(idx) ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.textMuted}
                />
              </View>
              {expandedQuestions.has(idx) && (
                <View style={styles.qaAnswer}>
                  <Text style={styles.qaAnswerText}>{sq.answer}</Text>
                  <Text style={styles.qaDisclaimer}>
                    Your care team is always the best resource for questions about your health.
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}

      {/* Custom answers */}
      {customAnswers.length > 0 && (
        <View style={styles.customAnswersSection}>
          {customAnswers.map((entry, idx) => (
            <View key={idx} style={styles.customAnswerCard}>
              <Text style={styles.customQuestionText}>You asked: {entry.question}</Text>
              <Text style={styles.qaAnswerText}>{entry.answer}</Text>
              <Text style={styles.qaDisclaimer}>
                Your care team is always the best resource for questions about your health.
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Ask something else */}
      <View style={styles.askSection}>
        <Text style={styles.askLabel}>Ask something else</Text>
        <View style={styles.askRow}>
          <TextInput
            style={styles.askInput}
            placeholder="Type your question..."
            placeholderTextColor={Colors.textMuted}
            value={customQuestion}
            onChangeText={onChangeQuestion}
            maxLength={500}
            returnKeyType="send"
            onSubmitEditing={onAskQuestion}
            editable={!isAskingQuestion}
          />
          <Pressable
            style={[styles.askButton, (!customQuestion.trim() || isAskingQuestion) && styles.askButtonDisabled]}
            onPress={onAskQuestion}
            disabled={!customQuestion.trim() || isAskingQuestion}
          >
            {isAskingQuestion ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>

      <Text style={styles.tier2Disclaimer}>
        For informational and tracking purposes only. Not medical advice.
      </Text>
    </View>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(5),
    paddingTop: spacing(5),
    paddingBottom: spacing(2),
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  lumibotIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.textMuted,
    paddingHorizontal: spacing(5),
    marginBottom: spacing(3),
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(4),
  },
  stepContainer: {
    gap: spacing(4),
  },
  stepTitle: {
    fontSize: 22,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    marginBottom: spacing(1),
  },
  subheading: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
    marginBottom: spacing(1),
    marginTop: spacing(2),
  },
  itemGroup: {
    gap: spacing(2),
  },
  itemCard: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.md,
    padding: spacing(4),
    gap: spacing(2),
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
  },
  itemName: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
    flex: 1,
  },
  itemDescription: {
    fontSize: 16,
    color: Colors.textWarm,
    lineHeight: 24,
  },
  newBadge: {
    backgroundColor: `${Colors.primary}20`,
    paddingHorizontal: spacing(2),
    paddingVertical: 2,
    borderRadius: 8,
  },
  newBadgeText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
  },
  topicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(1),
  },
  topicText: {
    fontSize: 16,
    color: Colors.textWarm,
  },
  flagSection: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.md,
    padding: spacing(4),
    gap: spacing(3),
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  flagPrompt: {
    fontSize: 15,
    color: Colors.textMuted,
    lineHeight: 22,
  },
  flagButtons: {
    flexDirection: 'row',
    gap: spacing(3),
  },
  flagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  flagButtonText: {
    fontSize: 14,
    color: Colors.coral,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  looksGoodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  looksGoodText: {
    fontSize: 14,
    color: Colors.success,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  medDetail: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  disclaimer: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(2),
    paddingVertical: spacing(2),
  },
  actionText: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 22,
  },
  actionDue: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing(2),
    paddingVertical: spacing(6),
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textMuted,
  },
  trackingWhen: {
    fontSize: 14,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  closingMessage: {
    fontSize: 16,
    color: Colors.textWarm,
    lineHeight: 24,
    fontStyle: 'italic',
    paddingVertical: spacing(2),
  },
  qaSection: {
    gap: spacing(2),
    marginTop: spacing(2),
  },
  qaTitle: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.text,
  },
  qaCard: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.md,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  qaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qaQuestion: {
    fontSize: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.primary,
    flex: 1,
    marginRight: spacing(2),
  },
  qaAnswer: {
    marginTop: spacing(3),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: Colors.stroke,
    gap: spacing(2),
  },
  qaAnswerText: {
    fontSize: 16,
    color: Colors.textWarm,
    lineHeight: 24,
  },
  qaDisclaimer: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  customAnswersSection: {
    gap: spacing(2),
  },
  customAnswerCard: {
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.md,
    padding: spacing(4),
    gap: spacing(2),
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  customQuestionText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
  },
  askSection: {
    gap: spacing(2),
    marginTop: spacing(2),
  },
  askLabel: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    color: Colors.textMuted,
  },
  askRow: {
    flexDirection: 'row',
    gap: spacing(2),
    alignItems: 'center',
  },
  askInput: {
    flex: 1,
    backgroundColor: Colors.surfaceWarm,
    borderRadius: Radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.stroke,
  },
  askButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askButtonDisabled: {
    opacity: 0.4,
  },
  tier2Disclaimer: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(4),
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: Colors.stroke,
  },
  footerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepIndicator: {
    fontSize: 14,
    color: Colors.textMuted,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    width: 80,
  },
  backButtonText: {
    fontSize: 16,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    backgroundColor: Colors.accent,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(4),
    borderRadius: Radius.md,
  },
  nextButtonText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
  doneButton: {
    backgroundColor: Colors.accent,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(5),
    borderRadius: Radius.md,
  },
  doneButtonText: {
    fontSize: 16,
    color: '#fff',
    fontFamily: 'PlusJakartaSans_600SemiBold',
  },
});
