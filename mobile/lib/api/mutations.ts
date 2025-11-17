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



