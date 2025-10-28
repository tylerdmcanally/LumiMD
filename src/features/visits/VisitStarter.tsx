import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { useAuth } from '@/shared/context/AuthContext';
import { COLORS, FONTS, SIZES } from '@/shared/constants/AppConstants';
import { listProviders as fetchProviders, Provider } from '@/shared/services/api/providers';
import { startVisit, Visit } from '@/shared/services/api/visits';

interface VisitStarterProps {
  onVisitCreated: (visit: Visit) => void;
  onCancel: () => void;
}

export const VisitStarter: React.FC<VisitStarterProps> = ({ onVisitCreated, onCancel }) => {
  const { user } = useAuth();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creatingVisit, setCreatingVisit] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const data = await fetchProviders();
        setProviders(data);
        setError(null);
      } catch (err: any) {
        console.error('Failed to load providers', err);
        setError(err.response?.data?.error?.message ?? 'Unable to load providers');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleStartVisit = async (provider: Provider) => {
    try {
      setCreatingVisit(provider.id);
      const visit = await startVisit({
        providerId: provider.id,
        visitDate: new Date().toISOString(),
        visitType: 'IN_PERSON',
      });

      onVisitCreated(visit);
    } catch (err: any) {
      console.error('Failed to start visit', err);
      setError(err.response?.data?.error?.message ?? 'Unable to start visit');
    } finally {
      setCreatingVisit(null);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={COLORS.PRIMARY} />
        <Text style={styles.loadingText}>Loading your care team…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={onCancel}>
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={2}>
            Choose your provider
          </Text>
          <Text style={styles.subtitle} numberOfLines={3}>
            Start recording with the right specialist so we can organize your notes, action items, and follow-up tasks automatically.
          </Text>
        </View>
        <View style={styles.sessionInfo}>
          <Text style={styles.sessionLabel}>Signed in as</Text>
          <Text style={styles.sessionValue} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
      </View>

      {providers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No providers saved yet</Text>
          <Text style={styles.emptyBody}>Add trusted providers from the dashboard to quickly tag new recordings.</Text>
        </View>
      ) : (
        <FlatList
          data={providers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.providerCard}
              onPress={() => handleStartVisit(item)}
              disabled={creatingVisit === item.id}
              activeOpacity={0.9}
            >
              <View style={styles.cardHeader}>
                <View>
                  <Text style={styles.providerName}>{item.name}</Text>
                  <Text style={styles.providerSpecialty}>{item.specialty}</Text>
                </View>
                {creatingVisit === item.id ? (
                  <ActivityIndicator size="small" color={COLORS.PRIMARY} />
                ) : (
                  <Text style={styles.providerAction}>Select →</Text>
                )}
              </View>
              {item.practice ? <Text style={styles.providerPractice}>{item.practice}</Text> : null}
              <View style={styles.providerMeta}>
              {item.phone ? (
                <Text style={styles.metaText} numberOfLines={1}>
                  📞 {item.phone}
                </Text>
              ) : null}
                {item.address ? (
                  <Text style={styles.metaText} numberOfLines={1}>
                    📍 {item.address}
                  </Text>
                ) : null}
              </View>
              <View style={styles.providerFooter}>
                <Text style={styles.providerTag} numberOfLines={1}>
                  Personal cardiology • 5-year history
                </Text>
                <Text style={styles.providerSupport} numberOfLines={1}>
                  Secure transcription enabled
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <TouchableOpacity style={styles.secondaryButton} onPress={onCancel}>
        <Text style={styles.secondaryButtonLabel}>Back to home</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    paddingHorizontal: SIZES.PADDING,
    paddingVertical: SIZES.LG,
    gap: SIZES.MD,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SIZES.MD,
    alignItems: 'flex-start',
  },
  headerCopy: {
    flex: 1,
    gap: SIZES.XS,
  },
  title: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.HEADING,
    color: COLORS.PRIMARY,
  },
  subtitle: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 22,
  },
  sessionInfo: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 4,
  },
  sessionLabel: {
    fontFamily: FONTS.MEDIUM,
    fontSize: SIZES.FONT.SM,
    color: COLORS.SECONDARY,
  },
  sessionValue: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  backButton: {
    marginRight: SIZES.SM,
  },
  backLabel: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SIZES.SM,
  },
  loadingText: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  emptyState: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    padding: SIZES.CARD_PADDING,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    ...SIZES.SHADOW.MEDIUM,
    gap: SIZES.SM,
  },
  emptyTitle: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  emptyBody: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
    lineHeight: 20,
  },
  listContent: {
    gap: SIZES.MD,
    paddingBottom: SIZES.XL,
  },
  providerCard: {
    backgroundColor: COLORS.CARD_BACKGROUND,
    borderRadius: SIZES.CARD_BORDER_RADIUS,
    padding: SIZES.CARD_PADDING,
    gap: SIZES.XS,
    ...SIZES.SHADOW.LIGHT,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.XS,
  },
  providerName: {
    fontFamily: FONTS.SEMIBOLD,
    fontSize: SIZES.FONT.XL,
    color: COLORS.PRIMARY,
  },
  providerSpecialty: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.SECONDARY,
  },
  providerPractice: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  providerMeta: {
    gap: 2,
    marginTop: 2,
  },
  metaText: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.GRAY[500],
  },
  providerFooter: {
    marginTop: SIZES.SM,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  providerTag: {
    fontFamily: FONTS.REGULAR,
    color: COLORS.SECONDARY,
  },
  providerSupport: {
    fontFamily: FONTS.MEDIUM,
    color: COLORS.PRIMARY,
  },
  providerAction: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.PRIMARY,
  },
  secondaryButton: {
    paddingVertical: SIZES.SM,
    alignItems: 'center',
    borderRadius: SIZES.BORDER_RADIUS,
    borderWidth: 1,
    borderColor: COLORS.GRAY[200],
  },
  secondaryButtonLabel: {
    fontFamily: FONTS.SEMIBOLD,
    color: COLORS.SECONDARY,
  },
  errorText: {
    marginTop: SIZES.SM,
    fontFamily: FONTS.MEDIUM,
    color: COLORS.DANGER,
  },
});

export default VisitStarter;
