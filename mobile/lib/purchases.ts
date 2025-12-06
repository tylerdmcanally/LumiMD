import * as React from 'react';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PurchasesOffering,
  PurchasesPackage,
} from 'react-native-purchases';
import { presentCustomerCenter } from 'react-native-purchases-ui';

const API_KEY =
  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY ?? 'test_tzVJxannPJPckCUKzbjEzLcxhUM';
const ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT ?? 'LumiMD Pro';
const OFFERING_ID = process.env.EXPO_PUBLIC_REVENUECAT_OFFERING ?? 'default';

type AccessState = 'active' | 'trial' | 'inactive' | 'unknown';

export type SubscriptionState = {
  status: AccessState;
  daysLeft?: number;
  customerInfo?: CustomerInfo | null;
  error?: string;
};

export async function configurePurchases(appUserId?: string) {
  await Purchases.configure({
    apiKey: API_KEY,
    appUserId,
    useAmazon: false,
    entitlementsCacheLifetime: 'weekly',
  });
  Purchases.setLogLevel(LOG_LEVEL.WARN);
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  const { current } = await Purchases.getOfferings();
  return current ?? null;
}

export async function purchasePackage(pkg: PurchasesPackage) {
  return Purchases.purchasePackage(pkg);
}

export async function restorePurchases() {
  return Purchases.restorePurchases();
}

export async function openCustomerCenter() {
  return presentCustomerCenter();
}

export function useProAccess(): SubscriptionState {
  const [state, setState] = React.useState<SubscriptionState>({ status: 'unknown' });
  const paywallEnabled = process.env.EXPO_PUBLIC_PAYWALL_ENABLED === 'true';

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!paywallEnabled) {
          if (mounted) setState({ status: 'active' });
          return;
        }
        const info = await Purchases.getCustomerInfo();
        const entitlement = info.entitlements.active[ENTITLEMENT_ID];
        if (entitlement) {
          const expiration = entitlement.expirationDate
            ? new Date(entitlement.expirationDate).getTime()
            : null;
          const now = Date.now();
          const inTrial = entitlement.isSandbox && !!entitlement.periodType && entitlement.periodType === 'trial';
          const daysLeft =
            expiration && expiration > now
              ? Math.max(0, Math.ceil((expiration - now) / (1000 * 60 * 60 * 24)))
              : undefined;
          if (mounted) {
            setState({
              status: inTrial ? 'trial' : 'active',
              daysLeft,
              customerInfo: info,
            });
          }
        } else {
          if (mounted) setState({ status: 'inactive', customerInfo: info });
        }
      } catch (error: any) {
        if (mounted) {
          setState({
            status: 'inactive',
            customerInfo: null,
            error: error?.message ?? 'Failed to check subscription',
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [paywallEnabled]);

  return state;
}

export function useOfferings() {
  const [offerings, setOfferings] = React.useState<PurchasesOffering | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;
    getOfferings()
      .then((o) => {
        if (!mounted) return;
        setOfferings(o);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e?.message ?? 'Failed to load offerings');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { offerings, loading, error };
}

export const DEFAULT_OFFERING_ID = OFFERING_ID;



