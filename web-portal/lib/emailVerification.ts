import { auth } from './firebase';

/**
 * Action code settings for email verification links
 * Tells Firebase where to redirect after email verification
 */
export const getEmailVerificationSettings = () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://lumimd.app';

    return {
        url: `${url}/sign-in`, // URL to redirect to after verification (sign-in page)
        handleCodeInApp: false, // Don't handle in app, user clicks link in email
    };
};
