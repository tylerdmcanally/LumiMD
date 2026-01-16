'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, LogOut, Users } from 'lucide-react';
import { signOut } from 'firebase/auth';

import { api } from '@/lib/api/client';
import { auth } from '@/lib/firebase';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/PageContainer';
import Link from 'next/link';

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const user = useCurrentUser();

  // Fetch invite info (public endpoint, no auth required)
  const { data: inviteInfo, isLoading: inviteLoading, error: inviteError } = useQuery({
    queryKey: ['invite-info', token],
    queryFn: () => api.shares.getInviteInfo(token),
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async (inviteToken: string) => {
      return api.shares.acceptToken(inviteToken);
    },
    onSuccess: async () => {
      toast.success('Invitation accepted!', {
        description: 'You now have access to view this person\'s health information.',
      });
      setTimeout(() => {
        router.push('/care');
      }, 1000);
    },
    onError: (error: any) => {
      const message = error?.userMessage || error?.message || 'Failed to accept invitation';
      toast.error(message);
    },
  });

  // Auto-accept if user is logged in
  const lastUserIdRef = React.useRef<string | null>(null);
  const hasAttemptedAccept = React.useRef(false);

  React.useEffect(() => {
    if (user?.uid !== lastUserIdRef.current) {
      hasAttemptedAccept.current = false;
      lastUserIdRef.current = user?.uid ?? null;
      acceptMutation.reset();
    }

    if (user && token && !hasAttemptedAccept.current && !acceptMutation.isPending) {
      const timer = setTimeout(() => {
        if (!hasAttemptedAccept.current) {
          hasAttemptedAccept.current = true;
          acceptMutation.mutate(token);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user, token]);

  // Build sign-up URL with invite context
  const signUpUrl = React.useMemo(() => {
    const params = new URLSearchParams();
    params.set('invite', token);
    if (inviteInfo?.caregiverEmail) {
      params.set('email', inviteInfo.caregiverEmail);
    }
    if (inviteInfo?.ownerName) {
      params.set('from', inviteInfo.ownerName);
    }
    return `/sign-up?${params.toString()}`;
  }, [token, inviteInfo]);

  // Loading invite info
  if (inviteLoading) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-brand-primary mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            Loading Invitation
          </h1>
          <p className="text-text-secondary">Please wait...</p>
        </Card>
      </PageContainer>
    );
  }

  // Invite error (expired, not found, etc.)
  if (inviteError) {
    const error = inviteError as any;
    const isExpired = error?.code === 'invite_expired';
    const isNotFound = error?.code === 'not_found';
    const isUsed = error?.code === 'invite_used';

    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <XCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            {isExpired && 'Invitation Expired'}
            {isNotFound && 'Invitation Not Found'}
            {isUsed && 'Invitation Already Used'}
            {!isExpired && !isNotFound && !isUsed && 'Invalid Invitation'}
          </h1>
          <p className="text-text-secondary mb-6">
            {isExpired && 'This invitation has expired. Please ask for a new invitation.'}
            {isNotFound && 'This invitation could not be found.'}
            {isUsed && 'This invitation has already been accepted.'}
            {!isExpired && !isNotFound && !isUsed && (error?.message || 'This invitation is not valid.')}
          </p>
          <Button variant="primary" onClick={() => router.push('/')}>
            Go to Home
          </Button>
        </Card>
      </PageContainer>
    );
  }

  // User logged in - accepting
  if (user && acceptMutation.isPending) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <Loader2 className="h-12 w-12 animate-spin text-brand-primary mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            Accepting Invitation
          </h1>
          <p className="text-text-secondary">Please wait while we connect you...</p>
        </Card>
      </PageContainer>
    );
  }

  // Successfully accepted
  if (acceptMutation.isSuccess) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            Invitation Accepted!
          </h1>
          <p className="text-text-secondary mb-6">
            You now have access to view {inviteInfo?.ownerName || 'their'}'s health information.
          </p>
          <Button variant="primary" onClick={() => router.push('/care')}>
            Go to Care Dashboard
          </Button>
        </Card>
      </PageContainer>
    );
  }

  // Accept error
  if (acceptMutation.isError) {
    const error = acceptMutation.error as any;
    const isEmailMismatch = error?.code === 'email_mismatch';

    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <XCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            {isEmailMismatch ? 'Email Mismatch' : 'Unable to Accept Invitation'}
          </h1>
          <p className="text-text-secondary mb-6">
            {error?.userMessage || error?.message || 'An error occurred while accepting the invitation.'}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {isEmailMismatch && (
              <Button
                variant="primary"
                leftIcon={<LogOut className="h-4 w-4" />}
                onClick={async () => {
                  await signOut(auth);
                }}
              >
                Sign Out & Use Different Account
              </Button>
            )}
            {!isEmailMismatch && (
              <Button variant="primary" onClick={() => router.push('/care')}>
                Go to Care Dashboard
              </Button>
            )}
          </div>
        </Card>
      </PageContainer>
    );
  }

  // User not logged in - show personalized invitation
  return (
    <PageContainer maxWidth="lg">
      <Card variant="elevated" padding="lg" className="text-center py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary-pale mx-auto mb-4">
          <Users className="h-8 w-8 text-brand-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">
          You've Been Invited!
        </h1>
        <p className="text-text-secondary mb-2">
          <span className="font-semibold text-brand-primary">{inviteInfo?.ownerName || 'Someone'}</span> has invited you to be their caregiver on LumiMD.
        </p>
        <p className="text-sm text-text-muted mb-6">
          Create an account to view their health information, medications, and action items.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="primary" asChild>
            <Link href={signUpUrl}>Create Account</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/sign-in?returnTo=/invite/${token}`}>I Have an Account</Link>
          </Button>
        </div>
        {inviteInfo?.caregiverEmail && (
          <p className="text-xs text-text-muted mt-4">
            This invitation was sent to {inviteInfo.caregiverEmail}
          </p>
        )}
      </Card>
    </PageContainer>
  );
}

