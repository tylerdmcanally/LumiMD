'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';

export default function AuthHandoffPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const returnTo = params.get('returnTo') || '/dashboard';
    
    if (!code) {
      router.push('/sign-in?error=missing_code');
      return;
    }
    
    handleHandoff(code, returnTo);
  }, [router]);
  
  async function handleHandoff(code: string, returnTo: string) {
    try {
      setError(null);
      
      // Exchange code for custom token
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://us-central1-lumimd-dev.cloudfunctions.net/api';
      console.log('[handoff] Code received:', code?.substring(0, 10) + '...');
      console.log('[handoff] Using API URL:', apiBaseUrl);
      
      const response = await fetch(`${apiBaseUrl}/v1/auth/exchange-handoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      });
      
      console.log('[handoff] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[handoff] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        throw new Error(errorData.message || 'Failed to authenticate');
      }
      
      const { token } = await response.json();
      console.log('[handoff] Got token, signing in...');
      
      // Sign in with custom token
      await signInWithCustomToken(auth, token);
      
      console.log('[handoff] Successfully authenticated, redirecting to:', returnTo);
      
      // Redirect to intended destination
      router.push(returnTo);
      
    } catch (err) {
      console.error('[handoff] Authentication failed:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      
      // Redirect to sign-in after delay
      setTimeout(() => {
        router.push('/sign-in?error=handoff_failed');
      }, 3000);
    }
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Authentication Failed
          </h1>
          <p className="text-gray-600 mb-4">
            {error}
          </p>
          <p className="text-sm text-gray-500">
            Redirecting to sign in...
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        {/* Loading spinner */}
        <div className="relative w-16 h-16 mx-auto mb-4">
          <div className="absolute inset-0 border-4 border-blue-200 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
        </div>
        
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Signing you in...
        </h1>
        <p className="text-gray-600">
          Please wait a moment
        </p>
      </div>
    </div>
  );
}


