'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { Mail, Lock, ArrowRight, Users, Loader2 } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { api } from '@/lib/api/client';
import { getAuthErrorMessage } from '@/lib/auth/errors';
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
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);

  React.useEffect(() => {
    if (inviteInfo?.caregiverEmail && !email) {
      setEmail(inviteInfo.caregiverEmail);
    }
  }, [inviteInfo?.caregiverEmail, email]);

  const handleGoogleSignIn = async () => {
    setError(null);
    if (!token) {
      setError('Missing invitation token. Please use the link from your email.');
      return;
    }
    setIsGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);

      try {
        await api.shares.acceptToken(token);
        router.push('/care');
      } catch (acceptError: any) {
        if (acceptError?.code === 'email_mismatch') {
          await signOut(auth);
          setError(acceptError?.userMessage || 'This invitation was sent to a different email.');
          setIsGoogleLoading(false);
          return;
        }
        throw acceptError;
      }
    } catch (err: any) {
      const message = getAuthErrorMessage(err);
      if (!message) {
        setIsGoogleLoading(false);
        return;
      }
      setError(err?.userMessage || message);
      setIsGoogleLoading(false);
    }
  };

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
      setError(err?.userMessage || getAuthErrorMessage(err));
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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-subtle to-accent-warm-pale p-6">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-floating">
            <Users className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">Caregiver Sign In</h1>
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

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-surface px-4 text-text-muted">
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google Sign-In */}
            <Button
              type="button"
              variant="outline"
              size="lg"
              fullWidth
              loading={isGoogleLoading}
              disabled={isGoogleLoading || isSubmitting}
              onClick={handleGoogleSignIn}
              leftIcon={
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              }
            >
              {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
            </Button>

            {/* Apple Sign-In guidance */}
            <div className="rounded-lg border border-border-light bg-background-subtle p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black">
                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    Signed up with Apple?
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    In the LumiMD app, go to Settings &gt; Web Access &gt; Open Web Portal to sign in automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Need an account? */}
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
