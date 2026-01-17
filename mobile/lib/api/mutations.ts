import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './hooks';

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
      await queryClient.cancelQueries({ queryKey: queryKeys.actions });
      await queryClient.cancelQueries({ queryKey: [...queryKeys.actions, 'pending'] });

      const previousActions = queryClient.getQueryData<any[]>(queryKeys.actions);

      queryClient.setQueryData<any[]>(queryKeys.actions, (old) => {
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

      queryClient.setQueryData<any[]>([...queryKeys.actions, 'pending'], (old) => {
        if (!old) return old;
        return old.filter((action) => action.id !== variables.id);
      });

      return { previousActions };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousActions) {
        queryClient.setQueryData(queryKeys.actions, context.previousActions);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.actions, 'pending'] });
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

  return useMutation({
    mutationFn: async (payload: UpdateProfileInput) => {
      return api.user.updateProfile(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
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

  return useMutation({
    mutationFn: async (payload: AddCaregiverInput) => {
      return api.user.addCaregiver(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    },
  });
}

/**
 * Invite a caregiver using the new token-based invite system
 * Creates invite via /v1/shares/invite - backend handles email sending
 */
export function useInviteCaregiver() {
  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['share-invites'] });
    },
  });
}
