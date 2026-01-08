/**
 * ShareConfirmationSheet
 * 
 * Bottom sheet that appears after visit processing completes,
 * allowing the user to select which caregivers to share with.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Animated,
    Dimensions,
    Switch,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';
import { api } from '../lib/api/client';
import { getIdToken } from '../lib/auth';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Caregiver {
    id: string;
    name: string;
    email: string;
    relationship?: string;
    status: 'pending' | 'active' | 'paused';
}

interface ShareConfirmationSheetProps {
    visible: boolean;
    visitId: string;
    onClose: () => void;
    onShareComplete?: (sent: number, failed: number) => void;
}

export function ShareConfirmationSheet({
    visible,
    visitId,
    onClose,
    onShareComplete,
}: ShareConfirmationSheetProps) {
    const [caregivers, setCaregivers] = useState<Caregiver[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [autoShare, setAutoShare] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [slideAnim] = useState(new Animated.Value(SCREEN_HEIGHT));

    // Load caregivers when sheet opens
    useEffect(() => {
        if (visible) {
            loadCaregivers();
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 65,
                friction: 10,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: SCREEN_HEIGHT,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, slideAnim]);

    const loadCaregivers = async () => {
        setLoading(true);
        try {
            const response = await api.user.listCaregivers();
            const activeCaregivers = (response.caregivers || []).filter(
                (c: Caregiver) => c.status !== 'paused'
            );
            setCaregivers(activeCaregivers);
            // Select all by default
            setSelectedIds(new Set(activeCaregivers.map((c: Caregiver) => c.id)));
            setAutoShare(response.autoShareWithCaregivers || false);
        } catch (error) {
            console.error('Failed to load caregivers:', error);
            setCaregivers([]);
        } finally {
            setLoading(false);
        }
    };

    const toggleCaregiver = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    const handleShare = async () => {
        if (selectedIds.size === 0) {
            onClose();
            return;
        }

        setSending(true);
        try {
            // Update auto-share preference if changed
            if (autoShare) {
                await api.user.updateProfile({ autoShareWithCaregivers: true });
            }

            // Share with selected caregivers
            const token = await getIdToken();
            if (!token) {
                Alert.alert('Error', 'Please sign in again to share.');
                return;
            }

            const response = await fetch(
                `${process.env.EXPO_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api'}/v1/visits/${visitId}/share-with-caregivers`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        caregiverIds: Array.from(selectedIds),
                    }),
                }
            );

            const result = await response.json();

            if (response.ok) {
                onShareComplete?.(result.sent || 0, result.failed || 0);
                onClose();
            } else {
                Alert.alert('Sharing Failed', result.message || 'Could not share with caregivers');
            }
        } catch (error) {
            console.error('Failed to share with caregivers:', error);
            Alert.alert('Error', 'Failed to share visit summary. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const handleSkip = () => {
        onClose();
    };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    style={styles.backdrop}
                    activeOpacity={1}
                    onPress={onClose}
                />
                <Animated.View
                    style={[
                        styles.sheet,
                        { transform: [{ translateY: slideAnim }] },
                    ]}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.handle} />
                        <Text style={styles.title}>Share with Caregivers</Text>
                        <Text style={styles.subtitle}>
                            Send this visit summary to your caregivers
                        </Text>
                    </View>

                    {/* Content */}
                    <View style={styles.content}>
                        {loading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={Colors.primary} />
                                <Text style={styles.loadingText}>Loading caregivers...</Text>
                            </View>
                        ) : caregivers.length === 0 ? (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
                                <Text style={styles.emptyText}>No caregivers added yet</Text>
                                <Text style={styles.emptyHint}>
                                    Add caregivers in Settings to share visit summaries
                                </Text>
                            </View>
                        ) : (
                            <>
                                {/* Caregiver List */}
                                <View style={styles.caregiverList}>
                                    {caregivers.map((caregiver) => (
                                        <TouchableOpacity
                                            key={caregiver.id}
                                            style={styles.caregiverRow}
                                            onPress={() => toggleCaregiver(caregiver.id)}
                                        >
                                            <View style={styles.caregiverInfo}>
                                                <Text style={styles.caregiverName}>
                                                    {caregiver.name}
                                                </Text>
                                                <Text style={styles.caregiverEmail}>
                                                    {caregiver.email}
                                                </Text>
                                            </View>
                                            <View style={[
                                                styles.checkbox,
                                                selectedIds.has(caregiver.id) && styles.checkboxChecked,
                                            ]}>
                                                {selectedIds.has(caregiver.id) && (
                                                    <Ionicons name="checkmark" size={16} color="#fff" />
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Auto-share toggle */}
                                <View style={styles.autoShareRow}>
                                    <View style={styles.autoShareInfo}>
                                        <Text style={styles.autoShareLabel}>
                                            Always share automatically
                                        </Text>
                                        <Text style={styles.autoShareHint}>
                                            Skip this screen for future visits
                                        </Text>
                                    </View>
                                    <Switch
                                        value={autoShare}
                                        onValueChange={setAutoShare}
                                        trackColor={{ false: Colors.stroke, true: `${Colors.primary}80` }}
                                        thumbColor={autoShare ? Colors.primary : '#f4f4f4'}
                                    />
                                </View>
                            </>
                        )}
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        {caregivers.length > 0 && (
                            <TouchableOpacity
                                style={[
                                    styles.shareButton,
                                    selectedIds.size === 0 && styles.shareButtonDisabled,
                                ]}
                                onPress={handleShare}
                                disabled={sending}
                            >
                                {sending ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="send" size={18} color="#fff" />
                                        <Text style={styles.shareButtonText}>
                                            {selectedIds.size === 0
                                                ? 'Skip'
                                                : `Share with ${selectedIds.size} caregiver${selectedIds.size > 1 ? 's' : ''}`}
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
                            <Text style={styles.skipButtonText}>
                                {caregivers.length > 0 ? "Don't share this time" : 'Close'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    sheet: {
        backgroundColor: Colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.75,
        paddingBottom: spacing(8),
    },
    header: {
        alignItems: 'center',
        paddingTop: spacing(3),
        paddingBottom: spacing(4),
        paddingHorizontal: spacing(6),
    },
    handle: {
        width: 36,
        height: 4,
        backgroundColor: Colors.stroke,
        borderRadius: 2,
        marginBottom: spacing(4),
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: Colors.text,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: spacing(2),
    },
    content: {
        paddingHorizontal: spacing(6),
    },
    loadingContainer: {
        alignItems: 'center',
        paddingVertical: spacing(8),
    },
    loadingText: {
        marginTop: spacing(3),
        fontSize: 14,
        color: Colors.textMuted,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: spacing(8),
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginTop: spacing(3),
    },
    emptyHint: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: spacing(2),
    },
    caregiverList: {
        gap: spacing(2),
    },
    caregiverRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(3),
        paddingHorizontal: spacing(4),
        backgroundColor: Colors.surface,
        borderRadius: Radius.md,
        borderWidth: 1,
        borderColor: Colors.stroke,
    },
    caregiverInfo: {
        flex: 1,
    },
    caregiverName: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    caregiverEmail: {
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 2,
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: Colors.stroke,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    autoShareRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing(4),
        marginTop: spacing(4),
        borderTopWidth: 1,
        borderTopColor: Colors.stroke,
    },
    autoShareInfo: {
        flex: 1,
    },
    autoShareLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: Colors.text,
    },
    autoShareHint: {
        fontSize: 13,
        color: Colors.textMuted,
        marginTop: 2,
    },
    footer: {
        paddingHorizontal: spacing(6),
        paddingTop: spacing(4),
    },
    shareButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing(2),
        backgroundColor: Colors.accent,
        borderRadius: Radius.md,
        paddingVertical: spacing(4),
    },
    shareButtonDisabled: {
        backgroundColor: Colors.textMuted,
    },
    shareButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    skipButton: {
        alignItems: 'center',
        paddingVertical: spacing(4),
    },
    skipButtonText: {
        fontSize: 15,
        color: Colors.textMuted,
    },
});
