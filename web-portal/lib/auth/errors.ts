/**
 * Maps Firebase Auth error codes to user-friendly messages.
 */
export function getAuthErrorMessage(error: any): string {
  const code = error?.code;

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      // User cancelled — not an error to display
      return '';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with this email but using a different sign-in method. Try signing in with email/password or the method you originally used.';
    case 'auth/invalid-credential':
      return 'Invalid email or password. Please try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection and try again.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    default:
      return 'Unable to sign in. Please try again.';
  }
}
