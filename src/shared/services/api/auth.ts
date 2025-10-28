import apiClient from './client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  phone?: string;
  profilePhoto?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export const login = async (email: string, password: string): Promise<LoginResponse> => {
  const { data } = await apiClient.post('/auth/login', { email, password });

  return {
    user: data.data.user,
    tokens: {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
    },
  };
};

export interface RegisterPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  phone?: string;
  invitationPin?: string;
}

export const register = async (payload: RegisterPayload): Promise<LoginResponse> => {
  const { data } = await apiClient.post('/auth/register', payload);

  return {
    user: data.data.user,
    tokens: {
      accessToken: data.data.accessToken,
      refreshToken: data.data.refreshToken,
    },
  };
};

export const refreshAccessToken = async (refreshToken: string): Promise<AuthTokens> => {
  const { data } = await apiClient.post('/auth/refresh', { refreshToken });

  return {
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken,
  };
};

export const logout = async () => {
  await apiClient.post('/auth/logout');
};
