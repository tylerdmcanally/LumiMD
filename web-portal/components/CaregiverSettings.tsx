'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, UserPlus, Clock, CheckCircle2, UserX } from 'lucide-react';
import { format } from 'date-fns';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { InviteCaregiverDialog } from '@/components/InviteCaregiverDialog';
import { api } from '@/lib/api/client';
import type { Share, ShareInvite } from '@lumimd/sdk';

export function CaregiverSettings() {
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: shares = [], isLoading: sharesLoading } = useQuery({
    queryKey: ['shares'],
    queryFn: () => api.shares.list(),
  });

  const { data: invites = [], isLoading: invitesLoading } = useQuery({
    queryKey: ['shares', 'invites'],
    queryFn: () => api.shares.getInvites(),
  });

  const revokeMutation = useMutation({
    mutationFn: async (shareId: string) => {
      return api.shares.update(shareId, { status: 'revoked' });
    },
    onSuccess: () => {
      toast.success('Access revoked');
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
    onError: (error: any) => {
      console.error('[CaregiverSettings] Error revoking share:', error);
      const message = error?.userMessage || error?.message || 'Failed to revoke access';
      const details = error?.code ? ` (${error.code})` : '';
      toast.error(message + details);
    },
  });

  const cancelInviteMutation = useMutation({
    mutationFn: async (inviteId: string) => {
      return api.shares.cancelInvite(inviteId);
    },
    onSuccess: () => {
      toast.success('Invitation cancelled');
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['shares', 'invites'] });
    },
    onError: (error: any) => {
      console.error('[CaregiverSettings] Error cancelling invite:', error);
      const message = error?.userMessage || error?.message || 'Failed to cancel invitation';
      const details = error?.code ? ` (${error.code})` : '';
      toast.error(message + details, {
        description: error?.status === 404
          ? 'The invitation was not found. It may have already been cancelled or accepted.'
          : undefined,
      });
    },
  });

  const acceptedShares = shares.filter(
    (s: Share) => s.type === 'outgoing' && s.status === 'accepted',
  );
  const pendingShares = shares.filter(
    (s: Share) => s.type === 'outgoing' && s.status === 'pending',
  );
  const pendingInvites = invites.filter((i: ShareInvite) => i.status === 'pending');

  const safeFormatDate = (value?: string | null) => {
    if (!value) return null;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return null;
    return format(new Date(parsed), 'MMM d, yyyy');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-text-primary">Caregiver Access</h2>
          <p className="text-sm text-text-secondary">
            Share read-only access to your health information with family members or caregivers.
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<UserPlus className="h-4 w-4" />}
          onClick={() => setInviteDialogOpen(true)}
          className="w-full sm:w-auto"
        >
          Invite Caregiver
        </Button>
      </div>

      {sharesLoading || invitesLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : (
        <>
          {/* Accepted Shares */}
          {acceptedShares.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-text-primary">Active Caregivers</h3>
              <div className="space-y-3">
                {acceptedShares.map((share: Share) => (
                  <div
                    key={share.id}
                    className="flex flex-col gap-3 rounded-xl border border-border-light bg-background-subtle p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-light">
                        <CheckCircle2 className="h-5 w-5 text-success-dark" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">{share.caregiverEmail}</p>
                        <p className="text-sm text-text-secondary">
                          {safeFormatDate(share.acceptedAt)
                            ? `Accepted ${safeFormatDate(share.acceptedAt)}`
                            : 'Active'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (
                          typeof window !== 'undefined' &&
                          window.confirm(
                            'Are you sure you want to revoke access? This caregiver will no longer be able to view your health information.',
                          )
                        ) {
                          revokeMutation.mutate(share.id);
                        }
                      }}
                      disabled={revokeMutation.isPending}
                      className="text-error hover:text-error hover:bg-error-light px-2 py-1 h-8 rounded-full shrink-0"
                    >
                      <UserX className="h-4 w-4" />
                      <span className="hidden sm:inline ml-1.5">Revoke</span>
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Shares & Invites */}
          {(pendingShares.length > 0 || pendingInvites.length > 0) && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-text-primary">Pending Invitations</h3>
              <div className="space-y-3">
                {pendingShares.map((share: Share) => (
                  <div
                    key={share.id}
                    className="flex flex-col gap-3 rounded-xl border border-border-light bg-background-subtle p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-light">
                        <Clock className="h-5 w-5 text-warning-dark" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">{share.caregiverEmail}</p>
                        <p className="text-sm text-text-secondary">
                          Waiting for acceptance
                          {safeFormatDate(share.createdAt) && ` • Sent ${safeFormatDate(share.createdAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-between sm:justify-end">
                      <Badge size="sm" tone="warning" variant="soft">
                        Pending
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => revokeMutation.mutate(share.id)}
                        disabled={revokeMutation.isPending}
                        className="text-error hover:text-error"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))}
                {pendingInvites.map((invite: ShareInvite) => (
                  <div
                    key={invite.id}
                    className="flex flex-col gap-3 rounded-xl border border-border-light bg-background-subtle p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warning-light">
                        <Mail className="h-5 w-5 text-warning-dark" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-text-primary truncate">{invite.inviteeEmail}</p>
                        <p className="text-sm text-text-secondary">
                          No account yet
                          {safeFormatDate(invite.expiresAt) &&
                            ` • Expires ${safeFormatDate(invite.expiresAt)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 justify-between sm:justify-end">
                      <Badge size="sm" tone="warning" variant="soft">
                        Invited
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => cancelInviteMutation.mutate(invite.id)}
                        disabled={cancelInviteMutation.isPending}
                        className="text-error hover:text-error"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {acceptedShares.length === 0 &&
            pendingShares.length === 0 &&
            pendingInvites.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background-subtle/70 py-10 px-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary-pale mb-4">
                  <UserPlus className="h-7 w-7 text-brand-primary" />
                </div>
                <h3 className="text-base font-semibold text-text-primary mb-2">
                  No caregivers yet
                </h3>
                <p className="text-sm text-text-secondary mb-5 max-w-sm">
                  Invite family members or caregivers to view your health information. They'll
                  have read-only access to your visits, medications, and action items.
                </p>
                <Button
                  variant="primary"
                  leftIcon={<UserPlus className="h-4 w-4" />}
                  onClick={() => setInviteDialogOpen(true)}
                >
                  Invite Your First Caregiver
                </Button>
              </div>
            )}
        </>
      )
      }

      <InviteCaregiverDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
    </div >
  );
}
