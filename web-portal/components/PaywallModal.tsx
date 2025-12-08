import * as React from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type PaywallModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  daysLeft?: number;
};

export function PaywallModal({ open, onOpenChange, daysLeft }: PaywallModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subscribe in the LumiMD mobile app</DialogTitle>
          <DialogDescription>
            Recording visits and AI summaries are premium features. Subscriptions are managed in the
            LumiMD mobile app. Start a 14-day free trial in the app, then return here to continue.
          </DialogDescription>
        </DialogHeader>
        {typeof daysLeft === 'number' && (
          <p className="text-sm font-semibold text-brand-primary">
            {daysLeft} days left in your free trial
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

