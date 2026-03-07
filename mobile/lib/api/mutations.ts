import { useMutation, useQueryClient } from '@tanstack/react-query';
import auth from '@react-native-firebase/auth';
import { api } from './client';
import { queryKeys, sharesKey, shareInvitesKey } from './hooks';

interface ToggleActionInput {
  id: string;
  completed: boolean;
  optimisticData?: any;
}

export function useCompleteAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, completed }: ToggleActionInput) => {
      const payload: Record<string, unknown> = { completed };

      if (completed) {
        payload.completedAt = new Date().toISOString();
      }

      return api.actions.update(id, payload);
    },
    onMutate: async (variables) => {
      // Cancel all action queries (paginated, fallback, etc.)
      await queryClient.cancelQueries({ queryKey: queryKeys.actions });
    },
    onSettled: () => {
      // Invalidate ALL action-related queries so both tabs refresh.
      // Using the base key ['actions'] matches all variants:
      //   ['actions', 'cursor', sessionKey, pageSize]  (paginated)
      //   ['fallback', 'actions', ...]                  (fallback)
      queryClient.invalidateQueries({ queryKey: queryKeys.actions });
      queryClient.invalidateQueries({ queryKey: ['fallback', 'actions'] });
    },
  });
}

interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  allergies?: string[];
  medicalHistory?: string[];
  complete?: boolean;
  [key: string]: unknown;
}


export function useUpdateUserProfile() {
  const queryClient = useQueryClient();
  const profileKey = [...queryKeys.profile, auth().currentUser?.uid ?? 'anonymous'] as const;

  return useMutation({
    mutationFn: async (payload: UpdateProfileInput) => {
      return api.user.updateProfile(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}

interface AddCaregiverInput {
  name: string;
  email: string;
  relationship?: string;
}

export function useAddCaregiver() {
  const queryClient = useQueryClient();
  const profileKey = [...queryKeys.profile, auth().currentUser?.uid ?? 'anonymous'] as const;

  return useMutation({
    mutationFn: async (payload: AddCaregiverInput) => {
      return api.user.addCaregiver(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
    },
  });
}

/**
 * Invite a caregiver using the new token-based invite system
 * Creates invite via /v1/shares/invite - backend handles email sending
 */
export function useInviteCaregiver() {
  const queryClient = useQueryClient();
  const currentUserId = auth().currentUser?.uid;
  const userSharesKey = sharesKey(currentUserId);
  const userShareInvitesKey = shareInvitesKey(currentUserId);

  return useMutation({
    mutationFn: async (payload: { caregiverEmail: string; message?: string }) => {
      // Create the invite - backend handles email sending
      const invite = await api.shares.invite(payload);

      if (invite.emailSent) {
        console.log('[useInviteCaregiver] Invite created and email sent successfully');
      } else {
        console.warn('[useInviteCaregiver] Invite created but email was not sent');
      }

      return invite;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userSharesKey });
      queryClient.invalidateQueries({ queryKey: userShareInvitesKey });
    },
  });
}
