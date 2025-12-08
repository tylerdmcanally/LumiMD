/**
 * Paywall Sheet
 *
 * Bottom sheet modal that displays subscription options. Shows available
 * products from App Store and allows users to purchase or restore.
 */

import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, spacing, Radius } from './ui';
import { getProducts, purchase, restorePurchases, Product } from '../lib/store';

type PaywallSheetProps = {
  visible: boolean;
  onClose: () => void;
  onPurchaseComplete?: () => void;
  daysLeft?: number;
};

export function PaywallSheet({
  visible,
  onClose,
  onPurchaseComplete,
  daysLeft,
}: PaywallSheetProps) {
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [purchasing, setPurchasing] = useState(false);

  // Fetch products when sheet opens
  useEffect(() => {
    if (!visible) return;

    setLoading(true);
    getProducts()
      .then(setProducts)
      .catch((err) => console.warn('[Paywall] Failed to load products:', err))
      .finally(() => setLoading(false));
  }, [visible]);

  const handlePurchase = async (productId: string) => {
    setPurchasing(true);
    try {
      const result = await purchase(productId);
      if (result.success) {
        Alert.alert(
          'Purchase Successful',
          'Thank you! Your subscription is now active.',
          [{ text: 'OK', onPress: onClose }],
        );
        onPurchaseComplete?.();
      } else if (result.error) {
        Alert.alert('Purchase Failed', result.error);
      }
    } catch (error: any) {
      Alert.alert('Purchase Failed', error?.message ?? 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        Alert.alert(
          'Purchases Restored',
          'Your previous purchases have been restored.',
          [{ text: 'OK', onPress: onClose }],
        );
        onPurchaseComplete?.();
      } else {
        Alert.alert('No Purchases Found', 'No previous purchases were found to restore.');
      }
    } catch (error: any) {
      Alert.alert('Restore Failed', error?.message ?? 'Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>LumiMD Pro</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </Pressable>
          </View>

          {/* Description */}
          <Text style={styles.description}>
            Record medical visits and get AI-powered summaries. Start with a 14-day
            free trial, cancel anytime.
          </Text>

          {/* Trial status */}
          {typeof daysLeft === 'number' && daysLeft > 0 && (
            <View style={styles.trialBadge}>
              <Ionicons name="time-outline" size={16} color={Colors.primary} />
              <Text style={styles.trialText}>{daysLeft} days left in trial</Text>
            </View>
          )}

          {/* Products */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading plans...</Text>
            </View>
          ) : products.length === 0 ? (
            <View style={styles.loadingContainer}>
              <Ionicons name="alert-circle-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.loadingText}>
                Unable to load subscription options.{'\n'}Please try again later.
              </Text>
            </View>
          ) : (
            <View style={styles.products}>
              {products.map((product) => (
                <Pressable
                  key={product.productId}
                  style={[styles.productCard, purchasing && styles.disabled]}
                  onPress={() => handlePurchase(product.productId)}
                  disabled={purchasing}
                >
                  <View style={styles.productInfo}>
                    <Text style={styles.productTitle}>{product.title}</Text>
                    <Text style={styles.productDescription}>{product.description}</Text>
                  </View>
                  <Text style={styles.productPrice}>{product.price}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Pressable
              onPress={handleRestore}
              style={styles.footerButton}
              disabled={purchasing}
            >
              <Text style={styles.footerText}>Restore Purchases</Text>
            </Pressable>
            <Pressable onPress={onClose} style={styles.footerButton}>
              <Text style={styles.footerText}>Maybe Later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingHorizontal: spacing(5),
    paddingTop: spacing(5),
    paddingBottom: spacing(8),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing(2),
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  closeButton: {
    padding: spacing(2),
    marginRight: -spacing(2),
  },
  description: {
    fontSize: 15,
    color: Colors.textMuted,
    lineHeight: 22,
    marginBottom: spacing(3),
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: `${Colors.primary}15`,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    borderRadius: Radius.md,
    alignSelf: 'flex-start',
    marginBottom: spacing(4),
  },
  trialText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing(6),
    gap: spacing(3),
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  products: {
    gap: spacing(3),
    marginBottom: spacing(4),
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: Radius.lg,
    padding: spacing(4),
  },
  productInfo: {
    flex: 1,
    marginRight: spacing(3),
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: spacing(1),
  },
  productDescription: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  disabled: {
    opacity: 0.6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerButton: {
    paddingVertical: spacing(2),
  },
  footerText: {
    fontSize: 14,
    color: Colors.textMuted,
    textDecorationLine: 'underline',
  },
});
