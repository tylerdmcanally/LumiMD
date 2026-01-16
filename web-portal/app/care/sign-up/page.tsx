'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Mail, Lock, User, ArrowRight, Users, Loader2 } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/layout/PageContainer';

export default function CareSignUpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const { data: inviteInfo, isLoading: inviteLoading, error: inviteError } = useQuery({
    queryKey: ['care-signup-invite', token],
    queryFn: () => api.shares.getInviteInfo(token as string),
    enabled: Boolean(token),
    retry: false,
  });

  const [email, setEmail] = React.useState(inviteInfo?.caregiverEmail || '');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (inviteInfo?.caregiverEmail && !email) {
      setEmail(inviteInfo.caregiverEmail);
    }
  }, [inviteInfo?.caregiverEmail, email]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!token) {
      setError('Missing invitation token. Please use the link from your email.');
      return;
    }

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Please fill out all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setIsSubmitting(true);
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

      if (fullName.trim().length) {
        await updateProfile(credential.user, { displayName: fullName.trim() });
      }

      await credential.user.getIdToken();

      try {
        const idToken = await credential.user.getIdToken();
        await fetch('/api/send-verification-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            userId: credential.user.uid,
            email: email.trim(),
          }),
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
      }

      setSuccessMessage('Account created! Accepting invitation...');
      await api.shares.acceptToken(token);
      setSuccessMessage('Welcome to LumiMD! Redirecting to care dashboard...');
      setTimeout(() => {
        router.replace('/care');
      }, 800);
    } catch (err: any) {
      const message =
        err?.code === 'auth/email-already-in-use'
          ? 'An account with this email already exists. Try signing in instead.'
          : err?.message || 'Unable to create your account. Please try again.';
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
          <h1 className="text-3xl font-bold text-text-primary">Join as a Caregiver</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Create an account to view shared health information.
          </p>
        </div>

        <Card variant="elevated" padding="lg" className="shadow-floating">
          <div className="space-y-6">
            {inviteInfo?.ownerName && (
              <div className="rounded-lg bg-brand-primary/10 p-4 text-sm border border-brand-primary/20">
                <p className="text-text-secondary">
                  <span className="font-semibold text-brand-primary">{inviteInfo.ownerName}</span> has invited you to be their caregiver.
                </p>
                <p className="text-text-muted mt-1">
                  You'll be able to view their visits, medications, and action items.
                </p>
              </div>
            )}

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="First and last name"
                  leftIcon={<User className="h-4 w-4" />}
                />
              </div>

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
                {inviteInfo?.caregiverEmail && (
                  <p className="text-xs text-text-muted">
                    This invitation was sent to this email address.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" required>
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Create a secure password"
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" required>
                  Confirm password
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your password"
                  leftIcon={<Lock className="h-4 w-4" />}
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-error-light bg-error-light p-4 animate-fade-in-up">
                  <p className="text-sm font-medium text-error-dark">{error}</p>
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg border border-success-light bg-success-light p-4 animate-fade-in-up">
                  <p className="text-sm font-medium text-success-dark">{successMessage}</p>
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
                {isSubmitting ? 'Creating account...' : 'Create Caregiver Account'}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-surface px-4 text-text-muted">
                  Already have an account?
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="lg"
              fullWidth
              onClick={() => router.push(`/care/sign-in?token=${token}`)}
            >
              Sign in instead
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
