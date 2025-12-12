'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/lib/hooks/useCurrentUser';

function VerifyEmailContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const user = useCurrentUser();
    const [status, setStatus] = React.useState<'loading' | 'success' | 'error' | 'expired'>('loading');
    const [errorMessage, setErrorMessage] = React.useState('');

    const token = searchParams?.get('token');
    const uid = searchParams?.get('uid');

    React.useEffect(() => {
        const verifyEmail = async () => {
            if (!token || !uid) {
                setStatus('error');
                setErrorMessage('Invalid verification link');
                return;
            }

            try {
                const response = await fetch('/api/verify-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, uid }),
                });

                const data = await response.json();

                if (response.ok) {
                    setStatus('success');
                    // Reload user to get updated emailVerified status
                    if (user) {
                        await user.reload();
                    }
                    // Redirect to dashboard after 3 seconds
                    setTimeout(() => {
                        router.push('/dashboard');
                    }, 3000);
                } else if (data.error === 'Token expired') {
                    setStatus('expired');
                } else {
                    setStatus('error');
                    setErrorMessage(data.error || 'Verification failed');
                }
            } catch (error) {
                setStatus('error');
                setErrorMessage('Failed to verify email. Please try again.');
            }
        };

        verifyEmail();
    }, [token, uid, user, router]);

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-subtle to-brand-primary-pale p-6">
            <div className="w-full max-w-md animate-fade-in-up">
                <div className="mb-8 text-center">
                    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-floating">
                        <span className="text-2xl font-bold text-white">L</span>
                    </div>
                    <h1 className="text-3xl font-bold text-text-primary">Email Verification</h1>
                </div>

                <Card variant="elevated" padding="lg" className="shadow-floating">
                    <div className="space-y-6 text-center">
                        {status === 'loading' && (
                            <>
                                <div className="flex justify-center">
                                    <Loader2 className="h-12 w-12 animate-spin text-brand-primary" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                                        Verifying your email...
                                    </h2>
                                    <p className="text-sm text-text-secondary">
                                        Please wait while we confirm your email address.
                                    </p>
                                </div>
                            </>
                        )}

                        {status === 'success' && (
                            <>
                                <div className="flex justify-center">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-light">
                                        <Check className="h-8 w-8 text-success-dark" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                                        Email verified!
                                    </h2>
                                    <p className="text-sm text-text-secondary mb-4">
                                        Your email has been successfully verified. You now have full access to all features.
                                    </p>
                                    <p className="text-xs text-text-muted">
                                        Redirecting to dashboard...
                                    </p>
                                </div>
                                <Button
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    onClick={() => router.push('/dashboard')}
                                    rightIcon={<ArrowRight className="h-5 w-5" />}
                                >
                                    Go to Dashboard
                                </Button>
                            </>
                        )}

                        {status === 'expired' && (
                            <>
                                <div className="flex justify-center">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warning-light">
                                        <AlertCircle className="h-8 w-8 text-warning-dark" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                                        Link expired
                                    </h2>
                                    <p className="text-sm text-text-secondary mb-4">
                                        This verification link has expired. Please sign in and request a new verification email.
                                    </p>
                                </div>
                                <Button
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    onClick={() => router.push('/sign-in')}
                                    rightIcon={<ArrowRight className="h-5 w-5" />}
                                >
                                    Go to Sign In
                                </Button>
                            </>
                        )}

                        {status === 'error' && (
                            <>
                                <div className="flex justify-center">
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-light">
                                        <AlertCircle className="h-8 w-8 text-error-dark" />
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-xl font-semibold text-text-primary mb-2">
                                        Verification failed
                                    </h2>
                                    <p className="text-sm text-text-secondary mb-4">
                                        {errorMessage || 'We couldn\'t verify your email. The link may be invalid or expired.'}
                                    </p>
                                </div>
                                <Button
                                    variant="primary"
                                    size="lg"
                                    fullWidth
                                    onClick={() => router.push('/sign-in')}
                                    rightIcon={<ArrowRight className="h-5 w-5" />}
                                >
                                    Go to Sign In
                                </Button>
                            </>
                        )}
                    </div>
                </Card>
            </div>
        </div>
    );
}

export default function VerifyEmailPage() {
    return (
        <React.Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background-subtle to-brand-primary-pale">
                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
            </div>
        }>
            <VerifyEmailContent />
        </React.Suspense>
    );
}
