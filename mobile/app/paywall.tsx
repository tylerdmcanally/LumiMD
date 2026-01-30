import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from '../components/ui';
import { useSubscription } from '../contexts/SubscriptionContext';
import { Package } from '../lib/store';

const FREE_VISIT_LIMIT = 3;

// Feature list for premium
const PREMIUM_FEATURES = [
  { icon: 'mic', title: 'Unlimited visit recordings' },
  { icon: 'sparkles', title: 'AI-powered summaries' },
  { icon: 'medkit', title: 'Automatic medication sync' },
  { icon: 'people', title: 'Caregiver sharing' },
  { icon: 'document-text', title: 'Provider health reports' },
  { icon: 'notifications', title: 'Smart health reminders' },
];

export default function PaywallScreen() {
  const router = useRouter();
  const {
    freeVisitsUsed,
    offerings,
    loadOfferings,
    purchase,
    restore,
    isSubscribed,
  } = useSubscription();

  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isLoadingOfferings, setIsLoadingOfferings] = useState(false);
  
  // Load offerings on mount
  useEffect(() => {
    const load = async () => {
      setIsLoadingOfferings(true);
      await loadOfferings();
      setIsLoadingOfferings(false);
    };
    load();
  }, [loadOfferings]);

  // Auto-select yearly package if available
  useEffect(() => {
    if (offerings.length > 0 && !selectedPackage) {
      const yearly = offerings.find((pkg) => pkg.identifier === '$rc_annual');
      const monthly = offerings.find((pkg) => pkg.identifier === '$rc_monthly');
      setSelectedPackage(yearly || monthly || offerings[0]);
    }
  }, [offerings, selectedPackage]);

  // If already subscribed, go back
  useEffect(() => {
    if (isSubscribed) {
      router.back();
    }
  }, [isSubscribed, router]);

  const handlePurchase = async () => {
    if (!selectedPackage || isPurchasing) return;

    setIsPurchasing(true);
    try {
      const result = await purchase(selectedPackage);
      if (result.success) {
        Alert.alert(
          'Welcome to Premium!',
          'You now have unlimited access to all features.',
          [{ text: 'Get Started', onPress: () => router.back() }]
        );
      } else if (result.error) {
        Alert.alert('Purchase Failed', result.error);
      }
    } catch (error: any) {
      Alert.alert('Purchase Failed', error?.message || 'Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleRestore = async () => {
    if (isRestoring) return;

    setIsRestoring(true);
    try {
      const restored = await restore();
      if (restored) {
        Alert.alert(
          'Purchases Restored',
          'Your premium access has been restored.',
          [{ text: 'Continue', onPress: () => router.back() }]
        );
      } else {
        Alert.alert(
          'No Purchases Found',
          'We couldn\'t find any previous purchases to restore.'
        );
      }
    } catch (error: any) {
      Alert.alert('Restore Failed', error?.message || 'Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const getPackagePrice = (pkg: Package) => pkg.product.priceString;

  const getPackagePeriod = (pkg: Package) => {
    if (pkg.identifier === '$rc_annual') return '/year';
    if (pkg.identifier === '$rc_monthly') return '/month';
    return '';
  };

  const getMonthlySavings = () => {
    const monthly = offerings.find((pkg) => pkg.identifier === '$rc_monthly');
    const yearly = offerings.find((pkg) => pkg.identifier === '$rc_annual');
    if (!monthly || !yearly) return null;

    const monthlyPrice = monthly.product.price;
    const yearlyPrice = yearly.product.price;
    const yearlyMonthly = yearlyPrice / 12;
    const savings = ((monthlyPrice - yearlyMonthly) / monthlyPrice) * 100;

    return Math.round(savings);
  };

  const savings = getMonthlySavings();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={28} color={Colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.iconContainer}>
            <Ionicons name="star" size={48} color={Colors.primary} />
          </View>
          <Text style={styles.heroTitle}>Upgrade to Premium</Text>
          <Text style={styles.heroSubtitle}>
            You've used {freeVisitsUsed} of {FREE_VISIT_LIMIT} free visits.
            {'\n'}Subscribe to continue recording.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>What you get</Text>
          {PREMIUM_FEATURES.map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Ionicons
                  name={feature.icon as any}
                  size={20}
                  color={Colors.primary}
                />
              </View>
              <Text style={styles.featureText}>{feature.title}</Text>
            </View>
          ))}
        </View>

        {/* Pricing Options */}
        <View style={styles.pricingSection}>
          <Text style={styles.sectionTitle}>Choose your plan</Text>

          {isLoadingOfferings ? (
            <ActivityIndicator size="large" color={Colors.primary} />
          ) : offerings.length === 0 ? (
            <Text style={styles.errorText}>
              Unable to load subscription options. Please try again.
            </Text>
          ) : (
            <View style={styles.packagesContainer}>
              {offerings.map((pkg) => {
                const isSelected = selectedPackage?.identifier === pkg.identifier;
                const isYearly = pkg.identifier === '$rc_annual';

                return (
                  <Pressable
                    key={pkg.identifier}
                    style={[
                      styles.packageCard,
                      isSelected && styles.packageCardSelected,
                    ]}
                    onPress={() => setSelectedPackage(pkg)}
                  >
                    {isYearly && savings && (
                      <View style={styles.savingsBadge}>
                        <Text style={styles.savingsText}>Save {savings}%</Text>
                      </View>
                    )}
                    <View style={styles.packageRadio}>
                      <View
                        style={[
                          styles.radioOuter,
                          isSelected && styles.radioOuterSelected,
                        ]}
                      >
                        {isSelected && <View style={styles.radioInner} />}
                      </View>
                    </View>
                    <View style={styles.packageInfo}>
                      <Text style={styles.packageTitle}>
                        {isYearly ? 'Yearly' : 'Monthly'}
                      </Text>
                      <Text style={styles.packagePrice}>
                        {getPackagePrice(pkg)}
                        <Text style={styles.packagePeriod}>
                          {getPackagePeriod(pkg)}
                        </Text>
                      </Text>
                      {isYearly && (
                        <Text style={styles.packageSubtext}>
                          Best value
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.purchaseButton,
            (isPurchasing || !selectedPackage) && styles.purchaseButtonDisabled,
          ]}
          onPress={handlePurchase}
          disabled={isPurchasing || !selectedPackage}
        >
          {isPurchasing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.purchaseButtonText}>
              Subscribe Now
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={isRestoring}
        >
          <Text style={styles.restoreButtonText}>
            {isRestoring ? 'Restoring...' : 'Restore Purchases'}
          </Text>
        </Pressable>

        <View style={styles.legalLinks}>
          <Pressable onPress={() => Linking.openURL('https://lumimd.app/terms')}>
            <Text style={styles.legalLink}>Terms of Service</Text>
          </Pressable>
          <Text style={styles.legalDivider}>•</Text>
          <Pressable onPress={() => Linking.openURL('https://lumimd.app/privacy')}>
            <Text style={styles.legalLink}>Privacy Policy</Text>
          </Pressable>
        </View>

        <Text style={styles.disclaimer}>
          Payment will be charged to your Apple ID account. Subscription
          automatically renews unless cancelled at least 24 hours before the end
          of the current period.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
  },
  closeButton: {
    padding: spacing(2),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing(5),
    paddingBottom: spacing(4),
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing(8),
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing(4),
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: spacing(2),
  },
  heroSubtitle: {
    fontSize: 16,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  featuresSection: {
    marginBottom: spacing(8),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(4),
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing(3),
  },
  featureText: {
    fontSize: 16,
    color: Colors.text,
    flex: 1,
  },
  pricingSection: {
    marginBottom: spacing(4),
  },
  packagesContainer: {
    gap: spacing(3),
  },
  packageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing(4),
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.stroke,
    position: 'relative',
  },
  packageCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.accent,
  },
  savingsBadge: {
    position: 'absolute',
    top: -10,
    right: spacing(4),
    backgroundColor: Colors.primary,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1),
    borderRadius: Radius.sm,
  },
  savingsText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  packageRadio: {
    marginRight: spacing(3),
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.stroke,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: Colors.primary,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  packageInfo: {
    flex: 1,
  },
  packageTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(1),
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
  packagePeriod: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textMuted,
  },
  packageSubtext: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: spacing(1),
  },
  errorText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
    padding: spacing(4),
  },
  footer: {
    paddingHorizontal: spacing(5),
    paddingTop: spacing(4),
    paddingBottom: spacing(6),
    borderTopWidth: 1,
    borderTopColor: Colors.stroke,
  },
  purchaseButton: {
    backgroundColor: Colors.primary,
    paddingVertical: spacing(4),
    borderRadius: Radius.lg,
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  purchaseButtonDisabled: {
    opacity: 0.6,
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: spacing(2),
    marginBottom: spacing(4),
  },
  restoreButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing(3),
  },
  legalLink: {
    color: Colors.textMuted,
    fontSize: 13,
  },
  legalDivider: {
    color: Colors.textMuted,
    marginHorizontal: spacing(2),
  },
  disclaimer: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
