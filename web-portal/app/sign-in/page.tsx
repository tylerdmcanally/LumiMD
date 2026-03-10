'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword, signInWithPopup, getAdditionalUserInfo, GoogleAuthProvider, signOut } from 'firebase/auth';
import { Mail, Lock, ArrowRight, Smartphone } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { api } from '@/lib/api/client';
import { resolvePostAuthRedirect } from '@/lib/auth/redirects';
import { getAuthErrorMessage } from '@/lib/auth/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function SignInPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = React.useState('/dashboard');
  const [fromApp, setFromApp] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const next = params.get('returnTo');
    const reason = params.get('reason');
    
    if (next) {
      setReturnTo(next);
    }
    
    // If coming from app handoff, sign out existing user to prevent showing wrong account
    if (reason === 'app_handoff') {
      setFromApp(true);
      setIsSigningOut(true);
      
      signOut(auth)
        .then(() => {
          console.log('[sign-in] Signed out existing user for app handoff');
        })
        .catch((err) => {
          console.error('[sign-in] Error signing out:', err);
        })
        .finally(() => {
          setIsSigningOut(false);
        });
    }
  }, []);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      // If this is a brand-new account (user hit Sign In instead of Sign Up with Google),
      // set default profile so routing and role checks work correctly.
      const info = getAdditionalUserInfo(result);
      if (info?.isNewUser) {
        try {
          await api.user.updateProfile({ roles: ['patient'], primaryRole: 'patient' });
        } catch (profileErr) {
          console.warn('[sign-in] Failed to set default profile for new Google user:', profileErr);
        }
      }

      const destination = await resolvePostAuthRedirect(returnTo);
      router.push(destination);
    } catch (err: any) {
      const message = getAuthErrorMessage(err);
      if (!message) {
        // User cancelled popup — not an error
        setIsGoogleLoading(false);
        return;
      }
      setError(message);
      setIsGoogleLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      const destination = await resolvePostAuthRedirect(returnTo);
      router.push(destination);
    } catch (err: any) {
      setError(getAuthErrorMessage(err));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-subtle to-accent-warm-pale p-6">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Logo & Branding */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight text-brand-primary">LumiMD</h1>
          <p className="mt-2 text-base text-text-secondary">
            Sign in to continue to your medical dashboard.
          </p>
        </div>

        {/* App Handoff Notice */}
        {fromApp && (
          <Card
            variant="flat"
            padding="md"
            className="mb-6 border border-brand-primary/30 bg-brand-primary-pale"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/20">
                <Smartphone className="h-5 w-5 text-brand-primary" />
              </div>
              <div>
                <p className="font-semibold text-text-primary">
                  Sign in to continue
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Please sign in with the same account you use in the LumiMD app to view your data.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Sign In Card */}
        <Card variant="elevated" padding="lg" className="shadow-floating">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-text-primary">
                Welcome back
              </h2>
              <p className="mt-2 text-sm text-text-secondary">
                Sign in to access your medical dashboard
              </p>
            </div>

            {isSigningOut ? (
              <div className="flex flex-col items-center py-8">
                <div className="relative w-12 h-12 mb-4">
                  <div className="absolute inset-0 border-4 border-brand-primary/20 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-brand-primary rounded-full border-t-transparent animate-spin"></div>
                </div>
                <p className="text-sm text-text-secondary">Preparing sign in...</p>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                {/* Email Field */}
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

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" required>
                      Password
                    </Label>
                    <Link
                      href="/forgot-password"
                      className="text-sm font-medium text-brand-primary hover:text-brand-primary-dark transition-smooth"
                    >
                      Forgot password?
                    </Link>
                  </div>
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

                {/* Error Message */}
                {error && (
                  <div className="rounded-lg border border-error-light bg-error-light p-4 animate-fade-in-up">
                    <p className="text-sm font-medium text-error-dark">{error}</p>
                  </div>
                )}

                {/* Submit Button */}
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
            )}

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
                    In the LumiMD app, go to Settings &gt; Web Access &gt; Open Web Portal to sign in automatically. You can also set a password there for direct web access.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Footer Links */}
        <div className="mt-8 space-y-4 text-center text-sm text-text-secondary">
          <p>
            Don't have an account?{' '}
            <Link
              href={`/sign-up?returnTo=${encodeURIComponent(returnTo)}`}
              className="font-semibold text-brand-primary hover:text-brand-primary-dark transition-smooth"
            >
              Sign up for free
            </Link>
          </p>
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

        {/* App Download Prompt - only show if not from app */}
        {!fromApp && (
          <Card
            variant="flat"
            padding="md"
            className="mt-8 border border-brand-primary/20 bg-brand-primary-pale"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/20">
                <svg
                  className="h-5 w-5 text-brand-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-text-primary">
                  Get the mobile app
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Record visits and access your health data on the go with LumiMD
                  for iOS.
                </p>
                <Link
                  href="https://lumimd.app"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-primary hover:text-brand-primary-dark transition-smooth"
                >
                  Download now
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
