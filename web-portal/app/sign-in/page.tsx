'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import Image from 'next/image';
import { Mail, Lock, ArrowRight } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

export default function SignInPage() {
  const router = useRouter();
  const [returnTo, setReturnTo] = React.useState('/dashboard');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    try {
      setIsSubmitting(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.push(returnTo);
    } catch (err: any) {
      const message =
        err?.code === 'auth/invalid-credential'
          ? 'Invalid email or password. Please try again.'
          : err?.message || 'Unable to sign in. Please try again.';
      setError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-subtle to-brand-primary-pale p-6">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Logo & Branding */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-text-primary">LumiMD</h1>
          <p className="mt-2 text-base text-text-secondary">
            Sign in to continue to your medical dashboard.
          </p>
        </div>

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

            {/* Alternative Sign In */}
            <Button
              variant="outline"
              size="lg"
              fullWidth
              className="h-12 justify-center gap-3"
              onClick={() => {
                // TODO: Implement Google Sign In
                console.log('Google Sign In');
              }}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
                <Image
                  src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
                  alt="Google"
                  width={18}
                  height={18}
                />
              </span>
              <span className="text-sm font-semibold text-text-primary">
                Continue with Google
              </span>
            </Button>
          </div>
        </Card>

        {/* Footer Links */}
        <div className="mt-8 space-y-4 text-center text-sm text-text-secondary">
          <p>
            Don't have an account?{' '}
            <Link
              href="/sign-up"
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

        {/* App Download Prompt */}
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
      </div>
    </div>
  );
}
