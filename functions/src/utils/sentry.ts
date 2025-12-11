/**
 * Sentry Error Tracking Configuration
 *
 * Initializes Sentry for error tracking and performance monitoring
 * in Firebase Cloud Functions.
 *
 * Set the SENTRY_DSN environment variable to enable Sentry.
 * Without a DSN, Sentry will be disabled and errors will only be logged.
 */

import * as Sentry from '@sentry/node';
import * as functions from 'firebase-functions';

const SENTRY_DSN = process.env.SENTRY_DSN || '';

let isInitialized = false;

/**
 * Initialize Sentry for Firebase Functions.
 * Should be called once at the start of the application.
 */
export function initSentry(): void {
    if (isInitialized) {
        return;
    }

    if (!SENTRY_DSN) {
        functions.logger.info('[sentry] SENTRY_DSN not configured. Error tracking disabled.');
        isInitialized = true;
        return;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',
        release: process.env.FUNCTIONS_VERSION || 'unknown',

        // Performance sampling - adjust as needed
        tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

        // Don't send errors in test environment
        enabled: process.env.NODE_ENV !== 'test',

        // Scrub sensitive data
        beforeSend(event) {
            // Remove potential PII from breadcrumbs
            if (event.breadcrumbs) {
                event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
                    // Mask authorization headers
                    if (breadcrumb.data?.headers?.authorization) {
                        breadcrumb.data.headers.authorization = '[REDACTED]';
                    }
                    return breadcrumb;
                });
            }

            // Remove request body to avoid capturing PHI
            if (event.request?.data) {
                event.request.data = '[REDACTED]';
            }

            return event;
        },

        // Ignore certain errors
        ignoreErrors: [
            // Firebase auth errors that are expected
            'auth/user-not-found',
            'auth/invalid-id-token',
            // Network errors
            'ECONNRESET',
            'ETIMEDOUT',
        ],
    });

    functions.logger.info('[sentry] Sentry initialized successfully');
    isInitialized = true;
}

/**
 * Capture an exception and send to Sentry.
 * Also logs to Firebase Functions logger.
 */
export function captureException(
    error: Error | unknown,
    context?: Record<string, unknown>
): string | undefined {
    functions.logger.error('[error]', error);

    if (!SENTRY_DSN) {
        return undefined;
    }

    if (context) {
        Sentry.withScope((scope) => {
            Object.entries(context).forEach(([key, value]) => {
                scope.setExtra(key, value);
            });
            Sentry.captureException(error);
        });
        return undefined;
    }

    return Sentry.captureException(error);
}

/**
 * Set user context for Sentry.
 * Call this after authenticating a user.
 */
export function setUser(userId: string, email?: string): void {
    if (!SENTRY_DSN) return;

    Sentry.setUser({
        id: userId,
        email: email ? email.substring(0, 3) + '***' : undefined, // Mask email for privacy
    });
}

/**
 * Clear user context (e.g., on logout or request end).
 */
export function clearUser(): void {
    if (!SENTRY_DSN) return;
    Sentry.setUser(null);
}

/**
 * Add a breadcrumb for debugging.
 */
export function addBreadcrumb(
    category: string,
    message: string,
    data?: Record<string, unknown>
): void {
    if (!SENTRY_DSN) return;

    Sentry.addBreadcrumb({
        category,
        message,
        data,
        level: 'info',
    });
}

/**
 * Setup Sentry error handling for Express.
 * Call this AFTER all routes but BEFORE the custom error handler.
 * 
 * @param app - Express application instance
 */
export function setupSentryErrorHandler(app: import('express').Application): void {
    if (!SENTRY_DSN) return;
    Sentry.setupExpressErrorHandler(app);
}

/**
 * Sentry request handler middleware for Express.
 * In Sentry v10+, request isolation happens automatically.
 * This is a no-op middleware for compatibility.
 */
export const sentryRequestHandler: import('express').RequestHandler = (req, res, next) => {
    // Sentry v10+ handles request isolation automatically
    // This middleware is kept for API compatibility
    next();
};

/**
 * Flush pending Sentry events before function terminates.
 * Call this before returning from Firebase Functions.
 */
export async function flushSentry(timeout = 2000): Promise<void> {
    if (!SENTRY_DSN) return;
    await Sentry.flush(timeout);
}

// Re-export Sentry for direct access if needed
export { Sentry };
