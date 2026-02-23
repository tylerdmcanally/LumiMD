'use client';

import { useEffect, useState } from 'react';
import type { IdTokenResult } from 'firebase/auth';
import { useCurrentUser } from './useCurrentUser';

const claimFlagIsTrue = (value: unknown): boolean =>
  value === true || value === 'true' || value === 1;

const getOperatorAllowlist = (): Set<string> =>
  new Set(
    (process.env.NEXT_PUBLIC_OPERATOR_UIDS ?? '')
      .split(',')
      .map((rawUid) => rawUid.trim())
      .filter((rawUid) => rawUid.length > 0),
  );

const hasOperatorClaims = (tokenResult: IdTokenResult): boolean => {
  const claims = tokenResult.claims as Record<string, unknown>;
  const claimRoles = Array.isArray(claims.roles)
    ? claims.roles
      .filter((role): role is string => typeof role === 'string')
      .map((role) => role.trim().toLowerCase())
    : [];

  return (
    claimFlagIsTrue(claims.operator) ||
    claimFlagIsTrue(claims.admin) ||
    claimFlagIsTrue(claims.support) ||
    claimRoles.includes('operator') ||
    claimRoles.includes('admin') ||
    claimRoles.includes('support')
  );
};

export function useOperatorAccess(): { isOperator: boolean; isLoading: boolean } {
  const user = useCurrentUser();
  const [isOperator, setIsOperator] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const evaluateAccess = async () => {
      if (!user) {
        if (!cancelled) {
          setIsOperator(false);
          setIsLoading(false);
        }
        return;
      }

      try {
        const tokenResult = await user.getIdTokenResult();
        const claimAccess = hasOperatorClaims(tokenResult);
        const allowlistAccess = getOperatorAllowlist().has(user.uid);
        if (!cancelled) {
          setIsOperator(claimAccess || allowlistAccess);
        }
      } catch (error) {
        console.error('[useOperatorAccess] Failed to evaluate operator access', error);
        if (!cancelled) {
          setIsOperator(false);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    setIsLoading(true);
    void evaluateAccess();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  return { isOperator, isLoading };
}
