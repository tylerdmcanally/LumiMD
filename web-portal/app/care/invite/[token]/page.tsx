'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2, XCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { signOut } from 'firebase/auth';

import { api } from '@/lib/api/client';
import { auth } from '@/lib/firebase';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/PageContainer';

export default function CareInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params.token;
  const user = useCurrentUser();

  const { data: inviteInfo, isLoading: inviteLoading, error: inviteError } = useQuery({
    queryKey: ['care-invite-info', token],
    queryFn: () => api.shares.getInviteInfo(token),
    enabled: Boolean(token),
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async (inviteToken: string) => api.shares.acceptToken(inviteToken),
    onSuccess: () => {
      toast.success('Invitation accepted!');
      setTimeout(() => {
        router.push('/care');
      }, 500);
    },
    onError: (error: any) => {
      const message = error?.userMessage || error?.message || 'Failed to accept invitation';
      toast.error(message);
    },
  });

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
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [user, token, acceptMutation]);

  const signUpUrl = React.useMemo(() => {
    const search = new URLSearchParams();
    search.set('token', token);
    return `/care/sign-up?${search.toString()}`;
  }, [token]);

  const signInUrl = React.useMemo(() => {
    const search = new URLSearchParams();
    search.set('token', token);
    return `/care/sign-in?${search.toString()}`;
  }, [token]);

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
                onClick={async () => {
                  await signOut(auth);
                }}
              >
                Sign Out & Try Again
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

  return (
    <PageContainer maxWidth="lg">
      <Card variant="elevated" padding="lg" className="text-center py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background-subtle mx-auto mb-4">
          <Users className="h-8 w-8 text-text-secondary" />
        </div>
        <h1 className="text-2xl font-semibold text-text-primary mb-2">
          You're invited to be a caregiver
        </h1>
        <p className="text-text-secondary mb-2">
          <span className="font-semibold text-text-primary">{inviteInfo?.ownerName || 'Someone'}</span> has invited you to view their health information.
        </p>
        <p className="text-sm text-text-muted mb-6">
          Create an account to access their visits, medications, and action items.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="primary" asChild>
            <Link href={signUpUrl}>Create Caregiver Account</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={signInUrl}>I Have an Account</Link>
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
