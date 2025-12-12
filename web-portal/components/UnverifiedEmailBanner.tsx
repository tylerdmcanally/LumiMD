'use client';

import * as React from 'react';
import { X, Mail, AlertCircle } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function UnverifiedEmailBanner() {
    const [isDismissed, setIsDismissed] = React.useState(false);
    const [isSending, setIsSending] = React.useState(false);
    const user = auth.currentUser;

    // Check if banner was dismissed this session
    React.useEffect(() => {
        const dismissed = sessionStorage.getItem('unverified_banner_dismissed');
        if (dismissed === 'true') {
            setIsDismissed(true);
        }
    }, []);

    // Don't show if email is verified or banner is dismissed
    if (!user || user.emailVerified || isDismissed) {
        return null;
    }

    const handleDismiss = () => {
        setIsDismissed(true);
        sessionStorage.setItem('unverified_banner_dismissed', 'true');
    };

    const handleResend = async () => {
        if (!user) return;

        setIsSending(true);
        try {
            const idToken = await user.getIdToken();
            const response = await fetch('/api/send-verification-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({
                    userId: user.uid,
                    email: user.email,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to send verification email');
            }

            toast.success('Verification email sent!', {
                description: 'Check your inbox to verify your email address.',
            });
        } catch (error: any) {
            toast.error('Failed to send verification email', {
                description: 'Please try again later.',
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div
            className={cn(
                'bg-amber-50/90 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800/30',
                'px-4 py-3',
            )}
        >
            <div className="max-w-8xl mx-auto">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 shrink-0">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                            Please verify your email address
                        </p>
                        <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
                            Some features like caregiver sharing require a verified email. Check your inbox for the verification link.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleResend}
                            loading={isSending}
                            disabled={isSending}
                            className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-900/40"
                        >
                            <Mail className="h-4 w-4 mr-2" />
                            Resend
                        </Button>

                        <button
                            onClick={handleDismiss}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-600 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-100 dark:hover:bg-amber-900/40 transition-colors"
                            aria-label="Dismiss"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
