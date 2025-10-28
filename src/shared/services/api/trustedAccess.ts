import apiClient from './client';

export interface TrustedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  profilePhoto?: string;
}

export interface TrustedAccess {
  id: string;
  grantingUserId: string;
  trustedUserId: string;
  accessLevel: 'VIEW_ONLY' | 'VIEW_AND_EDIT' | 'FULL_ACCESS';
  relationship: string;
  createdAt: string;
  revokedAt?: string;
  trustedUser?: TrustedUser;
  grantingUser?: TrustedUser;
}

export interface InviteTrustedUserPayload {
  trustedUserEmail: string;
  accessLevel: 'VIEW_ONLY' | 'VIEW_AND_EDIT' | 'FULL_ACCESS';
  relationship: string;
}

export interface UpdateTrustedAccessPayload {
  accessLevel: 'VIEW_ONLY' | 'VIEW_AND_EDIT' | 'FULL_ACCESS';
}

/**
 * List trusted users (caregivers I've granted access to)
 */
export const listTrustedUsers = async (): Promise<TrustedAccess[]> => {
  const { data } = await apiClient.get('/trusted-access/granted');
  return data.data;
};

/**
 * List users who have granted me access
 */
export const listGrantingUsers = async (): Promise<TrustedAccess[]> => {
  const { data } = await apiClient.get('/trusted-access/received');
  return data.data;
};

/**
 * Invite a trusted user (caregiver)
 */
export const inviteTrustedUser = async (payload: InviteTrustedUserPayload): Promise<TrustedAccess> => {
  const { data } = await apiClient.post('/trusted-access/invite', payload);
  return data.data;
};

/**
 * Update trusted access level
 */
export const updateTrustedAccess = async (
  id: string,
  payload: UpdateTrustedAccessPayload
): Promise<TrustedAccess> => {
  const { data } = await apiClient.put(`/trusted-access/${id}`, payload);
  return data.data;
};

/**
 * Revoke trusted access
 */
export const revokeTrustedAccess = async (id: string): Promise<void> => {
  await apiClient.delete(`/trusted-access/${id}`);
};

/**
 * Get all visits shared with me
 */
export const getSharedVisits = async (): Promise<any[]> => {
  const { data } = await apiClient.get('/trusted-access/shared-visits');
  return data.data;
};

/**
 * Check if I have access to another user's data
 */
export const checkAccess = async (
  targetUserId: string
): Promise<{ hasAccess: boolean; accessLevel?: string }> => {
  const { data } = await apiClient.get(`/trusted-access/check/${targetUserId}`);
  return data.data;
};
