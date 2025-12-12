import { auth } from './firebase';

/**
 * Action code settings for email verification links
 * Tells Firebase where to redirect after email verification
 */
export const getEmailVerificationSettings = () => {
    const url = typeof window !== 'undefined' ? window.location.origin : 'https://lumimd.app';

    return {
        url: `${url}/dashboard`, // URL to redirect to after verification
        handleCodeInApp: false, // Don't handle in app, use link
    };
};
