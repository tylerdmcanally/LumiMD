import React, { useEffect, useState } from 'react';
import { RCModal, PaywallView } from 'react-native-purchases-ui';
import { useOfferings, purchasePackage, restorePurchases, DEFAULT_OFFERING_ID } from '../lib/purchases';

type PaywallScreenProps = {
  visible: boolean;
  onClose: () => void;
  daysLeft?: number;
};

export function PaywallScreen({ visible, onClose, daysLeft }: PaywallScreenProps) {
  const { offerings, loading } = useOfferings();
  const [offeringId, setOfferingId] = useState<string | undefined>(DEFAULT_OFFERING_ID);

  useEffect(() => {
    if (!visible) return;
    if (offerings?.identifier) {
      setOfferingId(offerings.identifier);
    } else if (offerings?.metadata?.identifier) {
      setOfferingId(offerings.metadata.identifier as string);
    } else {
      setOfferingId(DEFAULT_OFFERING_ID);
    }
  }, [offerings, visible]);

  return (
    <RCModal visible={visible} onClose={onClose}>
      <PaywallView
        offeringIdentifier={offeringId}
        isLoading={loading}
        onPurchase={async (pkg) => {
          try {
            await purchasePackage(pkg);
            onClose();
          } catch (e: any) {
            if (e?.userCancelled) return;
            console.warn('Purchase failed', e);
          }
        }}
        onRestore={async () => {
          try {
            await restorePurchases();
            onClose();
          } catch (e) {
            console.warn('Restore failed', e);
          }
        }}
        onDismiss={onClose}
        appearance={{
          footer: daysLeft
            ? {
                text: `${daysLeft} days left in your trial`,
              }
            : undefined,
        }}
      />
    </RCModal>
  );
}



