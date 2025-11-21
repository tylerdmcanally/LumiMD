/**
 * React Query Hooks for Mobile
 * Re-exports shared SDK hooks
 */

import { createApiHooks, queryKeys } from '@lumimd/sdk';
import { api } from './client';

// Create hooks using the mobile API client
const hooks = createApiHooks(api);

// Export all hooks
export const {
  useVisits,
  useVisit,
  useLatestVisit,
  useActionItems,
  usePendingActions,
  useMedications,
  useActiveMedications,
  useUserProfile,
} = hooks;

// Export query keys for cache management
export { queryKeys };

// Export types
export type {
  Visit,
  Medication,
  ActionItem,
  UserProfile,
} from '@lumimd/sdk';
