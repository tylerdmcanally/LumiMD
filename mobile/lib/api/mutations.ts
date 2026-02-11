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
  const currentUserId = auth().currentUser?.uid;
  const actionsKey = [...queryKeys.actions, currentUserId ?? 'anonymous'] as const;

  return useMutation({
    mutationFn: async ({ id, completed }: ToggleActionInput) => {
      const payload: Record<string, unknown> = { completed };

      if (completed) {
        payload.completedAt = new Date().toISOString();
      }

      return api.actions.update(id, payload);
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: actionsKey });

      const previousActions = queryClient.getQueryData<any[]>(actionsKey);

      queryClient.setQueryData<any[]>(actionsKey, (old) => {
        if (!old) return old;
        return old.map((action) => {
          if (action.id !== variables.id) return action;
          if (variables.optimisticData) return variables.optimisticData;
          return {
            ...action,
            completed: variables.completed,
            completedAt: variables.completed ? new Date().toISOString() : null,
          };
        });
      });

      return { previousActions };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousActions) {
        queryClient.setQueryData(actionsKey, context.previousActions);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: actionsKey });
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
