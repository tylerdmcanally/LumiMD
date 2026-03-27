import { useMutation, useQueryClient } from '@tanstack/react-query';
import auth from '@react-native-firebase/auth';
import { api } from './client';
import { queryKeys, sharesKey, shareInvitesKey } from './hooks';
import type { Medication, ActionItem } from '@lumimd/sdk';

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
    onMutate: async (payload) => {
      // Optimistically update profile cache so navigation guards see the new
      // values immediately (e.g. complete: true prevents onboarding re-trigger).
      await queryClient.cancelQueries({ queryKey: profileKey });
      const previousProfile = queryClient.getQueryData(profileKey);
      queryClient.setQueryData(profileKey, (old: any) => ({
        ...old,
        ...payload,
      }));
      return { previousProfile };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: profileKey });
    },
    onError: (_err, _payload, context) => {
      // Rollback optimistic update on failure
      if (context?.previousProfile) {
        queryClient.setQueryData(profileKey, context.previousProfile);
      }
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
        if (__DEV__) console.log('[useInviteCaregiver] Invite created and email sent successfully');
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

// ── Medication CRUD ──

interface CreateMedicationInput {
  name: string;
  dose?: string;
  frequency?: string;
  status?: string;
  source?: 'manual' | 'visit';
}

export function useCreateMedication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateMedicationInput) => {
      return api.medications.create({
        ...data,
        active: true,
        source: data.source ?? 'manual',
      } as Partial<Medication>);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.medications });
      queryClient.invalidateQueries({ queryKey: ['fallback', 'medications'] });
    },
  });
}

interface UpdateMedicationInput {
  id: string;
  data: Partial<Medication>;
}

export function useUpdateMedication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: UpdateMedicationInput) => {
      return api.medications.update(id, data);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.medications });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.medications });
      queryClient.invalidateQueries({ queryKey: ['fallback', 'medications'] });
    },
  });
}

export function useDeleteMedication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return api.medications.delete(id);
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.medications });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.medications });
      queryClient.invalidateQueries({ queryKey: ['fallback', 'medications'] });
    },
  });
}

// ── Action Item CRUD ──

interface CreateActionInput {
  description: string;
  dueAt?: string;
  type?: string;
  source?: 'manual' | 'visit';
}

export function useCreateAction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateActionInput) => {
      return api.actions.create({
        ...data,
        completed: false,
        source: data.source ?? 'manual',
      } as Partial<ActionItem>);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.actions });
      queryClient.invalidateQueries({ queryKey: ['fallback', 'actions'] });
    },
  });
}
