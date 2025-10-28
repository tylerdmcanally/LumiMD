import apiClient from './client';
import type { Provider } from './providers';
import type { VisitFolder } from './folders';
import { getHealthProfile, formatHealthProfileForAI } from '@/shared/utils/healthProfile';

export interface Visit {
  id: string;
  userId: string;
  providerId: string;
  visitDate: string;
  visitType: string;
  status: string;
  transcription?: string;
  summary?: any;
  duration?: number;
  audioFileUrl?: string;
  provider?: Provider;
  folderId?: string | null;
  folder?: VisitFolder;
  tags?: string[];
}

export interface PaginatedVisits {
  visits: Visit[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface VisitSubmissionRequest {
  providerId?: string;
  visitDate?: string;
  visitType?: string;
  consent: {
    userConsented: boolean;
    additionalPartyConsented?: boolean;
    stateName?: string;
  };
  location?: {
    latitude: number;
    longitude: number;
  };
}

export const listVisits = async (page = 1, limit = 20, includeShared = false): Promise<PaginatedVisits> => {
  const { data } = await apiClient.get('/visits', {
    params: { page, limit, includeShared },
  });

  return data.data;
};

export const startVisit = async (payload: {
  providerId: string;
  visitDate: string;
  visitType: string;
}): Promise<Visit> => {
  const { data } = await apiClient.post('/visits/start', payload);
  return data.data;
};

const MIME_TYPES: Record<string, string> = {
  caf: 'audio/x-caf',
  m4a: 'audio/m4a',
  mp4: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
};

const inferMimeType = (uri: string): { mimeType: string; fileName: string } => {
  const cleanedUri = uri.split('?')[0];
  const parts = cleanedUri.split('.');
  const extension = parts.length > 1 ? parts.pop()!.toLowerCase() : 'm4a';
  const mimeType = MIME_TYPES[extension] ?? 'audio/m4a';
  const fileName = `visit-audio.${extension}`;

  return { mimeType, fileName };
};

export const submitVisitRecording = async (
  audioUri: string,
  payload: VisitSubmissionRequest
): Promise<Visit> => {
  // Load health profile and format for AI context
  const healthProfile = await getHealthProfile();
  const healthProfileContext = formatHealthProfileForAI(healthProfile);

  const formData = new FormData();
  const { mimeType, fileName } = inferMimeType(audioUri);
  const file: any = {
    uri: audioUri,
    type: mimeType,
    name: fileName,
  };

  formData.append('audio', file);
  formData.append('payload', JSON.stringify(payload));

  // Include health profile context if available
  if (healthProfileContext) {
    formData.append('healthProfileContext', healthProfileContext);
  }

  const { data } = await apiClient.post('/visits', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return data.data;
};

export const updateVisit = async (
  visitId: string,
  payload: Partial<{ providerId: string; visitDate: string; visitType: string; status: string }>
): Promise<Visit> => {
  const { data } = await apiClient.put(`/visits/${visitId}`, payload);
  return data.data;
};

export const getVisitSummary = async (visitId: string) => {
  const { data } = await apiClient.get(`/visits/${visitId}/summary`);
  return data.data;
};

export const getVisitTranscript = async (visitId: string) => {
  const { data } = await apiClient.get(`/visits/${visitId}/transcript`);
  return data.data;
};

export const getVisitById = async (visitId: string): Promise<Visit> => {
  const { data } = await apiClient.get(`/visits/${visitId}`);
  return data.data;
};

export const deleteVisit = async (visitId: string): Promise<void> => {
  await apiClient.delete(`/visits/${visitId}`);
};
