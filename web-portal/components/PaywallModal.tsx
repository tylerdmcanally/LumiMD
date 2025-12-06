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
          <DialogTitle>Subscribe to keep using AI summaries</DialogTitle>
          <DialogDescription>
            Get AI visit summaries, medication insights, and caregiver sharing with a 14-day free
            trial. Cancel anytime.
          </DialogDescription>
        </DialogHeader>
        {typeof daysLeft === 'number' && (
          <p className="text-sm font-semibold text-brand-primary">
            {daysLeft} days left in your free trial
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            Subscribe (coming soon)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


