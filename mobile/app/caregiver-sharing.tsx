import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Share, ShareInvite } from '@lumimd/sdk';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import {
  useInviteCaregiver,
  useMyShareInvites,
  useRevokeShareAccess,
  useRevokeShareInvite,
  useShares,
} from '../lib/api/hooks';

type PendingItem = {
  kind: 'share' | 'invite';
  id: string;
  email: string;
  createdAt?: string | null;
  emailSent?: boolean;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function getInviteEmail(invite: ShareInvite): string {
  return (invite.caregiverEmail || invite.inviteeEmail || '').trim();
}

function getTimestamp(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString();
}

function getDisplayNameFromEmail(email: string): string {
  const [name] = email.split('@');
  if (!name) return 'Caregiver';
  return name
    .split(/[._-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const typed = error as { message?: string; userMessage?: string; code?: string };
    if (typed.userMessage) return typed.userMessage;
    if (typed.code === 'invite_exists') return 'An invitation has already been sent to this email.';
    if (typed.code === 'share_exists') return 'You are already sharing with this caregiver.';
    if (typed.code === 'invalid_share') return 'You cannot share with your own email address.';
    if (typed.message) return typed.message;
  }
  return fallback;
}

export default function CaregiverSharingScreen() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading, user } = useAuth();

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  const {
    data: shares = [],
    isLoading: isLoadingShares,
    isRefetching: isRefetchingShares,
    error: sharesError,
    refetch: refetchShares,
  } = useShares(user?.uid, {
    enabled: isAuthenticated,
  });

  const {
    data: invites = [],
    isLoading: isLoadingInvites,
    isRefetching: isRefetchingInvites,
    error: invitesError,
    refetch: refetchInvites,
  } = useMyShareInvites(user?.uid, {
    enabled: isAuthenticated,
  });

  const inviteCaregiver = useInviteCaregiver();
  const revokeShareAccess = useRevokeShareAccess();
  const revokeShareInvite = useRevokeShareInvite();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/sign-in');
    }
  }, [authLoading, isAuthenticated, router]);

  const outgoingShares = useMemo(
    () => shares.filter((share) => share.type === 'outgoing' && share.status !== 'revoked'),
    [shares],
  );

  const activeShares = useMemo(
    () =>
      outgoingShares
        .filter((share) => share.status === 'accepted')
        .sort((a, b) => getTimestamp(b.updatedAt || b.createdAt) - getTimestamp(a.updatedAt || a.createdAt)),
    [outgoingShares],
  );

  const pendingShares = useMemo(
    () =>
      outgoingShares
        .filter((share) => share.status === 'pending')
        .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt)),
    [outgoingShares],
  );

  const pendingInvites = useMemo(
    () =>
      invites
        .filter((invite) => invite.status === 'pending')
        .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt)),
    [invites],
  );

  const pendingItems = useMemo<PendingItem[]>(() => {
    const items: PendingItem[] = [];
    const seenKeys = new Set<string>();

    pendingShares.forEach((share) => {
      const email = share.caregiverEmail || '';
      const dedupeKey = normalizeEmail(email) || `share:${share.id}`;
      seenKeys.add(dedupeKey);
      items.push({
        kind: 'share',
        id: share.id,
        email,
        createdAt: share.createdAt,
      });
    });

    pendingInvites.forEach((invite) => {
      const email = getInviteEmail(invite);
      const dedupeKey = normalizeEmail(email) || `invite:${invite.id}`;
      if (seenKeys.has(dedupeKey)) {
        return;
      }
      seenKeys.add(dedupeKey);
      items.push({
        kind: 'invite',
        id: invite.id,
        email,
        createdAt: invite.createdAt,
        emailSent: invite.emailSent,
      });
    });

    return items.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
  }, [pendingInvites, pendingShares]);

  const isInitialLoading = isLoadingShares || isLoadingInvites;
  const isRefreshing = isRefetchingShares || isRefetchingInvites;
  const hasBlockingLoadError = Boolean(sharesError && invitesError);
  const partialLoadError = sharesError || invitesError;

  const onRefresh = async () => {
    await Promise.all([refetchShares(), refetchInvites()]);
  };

  const closeInviteModal = () => {
    if (inviteCaregiver.isPending) return;
    setShowInviteModal(false);
    setInviteEmail('');
    setInviteMessage('');
  };

  const handleSendInvite = async () => {
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Missing email', 'Please enter a caregiver email address.');
      return;
    }

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      Alert.alert('Invalid email', 'Please enter a valid email address.');
      return;
    }

    try {
      const result = await inviteCaregiver.mutateAsync({
        caregiverEmail: normalizedEmail,
        message: inviteMessage.trim() || undefined,
      });

      closeInviteModal();

      const inviteResult = result as ShareInvite;
      const successMessage =
        inviteResult.emailSent === false
          ? 'Invitation created, but email delivery failed. You can retry from this screen later.'
          : 'Invitation sent successfully.';

      Alert.alert('Invitation sent', successMessage);
    } catch (error) {
      Alert.alert('Unable to invite caregiver', getErrorMessage(error, 'Please try again.'));
    }
  };

  const confirmRevokeShare = (share: Share) => {
    const email = share.caregiverEmail || 'this caregiver';
    Alert.alert(
      'Remove caregiver access',
      `Are you sure you want to remove ${email}'s access?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const key = `share:${share.id}`;
            try {
              setWorkingKey(key);
              await revokeShareAccess.mutateAsync(share.id);
              Alert.alert('Access removed', 'Caregiver access was removed successfully.');
            } catch (error) {
              Alert.alert('Unable to remove access', getErrorMessage(error, 'Please try again.'));
            } finally {
              setWorkingKey(null);
            }
          },
        },
      ],
    );
  };

  const confirmCancelPending = (item: PendingItem) => {
    Alert.alert(
      'Cancel invitation',
      `Cancel the invitation for ${item.email || 'this caregiver'}?`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Invite',
          style: 'destructive',
          onPress: async () => {
            const key = `${item.kind}:${item.id}`;
            try {
              setWorkingKey(key);
              if (item.kind === 'share') {
                await revokeShareAccess.mutateAsync(item.id);
              } else {
                await revokeShareInvite.mutateAsync(item.id);
              }
              Alert.alert('Invitation cancelled', 'The invitation was cancelled successfully.');
            } catch (error) {
              Alert.alert('Unable to cancel invite', getErrorMessage(error, 'Please try again.'));
            } finally {
              setWorkingKey(null);
            }
          },
        },
      ],
    );
  };

  if (authLoading) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (isInitialLoading) {
    return (
      <SafeAreaView style={styles.loadingSafe}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </SafeAreaView>
    );
  }

  if (hasBlockingLoadError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={28} color={Colors.text} />
            </Pressable>
            <Text style={styles.headerTitle}>Caregiver Sharing</Text>
            <View style={styles.addButton} />
          </View>

          <Card style={styles.errorCard}>
            <Ionicons name="alert-circle" size={24} color={Colors.error} />
            <Text style={styles.errorTitle}>Unable to load caregivers</Text>
            <Text style={styles.errorBody}>
              {getErrorMessage(partialLoadError, 'Please try again.')}
            </Text>
            <Pressable style={styles.retryButton} onPress={onRefresh}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </Card>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Caregiver Sharing</Text>
          <Pressable style={styles.addButton} onPress={() => setShowInviteModal(true)}>
            <Ionicons name="person-add" size={22} color={Colors.primary} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {partialLoadError && !hasBlockingLoadError && (
            <Card style={styles.warningCard}>
              <Ionicons name="warning-outline" size={18} color={Colors.warning} />
              <Text style={styles.warningText}>
                {getErrorMessage(
                  partialLoadError,
                  'Some caregiver data is temporarily unavailable. Pull to refresh.',
                )}
              </Text>
            </Card>
          )}

          <Text style={styles.sectionSubtitle}>
            Share your health information securely with family members and caregivers.
          </Text>

          <View style={styles.securityBanner}>
            <View style={styles.securityIcon}>
              <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.securityTitle}>End-to-end encrypted</Text>
              <Text style={styles.securityText}>Caregivers can view but not modify your data</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Shared Caregivers</Text>
              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountText}>{activeShares.length}</Text>
              </View>
            </View>

            {activeShares.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="people-outline" size={22} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No caregivers yet</Text>
                <Text style={styles.emptyBody}>
                  Invite a caregiver to share your visits, medications, and action items.
                </Text>
              </Card>
            ) : (
              activeShares.map((share, index) => {
                const email = share.caregiverEmail || 'caregiver';
                const displayName = getDisplayNameFromEmail(email);
                const initials = displayName
                  .split(' ')
                  .filter(Boolean)
                  .map((word) => word[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase();
                const busy = workingKey === `share:${share.id}`;

                return (
                  <Card key={share.id} style={[styles.caregiverCard, index > 0 && { marginTop: spacing(3) }]}>
                    <View style={styles.cardHeader}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials || 'CG'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.caregiverName}>{displayName}</Text>
                        <Text style={styles.emailText}>{email}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: 'rgba(52,211,153,0.15)' }]}>
                        <Text style={[styles.statusLabel, { color: Colors.success }]}>ACTIVE</Text>
                      </View>
                    </View>

                    <View style={styles.permissionsRow}>
                      <View style={[styles.permissionChip, styles.permissionActive]}>
                        <Ionicons name="document-text" size={14} color={Colors.primary} />
                        <Text style={[styles.permissionText, styles.permissionTextActive]}>Visits</Text>
                      </View>
                      <View style={[styles.permissionChip, styles.permissionActive]}>
                        <Ionicons name="medical" size={14} color={Colors.primary} />
                        <Text style={[styles.permissionText, styles.permissionTextActive]}>Meds</Text>
                      </View>
                      <View style={[styles.permissionChip, styles.permissionActive]}>
                        <Ionicons name="checkbox" size={14} color={Colors.primary} />
                        <Text style={[styles.permissionText, styles.permissionTextActive]}>Actions</Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={styles.footerInfo}>Viewer access</Text>
                      <Pressable
                        style={[styles.manageButton, busy && styles.disabledButton]}
                        onPress={() => confirmRevokeShare(share)}
                        disabled={busy}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={Colors.error} />
                        ) : (
                          <>
                            <Text style={styles.manageButtonTextDanger}>Remove Access</Text>
                            <Ionicons name="trash-outline" size={16} color={Colors.error} />
                          </>
                        )}
                      </Pressable>
                    </View>
                  </Card>
                );
              })
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Pending Invitations</Text>
              <View style={styles.sectionCount}>
                <Text style={styles.sectionCountText}>{pendingItems.length}</Text>
              </View>
            </View>

            {pendingItems.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Ionicons name="mail-outline" size={22} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No pending invites</Text>
                <Text style={styles.emptyBody}>New invitations will appear here until accepted.</Text>
              </Card>
            ) : (
              pendingItems.map((item, index) => {
                const busy = workingKey === `${item.kind}:${item.id}`;
                const sentDate = formatDate(item.createdAt);

                return (
                  <Card key={`${item.kind}:${item.id}`} style={[styles.caregiverCard, index > 0 && { marginTop: spacing(3) }]}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.avatar, styles.avatarPending]}>
                        <Text style={styles.avatarText}>IN</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.caregiverName}>{item.email || 'Invitation'}</Text>
                        <Text style={styles.caregiverRelation}>
                          {sentDate ? `Sent ${sentDate}` : 'Invitation pending'}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: 'rgba(251,191,36,0.15)' }]}>
                        <Text style={[styles.statusLabel, { color: Colors.warning }]}>PENDING</Text>
                      </View>
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={styles.footerInfo}>
                        {item.emailSent === false ? 'Email delivery needs retry' : 'Awaiting acceptance'}
                      </Text>
                      <Pressable
                        style={[styles.manageButton, busy && styles.disabledButton]}
                        onPress={() => confirmCancelPending(item)}
                        disabled={busy}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color={Colors.error} />
                        ) : (
                          <>
                            <Text style={styles.manageButtonTextDanger}>Cancel Invite</Text>
                            <Ionicons name="close-circle-outline" size={16} color={Colors.error} />
                          </>
                        )}
                      </Pressable>
                    </View>
                  </Card>
                );
              })
            )}
          </View>

          <Pressable style={styles.addCaregiverButton} onPress={() => setShowInviteModal(true)}>
            <Ionicons name="add-circle" size={22} color={Colors.primary} />
            <Text style={styles.addCaregiverText}>Invite a Caregiver</Text>
          </Pressable>

          <Text style={styles.helpText}>
            Caregivers receive an email invitation and can only view shared records as a read-only user.
          </Text>
        </ScrollView>
      </View>

      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={closeInviteModal}
      >
        <Pressable style={styles.modalOverlay} onPress={closeInviteModal}>
          <Pressable style={styles.modalContent} onPress={(event) => event.stopPropagation()}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <Text style={styles.modalTitle}>Invite Caregiver</Text>
              <Text style={styles.modalSubtitle}>
                Enter the caregiver email address. They will receive a secure invitation.
              </Text>

              <Text style={styles.inputLabel}>Caregiver Email</Text>
              <TextInput
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="caregiver@email.com"
                placeholderTextColor={Colors.textMuted}
                style={styles.input}
                editable={!inviteCaregiver.isPending}
              />

              <Text style={styles.inputLabel}>Message (Optional)</Text>
              <TextInput
                value={inviteMessage}
                onChangeText={setInviteMessage}
                placeholder="Add a short note"
                placeholderTextColor={Colors.textMuted}
                style={[styles.input, styles.messageInput]}
                multiline
                numberOfLines={3}
                editable={!inviteCaregiver.isPending}
              />

              <View style={styles.modalActions}>
                <Pressable
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={closeInviteModal}
                  disabled={inviteCaregiver.isPending}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>

                <Pressable
                  style={[styles.modalButton, styles.sendButton, inviteCaregiver.isPending && styles.disabledButton]}
                  onPress={handleSendInvite}
                  disabled={inviteCaregiver.isPending}
                >
                  {inviteCaregiver.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.sendButtonText}>Send Invite</Text>
                  )}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loadingSafe: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing(5),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing(4),
  },
  backButton: {
    padding: spacing(1),
    width: 36,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  addButton: {
    padding: spacing(1),
    width: 36,
    alignItems: 'flex-end',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing(4),
  },
  securityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    padding: spacing(4),
    backgroundColor: 'rgba(64,201,208,0.08)',
    borderRadius: Radius.lg,
    marginBottom: spacing(6),
  },
  securityIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(64,201,208,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  securityText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  section: {
    marginBottom: spacing(6),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginBottom: spacing(3),
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  sectionCount: {
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: 8,
    backgroundColor: 'rgba(64,201,208,0.15)',
  },
  sectionCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  caregiverCard: {
    padding: spacing(4),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPending: {
    backgroundColor: Colors.textMuted,
  },
  avatarText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  caregiverName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  caregiverRelation: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    borderRadius: 999,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  permissionsRow: {
    flexDirection: 'row',
    gap: spacing(2),
    marginTop: spacing(4),
    paddingTop: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  permissionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: Radius.md,
    backgroundColor: 'rgba(100,116,139,0.08)',
  },
  permissionActive: {
    backgroundColor: 'rgba(64,201,208,0.12)',
  },
  permissionText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textMuted,
  },
  permissionTextActive: {
    color: Colors.primary,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing(4),
    paddingTop: spacing(3),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
  footerInfo: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  emailText: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 2,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(1),
  },
  manageButtonTextDanger: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.error,
  },
  disabledButton: {
    opacity: 0.6,
  },
  addCaregiverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(4),
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    gap: spacing(2),
  },
  addCaregiverText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  helpText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: spacing(4),
    marginBottom: spacing(8),
    paddingHorizontal: spacing(4),
    lineHeight: 20,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing(2),
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyBody: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorCard: {
    marginTop: spacing(4),
    alignItems: 'center',
    gap: spacing(2),
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    marginBottom: spacing(3),
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  errorBody: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing(2),
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: spacing(5),
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: spacing(4),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSubtitle: {
    marginTop: spacing(1),
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  inputLabel: {
    marginTop: spacing(3),
    marginBottom: spacing(1),
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    fontSize: 14,
    color: Colors.text,
    backgroundColor: '#fff',
  },
  messageInput: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing(2),
    marginTop: spacing(4),
  },
  modalButton: {
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing(2.5),
    paddingHorizontal: spacing(3),
    borderRadius: Radius.md,
  },
  cancelButton: {
    backgroundColor: 'rgba(100,116,139,0.12)',
  },
  cancelButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    backgroundColor: Colors.primary,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
