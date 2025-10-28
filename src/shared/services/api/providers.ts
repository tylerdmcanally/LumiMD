import apiClient from './client';

export interface Provider {
  id: string;
  userId: string;
  name: string;
  specialty: string;
  practice?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export const listProviders = async (): Promise<Provider[]> => {
  const { data } = await apiClient.get('/providers');
  return data.data;
};

export interface CreateProviderPayload {
  name: string;
  specialty: string;
  practice?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export const createProvider = async (payload: CreateProviderPayload): Promise<Provider> => {
  const { data } = await apiClient.post('/providers', payload);
  return data.data;
};
