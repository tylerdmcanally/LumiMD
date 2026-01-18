'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { Mail, Lock, ArrowRight, Users, Loader2 } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/PageContainer';

function CareSignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { data: inviteInfo, isLoading: inviteLoading, error: inviteError } = useQuery({
    queryKey: ['care-signin-invite', token],
    queryFn: () => api.shares.getInviteInfo(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  const [email, setEmail] = React.useState(inviteInfo?.caregiverEmail || '');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (inviteInfo?.caregiverEmail && !email) {
      setEmail(inviteInfo.caregiverEmail);
    }
  }, [inviteInfo?.caregiverEmail, email]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError('Missing invitation token. Please use the link from your email.');
      return;
    }

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);

      try {
        await api.shares.acceptToken(token);
        router.push('/care');
      } catch (acceptError: any) {
        if (acceptError?.code === 'email_mismatch') {
          await signOut(auth);
          setError(acceptError?.userMessage || 'This invitation was sent to a different email.');
          setIsSubmitting(false);
          return;
        }
        throw acceptError;
      }
    } catch (err: any) {
      const message =
        err?.code === 'auth/invalid-credential'
          ? 'Invalid email or password. Please try again.'
          : err?.userMessage || err?.message || 'Unable to sign in. Please try again.';
      setError(message);
      setIsSubmitting(false);
    }
  };

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

  if (inviteError || !token) {
    return (
      <PageContainer maxWidth="lg">
        <Card variant="elevated" padding="lg" className="text-center py-12">
          <Users className="h-12 w-12 text-error mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-text-primary mb-2">
            Invalid Invitation
          </h1>
          <p className="text-text-secondary mb-6">
            This invitation link is missing or expired. Please ask for a new invite.
          </p>
          <Button variant="primary" asChild>
            <Link href="/">Go to Home</Link>
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-subtle to-brand-primary-pale p-6">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-floating">
            <Users className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-text-primary">Caregiver Sign In</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Sign in to access shared health information.
          </p>
        </div>

        <Card variant="elevated" padding="lg" className="shadow-floating">
          <div className="space-y-6">
            {inviteInfo?.ownerName && (
              <div className="rounded-lg bg-background-subtle p-4 text-sm border border-border-light">
                <p className="text-text-secondary">
                  <span className="font-semibold text-text-primary">{inviteInfo.ownerName}</span> invited you to be their caregiver.
                </p>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" required>
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  leftIcon={<Mail className="h-4 w-4" />}
                  required
                  disabled={Boolean(inviteInfo?.caregiverEmail)}
                  className={inviteInfo?.caregiverEmail ? 'bg-background-subtle' : ''}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" required>
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-error-light bg-error-light p-4 animate-fade-in-up">
                  <p className="text-sm font-medium text-error-dark">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={isSubmitting}
                disabled={isSubmitting}
                rightIcon={<ArrowRight className="h-5 w-5" />}
              >
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-surface px-4 text-text-muted">
                  Need an account?
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="lg"
              fullWidth
              onClick={() => router.push(`/care/sign-up?token=${token}`)}
            >
              Create caregiver account
            </Button>
          </div>
        </Card>

        <div className="mt-8 space-y-4 text-center text-sm text-text-secondary">
          <p>
            Need help?{' '}
            <Link
              href="https://lumimd.app"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-primary hover:text-brand-primary-dark transition-smooth"
            >
              Visit our support center
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CareSignInPage() {
  return (
    <React.Suspense
      fallback={(
        <PageContainer maxWidth="lg">
          <Card variant="elevated" padding="lg" className="text-center py-12">
            <Loader2 className="h-12 w-12 animate-spin text-brand-primary mx-auto mb-4" />
            <h1 className="text-2xl font-semibold text-text-primary mb-2">
              Loading
            </h1>
            <p className="text-text-secondary">Preparing caregiver sign-in...</p>
          </Card>
        </PageContainer>
      )}
    >
      <CareSignInContent />
    </React.Suspense>
  );
}
