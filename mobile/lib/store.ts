/**
 * In-App Purchase Module (StoreKit 2 via expo-in-app-purchases)
 *
 * This module handles iOS in-app purchases. The subscription status is stored
 * in Firestore (updated via App Store Server Notifications webhook) and should
 * be read from the user profile, not from this module.
 *
 * Usage:
 * 1. Call configureStore() on app launch
 * 2. Use getProducts() to fetch available subscriptions
 * 3. Use purchase() to initiate a purchase
 * 4. Use restorePurchases() to restore previous purchases
 * 5. Use openManageSubscriptions() to let users manage in App Store
 */

import { Platform, Linking } from 'react-native';

// Product IDs - must match App Store Connect
export const PRODUCT_IDS = {
  MONTHLY: 'com.lumimd.monthly',
  YEARLY: 'com.lumimd.yearly',
} as const;

const ALL_PRODUCT_IDS = Object.values(PRODUCT_IDS);

// Types
export type Product = {
  productId: string;
  title: string;
  description: string;
  price: string;
  priceAmountMicros: number;
  priceCurrencyCode: string;
};

export type PurchaseResult = {
  success: boolean;
  productId?: string;
  transactionId?: string;
  error?: string;
};

// Module state
let isConfigured = false;

/**
 * Configure the store on app launch.
 * Safe to call multiple times.
 */
export async function configureStore(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  if (isConfigured) return;

  try {
    const IAP = await import('expo-in-app-purchases');
    await IAP.connectAsync();

    // Set up purchase listener
    IAP.setPurchaseListener(async (result) => {
      if (result.responseCode === IAP.IAPResponseCode.OK) {
        // Finish all transactions
        for (const purchase of result.results ?? []) {
          try {
            await IAP.finishTransactionAsync(purchase, false);
          } catch (err) {
            console.warn('[Store] Failed to finish transaction:', err);
          }
        }
      }
    });

    isConfigured = true;
    console.log('[Store] Configured successfully');
  } catch (error) {
    console.error('[Store] Configuration failed:', error);
  }
}

/**
 * Fetch available subscription products from App Store.
 */
export async function getProducts(): Promise<Product[]> {
  if (Platform.OS !== 'ios') return [];

  try {
    const IAP = await import('expo-in-app-purchases');
    await configureStore();

    const { results } = await IAP.getProductsAsync(ALL_PRODUCT_IDS);

    return (results ?? []).map((p) => ({
      productId: p.productId,
      title: p.title ?? 'Subscription',
      description: p.description ?? '',
      price: p.priceString ?? '',
      priceAmountMicros: p.priceAmountMicros ?? 0,
      priceCurrencyCode: p.priceCurrencyCode ?? 'USD',
    }));
  } catch (error) {
    console.error('[Store] Failed to fetch products:', error);
    return [];
  }
}

/**
 * Initiate a purchase for the given product ID.
 */
export async function purchase(productId: string): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios') {
    return { success: false, error: 'Purchases only available on iOS' };
  }

  try {
    const IAP = await import('expo-in-app-purchases');
    await configureStore();
    await IAP.purchaseItemAsync(productId);

    // Purchase listener will handle transaction completion
    return { success: true, productId };
  } catch (error: any) {
    const isUserCancelled = error?.code === 'E_USER_CANCELLED';
    return {
      success: false,
      error: isUserCancelled ? undefined : error?.message ?? 'Purchase failed',
    };
  }
}

/**
 * Restore previous purchases. This is required by App Store guidelines.
 */
export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  try {
    const IAP = await import('expo-in-app-purchases');
    await configureStore();

    const history = await IAP.getPurchaseHistoryAsync(false);
    const hasPurchases = (history?.results?.length ?? 0) > 0;

    console.log('[Store] Restored purchases:', hasPurchases);
    return hasPurchases;
  } catch (error) {
    console.error('[Store] Failed to restore purchases:', error);
    return false;
  }
}

/**
 * Open Apple's subscription management page.
 */
export async function openManageSubscriptions(): Promise<void> {
  await Linking.openURL('https://apps.apple.com/account/subscriptions');
}
