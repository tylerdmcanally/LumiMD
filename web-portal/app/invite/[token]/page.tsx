'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

import { api } from '@/lib/api/client';
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

  const acceptMutation = useMutation({
    mutationFn: async (inviteToken: string) => {
      return api.shares.acceptInvite(inviteToken);
    },
    onSuccess: () => {
      toast.success('Invitation accepted!', {
        description: 'You now have access to view this person\'s health information.',
      });
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 1500);
    },
    onError: (error: any) => {
      const message = error?.userMessage || error?.message || 'Failed to accept invitation';
      toast.error(message);
    },
  });

  // Auto-accept if user is logged in
  React.useEffect(() => {
    if (user && token && !acceptMutation.isPending && !acceptMutation.isSuccess) {
      acceptMutation.mutate(token);
    }
  }, [user, token]);

  // If user is logged in, show accepting state
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

  // If successfully accepted
  if (acceptMutation.isSuccess) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            Invitation Accepted!
          </h1>
          <p className="text-text-secondary mb-6">
            You now have access to view this person's health information.
          </p>
          <Button variant="primary" onClick={() => router.push('/dashboard')}>
            Go to Dashboard
          </Button>
        </Card>
      </PageContainer>
    );
  }

  // If error occurred
  if (acceptMutation.isError) {
    const error = acceptMutation.error as any;
    const isExpired = error?.code === 'invite_expired';
    const isEmailMismatch = error?.code === 'email_mismatch';
    const isNotFound = error?.code === 'not_found';

    return (
      <PageContainer maxWidth="md">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <XCircle className="h-12 w-12 text-error mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            {isExpired && 'Invitation Expired'}
            {isEmailMismatch && 'Email Mismatch'}
            {isNotFound && 'Invitation Not Found'}
            {!isExpired && !isEmailMismatch && !isNotFound && 'Unable to Accept Invitation'}
          </h1>
          <p className="text-text-secondary mb-6">
            {isExpired &&
              'This invitation has expired. Please ask the person to send you a new invitation.'}
            {isEmailMismatch &&
              'This invitation was sent to a different email address. Please sign in with the email address that received the invitation.'}
            {isNotFound && 'This invitation could not be found. It may have already been accepted or cancelled.'}
            {!isExpired && !isEmailMismatch && !isNotFound && error?.userMessage}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            {!user && (
              <>
                <Button variant="primary" asChild>
                  <Link href={`/sign-in?redirect=/invite/${token}`}>Sign In</Link>
                </Button>
                <Button variant="secondary" asChild>
                  <Link href={`/sign-up?redirect=/invite/${token}`}>Create Account</Link>
                </Button>
              </>
            )}
            {user && (
              <Button variant="primary" onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
            )}
          </div>
        </Card>
      </PageContainer>
    );
  }

  // User not logged in - show sign in/sign up options
  return (
    <PageContainer maxWidth="lg">
      <Card variant="elevated" padding="lg" className="text-center py-12">
        <h1 className="text-2xl font-semibold text-text-primary mb-2">
          You've Been Invited!
        </h1>
        <p className="text-text-secondary mb-6">
          Sign in or create an account to accept this invitation and view health information.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button variant="primary" asChild>
            <Link href={`/sign-in?redirect=/invite/${token}`}>Sign In</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href={`/sign-up?redirect=/invite/${token}`}>Create Account</Link>
          </Button>
        </div>
      </Card>
    </PageContainer>
  );
}

