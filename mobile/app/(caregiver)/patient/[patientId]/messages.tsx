import React, { useCallback, useRef, useState, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FlatList,
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../../../../components/ui';
import {
  useCareMessages,
  useSendCareMessage,
  useCareQuickOverview,
  CareMessageItem,
} from '../../../../lib/api/hooks';

function MessageBubble({ msg }: { msg: CareMessageItem }) {
  const date = new Date(msg.createdAt);
  const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <View style={bubbleStyles.container}>
      <View style={bubbleStyles.bubble}>
        <Text style={bubbleStyles.text}>{msg.message}</Text>
      </View>
      <View style={bubbleStyles.metaRow}>
        <Text style={bubbleStyles.time}>{dateStr}, {timeStr}</Text>
        {msg.readAt && (
          <View style={bubbleStyles.readIndicator}>
            <Ionicons name="checkmark-done" size={12} color={Colors.primary} />
            <Text style={bubbleStyles.readText}>Read</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  container: {
    alignItems: 'flex-end',
    marginBottom: spacing(3),
    paddingLeft: spacing(10),
  },
  bubble: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    borderBottomRightRadius: 4,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    maxWidth: '100%',
  },
  text: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    marginTop: 4,
  },
  time: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
  },
  readIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  readText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.primary,
  },
});

export default function CaregiverMessagesScreen() {
  const { patientId, prefill } = useLocalSearchParams<{ patientId: string; prefill?: string }>();
  const router = useRouter();
  const [text, setText] = useState(prefill ?? '');
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList>(null);

  const { data: overview } = useCareQuickOverview(patientId);
  const { data: messages, isLoading, refetch } = useCareMessages(patientId);
  const sendMutation = useSendCareMessage();

  const [remainingToday, setRemainingToday] = useState<number | null>(null);

  // Focus input if prefill is provided
  useEffect(() => {
    if (prefill) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [prefill]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || !patientId) return;

    try {
      const result = await sendMutation.mutateAsync({ patientId, message: trimmed });
      setText('');
      if (result && typeof (result as any).remainingToday === 'number') {
        setRemainingToday((result as any).remainingToday);
      }
      refetch();
    } catch (err: any) {
      if (err?.status === 429 || err?.code === 'rate_limit') {
        Alert.alert('Limit Reached', 'You have reached your daily message limit for this patient.');
      } else {
        Alert.alert('Error', 'Failed to send message. Please try again.');
      }
    }
  }, [text, patientId, sendMutation, refetch]);

  const patientName = overview?.patientName ?? 'your patient';

  // Messages come in desc order from API; reverse for chronological display
  const chronoMessages = (messages ?? []).slice().reverse();

  const renderItem = useCallback(
    ({ item }: { item: CareMessageItem }) => <MessageBubble msg={item} />,
    [],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Messages</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.primary} />
          </View>
        ) : chronoMessages.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="chatbubble-outline" size={36} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Send your first message</Text>
            <Text style={styles.emptySubtitle}>
              Messages you send will appear in {patientName}'s inbox.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={chronoMessages}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Rate limit indicator */}
        {remainingToday !== null && (
          <View style={styles.rateLimitRow}>
            <Text style={styles.rateLimitText}>
              {remainingToday} message{remainingToday !== 1 ? 's' : ''} remaining today
            </Text>
          </View>
        )}

        {/* Input bar */}
        <SafeAreaView edges={['bottom']} style={styles.inputContainer}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={`Message ${patientName}...`}
            placeholderTextColor={Colors.textMuted}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <Pressable
            style={[
              styles.sendButton,
              (!text.trim() || sendMutation.isPending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing(4),
    paddingTop: spacing(2),
    paddingBottom: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderSubtle,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginHorizontal: spacing(2),
  },
  listContent: {
    paddingHorizontal: spacing(4),
    paddingTop: spacing(4),
    paddingBottom: spacing(2),
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(6),
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Fraunces_700Bold',
    color: Colors.text,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(1),
    lineHeight: 20,
  },
  rateLimitRow: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(1),
  },
  rateLimitText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: Colors.textMuted,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing(3),
    paddingTop: spacing(2),
    paddingBottom: spacing(2),
    borderTopWidth: 1,
    borderTopColor: Colors.borderSubtle,
    backgroundColor: Colors.surface,
    gap: spacing(2),
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: Colors.background,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.stroke,
    paddingHorizontal: spacing(3),
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: Colors.text,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
