'use client';

import * as React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Mail, UserPlus, X, Clock, CheckCircle2, UserX } from 'lucide-react';
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
      const message = error?.userMessage || error?.message || 'Failed to revoke access';
      toast.error(message);
    },
  });

  const acceptedShares = shares.filter(
    (s: Share) => s.type === 'outgoing' && s.status === 'accepted',
  );
  const pendingShares = shares.filter(
    (s: Share) => s.type === 'outgoing' && s.status === 'pending',
  );
  const pendingInvites = invites.filter((i: ShareInvite) => i.status === 'pending');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-text-primary">Caregiver Access</h2>
          <p className="text-sm text-text-secondary mt-1">
            Share read-only access to your health information with family members or caregivers.
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<UserPlus className="h-4 w-4" />}
          onClick={() => setInviteDialogOpen(true)}
        >
          Invite Caregiver
        </Button>
      </div>

      {sharesLoading || invitesLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      ) : (
        <>
          {/* Accepted Shares */}
          {acceptedShares.length > 0 && (
            <Card variant="elevated" padding="lg" className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Active Caregivers</h3>
              <div className="space-y-3">
                {acceptedShares.map((share: Share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between rounded-lg border border-border-light bg-background-subtle p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success-light">
                        <CheckCircle2 className="h-5 w-5 text-success-dark" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{share.caregiverEmail}</p>
                        <p className="text-sm text-text-secondary">
                          {share.acceptedAt
                            ? `Accepted ${format(new Date(share.acceptedAt), 'MMM d, yyyy')}`
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
                      className="text-error hover:text-error"
                    >
                      <UserX className="h-4 w-4" />
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Pending Shares */}
          {(pendingShares.length > 0 || pendingInvites.length > 0) && (
            <Card variant="elevated" padding="lg" className="space-y-4">
              <h3 className="text-lg font-semibold text-text-primary">Pending Invitations</h3>
              <div className="space-y-3">
                {pendingShares.map((share: Share) => (
                  <div
                    key={share.id}
                    className="flex items-center justify-between rounded-lg border border-border-light bg-background-subtle p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-light">
                        <Clock className="h-5 w-5 text-warning-dark" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{share.caregiverEmail}</p>
                        <p className="text-sm text-text-secondary">
                          Waiting for acceptance
                          {share.createdAt &&
                            ` • Sent ${format(new Date(share.createdAt), 'MMM d, yyyy')}`}
                        </p>
                      </div>
                    </div>
                    <Badge size="sm" tone="warning" variant="soft">
                      Pending
                    </Badge>
                  </div>
                ))}
                {pendingInvites.map((invite: ShareInvite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between rounded-lg border border-border-light bg-background-subtle p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning-light">
                        <Mail className="h-5 w-5 text-warning-dark" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{invite.inviteeEmail}</p>
                        <p className="text-sm text-text-secondary">
                          No account yet
                          {invite.expiresAt &&
                            ` • Expires ${format(new Date(invite.expiresAt), 'MMM d, yyyy')}`}
                        </p>
                      </div>
                    </div>
                    <Badge size="sm" tone="warning" variant="soft">
                      Invited
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Empty State */}
          {acceptedShares.length === 0 &&
            pendingShares.length === 0 &&
            pendingInvites.length === 0 && (
              <Card variant="elevated" padding="lg">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-pale mb-4">
                    <UserPlus className="h-8 w-8 text-brand-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-text-primary mb-2">
                    No caregivers yet
                  </h3>
                  <p className="text-sm text-text-secondary mb-4 max-w-sm">
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
              </Card>
            )}
        </>
      )}

      <InviteCaregiverDialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen} />
    </div>
  );
}

