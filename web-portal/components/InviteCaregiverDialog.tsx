'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api/client';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';

interface InviteCaregiverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteCaregiverDialog({ open, onOpenChange }: InviteCaregiverDialogProps) {
  const [email, setEmail] = React.useState('');
  const [message, setMessage] = React.useState('');
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();

  const inviteMutation = useMutation({
    mutationFn: async (data: { caregiverEmail: string; message?: string }) => {
      // First create the share
      const share = await api.shares.create(data);
      
      // Then send the email via Vercel API route
      // Always use production domain for invite links to avoid confusion with preview URLs
      const inviteLink = `https://portal.lumimd.app/invite/${share.id}`;
      
      const ownerProfile = await api.user.getProfile();
      const ownerName = ownerProfile.preferredName || ownerProfile.firstName || 'A LumiMD user';
      const ownerEmail = currentUser?.email || ownerProfile.email || '';
      
      try {
        const emailResponse = await fetch('/api/send-invite-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerName,
            ownerEmail,
            inviteeEmail: data.caregiverEmail,
            inviteLink,
            message: data.message,
          }),
        });
        
        if (!emailResponse.ok) {
          const error = await emailResponse.json();
          console.error('[InviteCaregiverDialog] Email sending failed:', error);
          // Share is created, but email failed - show warning but don't fail the whole operation
          toast.warning('Invitation created, but email could not be sent', {
            description: 'The share was created successfully, but we encountered an issue sending the email. You may need to resend it.',
          });
        }
      } catch (emailError) {
        console.error('[InviteCaregiverDialog] Error calling email API:', emailError);
        // Share is created, but email failed - show warning but don't fail the whole operation
        toast.warning('Invitation created, but email could not be sent', {
          description: 'The share was created successfully, but we encountered an issue sending the email. You may need to resend it.',
        });
      }
      
      return share;
    },
    onSuccess: () => {
      toast.success('Invitation sent!', {
        description: 'The caregiver will receive an email with instructions to access your health information.',
      });
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      setEmail('');
      setMessage('');
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error('[InviteCaregiverDialog] Error sending invite:', error);
      const message = error?.userMessage || error?.message || 'Failed to send invitation';
      const details = error?.code ? ` (${error.code})` : '';
      toast.error(message + details, {
        description: error?.status === 404 
          ? 'The API endpoint was not found. Please check your configuration.'
          : error?.status === 401 || error?.status === 403
          ? 'Your session may have expired. Please try signing in again.'
          : undefined,
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      toast.error('Please enter an email address');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error('Please enter a valid email address');
      return;
    }

    inviteMutation.mutate({
      caregiverEmail: trimmedEmail,
      message: message.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Caregiver</DialogTitle>
          <DialogDescription>
            Share read-only access to your health information with a family member or caregiver.
            They'll receive an email invitation to view your visits, medications, and action items.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="caregiver-email">Email Address</Label>
            <Input
              id="caregiver-email"
              type="email"
              placeholder="caregiver@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={inviteMutation.isPending}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="caregiver-message">Optional Message</Label>
            <textarea
              id="caregiver-message"
              className="flex min-h-[100px] w-full rounded-lg border border-border-light bg-background px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Add a personal note (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={inviteMutation.isPending}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={inviteMutation.isPending}
              leftIcon={<Mail className="h-4 w-4" />}
            >
              Send Invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

