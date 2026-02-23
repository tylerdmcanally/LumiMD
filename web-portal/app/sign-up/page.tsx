'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Mail, Lock, User, ArrowRight, Users } from 'lucide-react';

import { auth } from '@/lib/firebase';
import { api } from '@/lib/api/client';
import { resolvePostAuthRedirect } from '@/lib/auth/redirects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';

const LEGAL_TERMS_VERSION = '1.0-2026-02-17';
const LEGAL_PRIVACY_VERSION = '1.0-2026-02-17';

export default function SignUpPage() {
  const router = useRouter();

  // Parse URL params once on mount
  const [params] = React.useState(() => {
    if (typeof window === 'undefined') return { invite: null, email: null, from: null, returnTo: '/dashboard' };
    const urlParams = new URLSearchParams(window.location.search);
    const storedInvite = sessionStorage.getItem('invite_token');
    const storedEmail = sessionStorage.getItem('invite_email');
    const storedFrom = sessionStorage.getItem('invite_from');
    return {
      invite: urlParams.get('invite') || storedInvite,
      email: urlParams.get('email') || storedEmail,
      from: urlParams.get('from') || storedFrom,
      returnTo: urlParams.get('returnTo') || '/dashboard',
    };
  });

  const inviteToken = React.useMemo(() => {
    if (params.invite) return params.invite;
    if (params.returnTo?.startsWith('/invite/')) {
      const token = params.returnTo.replace('/invite/', '').split('?')[0];
      return token || null;
    }
    return null;
  }, [params.invite, params.returnTo]);

  const isInviteFlow = Boolean(inviteToken);
  const inviteEmail = params.email || '';
  const inviteFrom = params.from ? decodeURIComponent(params.from) : null;

  const [email, setEmail] = React.useState(inviteEmail);
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [fullName, setFullName] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isInviteFlow) {
      sessionStorage.removeItem('invite_token');
      sessionStorage.removeItem('invite_email');
      sessionStorage.removeItem('invite_from');
    }
  }, [isInviteFlow]);

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

    if (!acceptedTerms || !acceptedPrivacy) {
      setError('Please accept the Terms of Use and Privacy Policy to continue.');
      return;
    }

    try {
      setIsSubmitting(true);
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

      if (fullName.trim().length) {
        await updateProfile(credential.user, { displayName: fullName.trim() });
      }

      // Ensure auth state is fully available
      await credential.user.getIdToken();

      // Try to send verification email
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

      // Capture legal assent metadata at signup time.
      try {
        const profilePayload: Record<string, unknown> = {
          legalAssent: {
            accepted: true,
            termsVersion: LEGAL_TERMS_VERSION,
            privacyVersion: LEGAL_PRIVACY_VERSION,
            source: 'signup_web',
            platform: 'web',
          },
        };

        if (!isInviteFlow) {
          profilePayload.roles = ['patient'];
          profilePayload.primaryRole = 'patient';
        }

        await api.user.updateProfile(profilePayload);
      } catch (legalAssentError) {
        console.warn('[sign-up] Failed to persist legal assent metadata:', legalAssentError);

        // Preserve existing non-invite role assignment behavior as a fallback.
        if (!isInviteFlow) {
          try {
            await api.user.updateProfile({
              roles: ['patient'],
              primaryRole: 'patient',
            });
          } catch (roleError) {
            console.warn('[sign-up] Failed to set primary role:', roleError);
          }
        }
      }

      // If this is an invite flow, accept the invite and go to care dashboard
      if (isInviteFlow && inviteToken) {
        setSuccessMessage('Account created! Accepting invitation...');
        try {
          await api.shares.acceptToken(inviteToken);
          setSuccessMessage('Welcome to LumiMD! Redirecting to care dashboard...');
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('invite_token');
            sessionStorage.removeItem('invite_email');
            sessionStorage.removeItem('invite_from');
          }
          setTimeout(() => {
            router.replace('/care');
          }, 1000);
        } catch (acceptError: any) {
          console.error('Failed to accept invite:', acceptError);
          // Even if accept fails, account was created - go to invite page to retry
          setError('Account created, but we had trouble accepting the invitation. Please try again.');
          setTimeout(() => {
            router.replace(`/invite/${inviteToken}`);
          }, 2000);
        }
      } else {
        // Normal sign-up flow
        setSuccessMessage('Account created! Check your inbox to verify your email.');
        const destination = await resolvePostAuthRedirect(params.returnTo);
        setTimeout(() => {
          router.replace(destination);
        }, 500);
      }
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
            {isInviteFlow ? (
              <Users className="h-8 w-8 text-white" />
            ) : (
              <span className="text-2xl font-bold text-white">L</span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-text-primary">
            {isInviteFlow ? 'Join as a Caregiver' : 'Create your LumiMD account'}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isInviteFlow
              ? 'Create an account to view shared health information.'
              : 'Keep your visits, medications, and action items organized.'}
          </p>
        </div>

        <Card variant="elevated" padding="lg" className="shadow-floating">
          <div className="space-y-6">
            {/* Caregiver invite banner */}
            {isInviteFlow && inviteFrom && (
              <div className="rounded-lg bg-brand-primary/10 p-4 text-sm border border-brand-primary/20">
                <p className="text-text-secondary">
                  <span className="font-semibold text-brand-primary">{inviteFrom}</span> has invited you to be their caregiver.
                </p>
                <p className="text-text-muted mt-1">
                  You'll be able to view their visits, medications, and health information.
                </p>
              </div>
            )}

            {!isInviteFlow && (
              <div className="text-center">
                <h2 className="text-2xl font-semibold text-text-primary">
                  Get started in minutes
                </h2>
                <p className="mt-2 text-sm text-text-secondary">
                  We'll send a verification email so you can securely access the portal.
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
                  disabled={isInviteFlow && Boolean(inviteEmail)}
                  className={isInviteFlow && inviteEmail ? 'bg-background-subtle' : ''}
                />
                {isInviteFlow && inviteEmail && (
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

              <div className="space-y-3 rounded-lg border border-border-light bg-background-subtle p-4">
                <p className="text-xs text-text-secondary">
                  Please review and accept both policies before creating your account.
                </p>
                <label className="flex cursor-pointer items-start gap-3 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                    checked={acceptedTerms}
                    onChange={(event) => setAcceptedTerms(event.target.checked)}
                  />
                  <span>
                    I have read and agree to the{' '}
                    <Link href="/terms" className="font-medium text-brand-primary hover:underline">
                      Terms of Use
                    </Link>
                    .
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border text-brand-primary focus:ring-brand-primary"
                    checked={acceptedPrivacy}
                    onChange={(event) => setAcceptedPrivacy(event.target.checked)}
                  />
                  <span>
                    I have read and agree to the{' '}
                    <Link href="/privacy" className="font-medium text-brand-primary hover:underline">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>
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
                disabled={isSubmitting || !acceptedTerms || !acceptedPrivacy}
                rightIcon={<ArrowRight className="h-5 w-5" />}
              >
                {isSubmitting 
                  ? (isInviteFlow ? 'Creating account...' : 'Creating account...') 
                  : (isInviteFlow ? 'Create Account & Accept Invite' : 'Create account')}
              </Button>

              <p className="text-xs leading-5 text-text-muted">
                By creating an account, you acknowledge the arbitration and class action waiver in
                Section 10.2 of the Terms of Use.
              </p>
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
              onClick={() => {
                const signInParams = new URLSearchParams();
                if (isInviteFlow && inviteToken) {
                  signInParams.set('returnTo', `/invite/${inviteToken}`);
                } else {
                  signInParams.set('returnTo', params.returnTo);
                }
                router.push(`/sign-in?${signInParams.toString()}`);
              }}
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
