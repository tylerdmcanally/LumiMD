import React from 'react';
import {
    SafeAreaView,
    View,
    Text,
    ScrollView,
    StyleSheet,
    Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius, Card } from '../components/ui';
import { haptic } from '../lib/haptics';

// Mock data for demonstration
const mockCaregivers = [
    {
        id: '1',
        name: 'Sarah Johnson',
        email: 'sarah.j@email.com',
        relationship: 'Daughter',
        status: 'active' as const,
        permissions: { visits: true, medications: true, actions: true },
    },
    {
        id: '2',
        name: 'Michael Johnson',
        email: 'mike.johnson@email.com',
        relationship: 'Son',
        status: 'active' as const,
        permissions: { visits: true, medications: true, actions: false },
    },
    {
        id: '3',
        name: 'Dr. Williams Office',
        email: 'care@drwilliams.com',
        relationship: 'Healthcare Provider',
        status: 'pending' as const,
        permissions: { visits: true, medications: false, actions: false },
    },
];

export default function CaregiverSharingScreen() {
    const router = useRouter();

    const renderCaregiverCard = (caregiver: typeof mockCaregivers[0], index: number) => {
        const initials = caregiver.name.split(' ').map(n => n[0]).join('');
        const isPending = caregiver.status === 'pending';

        return (
            <Card key={caregiver.id} style={[styles.caregiverCard, index > 0 && { marginTop: spacing(3) }]}>
                {/* Header: Avatar + Name + Status */}
                <View style={styles.cardHeader}>
                    <View style={[styles.avatar, isPending && styles.avatarPending]}>
                        <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.caregiverName}>{caregiver.name}</Text>
                        <Text style={styles.caregiverRelation}>{caregiver.relationship}</Text>
                    </View>
                    <View style={[
                        styles.statusBadge,
                        { backgroundColor: isPending ? 'rgba(251,191,36,0.15)' : 'rgba(52,211,153,0.15)' }
                    ]}>
                        <Text style={[
                            styles.statusLabel,
                            { color: isPending ? Colors.warning : Colors.success }
                        ]}>
                            {isPending ? 'Pending' : 'Active'}
                        </Text>
                    </View>
                </View>

                {/* Permissions Row */}
                <View style={styles.permissionsRow}>
                    <View style={[styles.permissionChip, caregiver.permissions.visits && styles.permissionActive]}>
                        <Ionicons
                            name="document-text"
                            size={14}
                            color={caregiver.permissions.visits ? Colors.primary : Colors.textMuted}
                        />
                        <Text style={[
                            styles.permissionText,
                            caregiver.permissions.visits && styles.permissionTextActive
                        ]}>Visits</Text>
                    </View>
                    <View style={[styles.permissionChip, caregiver.permissions.medications && styles.permissionActive]}>
                        <Ionicons
                            name="medical"
                            size={14}
                            color={caregiver.permissions.medications ? Colors.primary : Colors.textMuted}
                        />
                        <Text style={[
                            styles.permissionText,
                            caregiver.permissions.medications && styles.permissionTextActive
                        ]}>Meds</Text>
                    </View>
                    <View style={[styles.permissionChip, caregiver.permissions.actions && styles.permissionActive]}>
                        <Ionicons
                            name="checkbox"
                            size={14}
                            color={caregiver.permissions.actions ? Colors.primary : Colors.textMuted}
                        />
                        <Text style={[
                            styles.permissionText,
                            caregiver.permissions.actions && styles.permissionTextActive
                        ]}>Actions</Text>
                    </View>
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                    <View style={styles.emailRow}>
                        <Ionicons name="mail-outline" size={14} color={Colors.textMuted} />
                        <Text style={styles.emailText}>{caregiver.email}</Text>
                    </View>
                    <Pressable
                        style={styles.manageButton}
                        onPress={() => {
                            void haptic.selection();
                        }}
                    >
                        <Text style={styles.manageButtonText}>Manage</Text>
                        <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
                    </Pressable>
                </View>
            </Card>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <Pressable
                        onPress={() => {
                            void haptic.selection();
                            router.back();
                        }}
                        style={styles.backButton}
                    >
                        <Ionicons name="chevron-back" size={28} color={Colors.text} />
                    </Pressable>
                    <Text style={styles.headerTitle}>Caregiver Sharing</Text>
                    <Pressable
                        style={styles.addButton}
                        onPress={() => {
                            void haptic.light();
                        }}
                    >
                        <Ionicons name="person-add" size={22} color={Colors.primary} />
                    </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Info Subtitle */}
                    <Text style={styles.sectionSubtitle}>
                        Share your health information securely with family members and caregivers.
                    </Text>

                    {/* Security Banner */}
                    <View style={styles.securityBanner}>
                        <View style={styles.securityIcon}>
                            <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.securityTitle}>End-to-end encrypted</Text>
                            <Text style={styles.securityText}>Caregivers can view but not modify your data</Text>
                        </View>
                    </View>

                    {/* Caregivers Section */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Shared With</Text>
                            <View style={styles.sectionCount}>
                                <Text style={styles.sectionCountText}>{mockCaregivers.length}</Text>
                            </View>
                        </View>

                        {mockCaregivers.map((caregiver, index) => renderCaregiverCard(caregiver, index))}
                    </View>

                    {/* Add Caregiver CTA */}
                    <Pressable
                        style={styles.addCaregiverButton}
                        onPress={() => {
                            void haptic.selection();
                        }}
                    >
                        <Ionicons name="add-circle" size={22} color={Colors.primary} />
                        <Text style={styles.addCaregiverText}>Invite a Caregiver</Text>
                    </Pressable>

                    {/* Help Text */}
                    <Text style={styles.helpText}>
                        Caregivers will receive an email invitation to create their account and view your shared health information.
                    </Text>
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
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
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: Colors.text,
    },
    addButton: {
        padding: spacing(1),
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
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarPending: {
        backgroundColor: Colors.textMuted,
    },
    avatarText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    caregiverName: {
        fontSize: 17,
        fontWeight: '600',
        color: Colors.text,
    },
    caregiverRelation: {
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: spacing(3),
        paddingVertical: spacing(1.5),
        borderRadius: 999,
    },
    statusLabel: {
        fontSize: 12,
        fontWeight: '600',
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
    emailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1),
    },
    emailText: {
        fontSize: 13,
        color: Colors.textMuted,
    },
    manageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing(1),
    },
    manageButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.primary,
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
});
