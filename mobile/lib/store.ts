/**
 * In-App Purchase Module (RevenueCat)
 *
 * This module handles iOS in-app purchases via RevenueCat. The subscription status
 * is synced to Firestore via RevenueCat webhooks and should be read from the user
 * profile for authorization decisions.
 *
 * Usage:
 * 1. Call configureRevenueCat() on app launch with the user ID
 * 2. Use getOfferings() to fetch available subscription packages
 * 3. Use purchasePackage() to initiate a purchase
 * 4. Use restorePurchases() to restore previous purchases
 * 5. Use openManageSubscriptions() to let users manage in App Store
 */

import { Platform, Linking } from 'react-native';
import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PurchasesError,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';

// Product IDs - must match App Store Connect and RevenueCat
export const PRODUCT_IDS = {
  MONTHLY: 'com.lumimd.monthly',
  YEARLY: 'com.lumimd.yearly',
} as const;

// Entitlement ID - must match RevenueCat configuration
export const ENTITLEMENT_ID = 'premium';

// Types
export interface Package {
  identifier: string;
  packageType: string;
  product: {
    identifier: string;
    title: string;
    description: string;
    price: number;
    priceString: string;
    currencyCode: string;
  };
  rcPackage: PurchasesPackage;
}

export interface PurchaseResult {
  success: boolean;
  customerInfo?: CustomerInfo;
  error?: string;
  userCancelled?: boolean;
}

// Module state
let isConfigured = false;

/**
 * Configure RevenueCat on app launch.
 * Safe to call multiple times - will only configure once.
 * @param userId - Firebase user ID for attribution
 */
export async function configureRevenueCat(userId?: string): Promise<void> {
  if (Platform.OS !== 'ios') {
    console.log('[Store] RevenueCat only supported on iOS');
    return;
  }

  if (isConfigured) {
    // If already configured but user changed, log in the new user
    if (userId) {
      try {
        await Purchases.logIn(userId);
        console.log('[Store] Logged in user:', userId);
      } catch (error) {
        console.warn('[Store] Failed to log in user:', error);
      }
    }
    return;
  }

  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
  console.log('[Store] API Key present:', !!apiKey, 'Length:', apiKey?.length || 0);
  if (!apiKey) {
    console.error('[Store] EXPO_PUBLIC_REVENUECAT_API_KEY not set');
    return;
  }

  try {
    // Set log level for debugging (remove in production)
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    // Configure with API key
    Purchases.configure({ apiKey });
    isConfigured = true;

    // Log in user for attribution if provided
    if (userId) {
      await Purchases.logIn(userId);
      console.log('[Store] Configured and logged in user:', userId);
    } else {
      console.log('[Store] Configured successfully (anonymous)');
    }
  } catch (error) {
    console.error('[Store] Configuration failed:', error);
  }
}

/**
 * Get the current RevenueCat offerings (subscription packages).
 * Returns the default offering's available packages.
 */
export async function getOfferings(): Promise<Package[]> {
  if (Platform.OS !== 'ios') {
    console.log('[Store] Not iOS, returning empty offerings');
    return [];
  }

  try {
    await configureRevenueCat();

    console.log('[Store] Fetching offerings from RevenueCat...');
    const offerings = await Purchases.getOfferings();
    console.log('[Store] Offerings response:', JSON.stringify({
      hasOfferings: !!offerings,
      hasCurrent: !!offerings?.current,
      allOfferingsCount: Object.keys(offerings?.all || {}).length,
    }));
    
    const currentOffering: PurchasesOffering | null = offerings.current;

    if (!currentOffering) {
      console.warn('[Store] No current offering available. Check RevenueCat dashboard.');
      console.warn('[Store] Available offerings:', Object.keys(offerings?.all || {}));
      return [];
    }

    // Map RevenueCat packages to our Package type
    const packages: Package[] = currentOffering.availablePackages.map((pkg: PurchasesPackage) => ({
      identifier: pkg.identifier,
      packageType: pkg.packageType,
      product: {
        identifier: pkg.product.identifier,
        title: pkg.product.title,
        description: pkg.product.description,
        price: pkg.product.price,
        priceString: pkg.product.priceString,
        currencyCode: pkg.product.currencyCode,
      },
      rcPackage: pkg,
    }));

    console.log('[Store] Fetched offerings:', packages.length, 'packages');
    return packages;
  } catch (error) {
    console.error('[Store] Failed to fetch offerings:', error);
    return [];
  }
}

/**
 * Purchase a subscription package.
 * @param pkg - The package to purchase (from getOfferings)
 */
export async function purchasePackage(pkg: Package): Promise<PurchaseResult> {
  if (Platform.OS !== 'ios') {
    return { success: false, error: 'Purchases only available on iOS' };
  }

  try {
    await configureRevenueCat();

    const { customerInfo } = await Purchases.purchasePackage(pkg.rcPackage);

    // Check if the premium entitlement is now active
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID]?.isActive ?? false;

    console.log('[Store] Purchase completed, premium:', isPremium);
    return { success: isPremium, customerInfo };
  } catch (error) {
    const purchasesError = error as PurchasesError;

    // Handle user cancellation gracefully
    if (purchasesError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      console.log('[Store] Purchase cancelled by user');
      return { success: false, userCancelled: true };
    }

    console.error('[Store] Purchase failed:', purchasesError.message);
    return {
      success: false,
      error: purchasesError.message ?? 'Purchase failed',
    };
  }
}

/**
 * Restore previous purchases. Required by App Store guidelines.
 * Returns true if active entitlements were restored.
 */
export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;

  try {
    await configureRevenueCat();

    const customerInfo = await Purchases.restorePurchases();
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID]?.isActive ?? false;

    console.log('[Store] Restored purchases, premium:', isPremium);
    return isPremium;
  } catch (error) {
    console.error('[Store] Failed to restore purchases:', error);
    return false;
  }
}

/**
 * Get the current customer info from RevenueCat.
 * Useful for checking subscription status on demand.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (Platform.OS !== 'ios') return null;

  try {
    await configureRevenueCat();
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error('[Store] Failed to get customer info:', error);
    return null;
  }
}

/**
 * Check if the user has an active premium entitlement.
 */
export async function checkPremiumStatus(): Promise<boolean> {
  const customerInfo = await getCustomerInfo();
  if (!customerInfo) return false;

  return customerInfo.entitlements.active[ENTITLEMENT_ID]?.isActive ?? false;
}

/**
 * Open Apple's subscription management page.
 */
export async function openManageSubscriptions(): Promise<void> {
  await Linking.openURL('https://apps.apple.com/account/subscriptions');
}

/**
 * Log out the current user (call on sign out).
 * This resets RevenueCat to anonymous mode.
 */
export async function logOutRevenueCat(): Promise<void> {
  if (Platform.OS !== 'ios' || !isConfigured) return;

  try {
    await Purchases.logOut();
    console.log('[Store] Logged out from RevenueCat');
  } catch (error) {
    console.warn('[Store] Failed to log out:', error);
  }
}
