'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Mail, Lock, User, ArrowRight } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { getEmailVerificationSettings } from '@/lib/emailVerification';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function SignUpPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = React.useState('/dashboard');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const next = params.get('returnTo');
    if (next) {
      setReturnTo(next);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

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

      // Try to send verification email via our custom Resend endpoint
      try {
        const idToken = await credential.user.getIdToken();
        const response = await fetch('/api/send-verification-email', {
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

        if (!response.ok) {
          throw new Error('Failed to send verification email');
        }

        setSuccessMessage('Account created! Check your inbox to verify your email before signing in.');
      } catch (emailError: any) {
        console.error('Failed to send verification email:', emailError);
        setSuccessMessage('Account created! However, we had trouble sending the verification email. You can resend it after signing in.');
      }

      setTimeout(() => {
        router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
      }, 3000);
    } catch (err: any) {
      const message =
        err?.code === 'auth/email-already-in-use'
          ? 'An account with this email already exists. Try signing in instead.'
          : err?.message || 'Unable to create your account. Please try again.';
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-subtle to-brand-primary-pale p-6">
      <div className="w-full max-w-md animate-fade-in-up">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-floating">
            <span className="text-2xl font-bold text-white">L</span>
          </div>
          <h1 className="text-3xl font-bold text-text-primary">Create your LumiMD account</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Keep your visits, medications, and action items organized.
          </p>
        </div>

        <Card variant="elevated" padding="lg" className="shadow-floating">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-text-primary">
                Get started in minutes
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                We’ll send a verification email so you can securely access the portal.
              </p>
            </div>

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
                />
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
                {isSubmitting ? 'Creating account...' : 'Create account'}
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
              onClick={() => router.push(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`)}
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

