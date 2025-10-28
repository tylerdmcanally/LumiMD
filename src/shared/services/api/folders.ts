import apiClient from './client';
import type { Visit } from './visits';

export interface VisitFolder {
  id: string;
  userId: string;
  name: string;
  color?: string;
  icon?: string;
  _count?: {
    visits: number;
  };
  visits?: Visit[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateFolderInput {
  name: string;
  color?: string;
  icon?: string;
}

export interface UpdateFolderInput {
  name?: string;
  color?: string;
  icon?: string;
}

export const createFolder = async (input: CreateFolderInput): Promise<VisitFolder> => {
  const { data } = await apiClient.post('/folders', input);
  return data.data;
};

export const listFolders = async (): Promise<VisitFolder[]> => {
  const { data } = await apiClient.get('/folders');
  return data.data;
};

export const getFolderById = async (folderId: string): Promise<VisitFolder> => {
  const { data } = await apiClient.get(`/folders/${folderId}`);
  return data.data;
};

export const updateFolder = async (
  folderId: string,
  input: UpdateFolderInput
): Promise<VisitFolder> => {
  const { data } = await apiClient.put(`/folders/${folderId}`, input);
  return data.data;
};

export const deleteFolder = async (folderId: string): Promise<void> => {
  await apiClient.delete(`/folders/${folderId}`);
};

export const moveVisitToFolder = async (
  visitId: string,
  folderId: string | null
): Promise<Visit> => {
  const { data } = await apiClient.put(`/visits/${visitId}/folder`, { folderId });
  return data.data;
};

export const addTagsToVisit = async (visitId: string, tags: string[]): Promise<Visit> => {
  const { data } = await apiClient.post(`/visits/${visitId}/tags`, { tags });
  return data.data;
};

export const removeTagFromVisit = async (visitId: string, tag: string): Promise<Visit> => {
  const { data } = await apiClient.delete(`/visits/${visitId}/tags/${encodeURIComponent(tag)}`);
  return data.data;
};

export const getUserTags = async (): Promise<string[]> => {
  const { data } = await apiClient.get('/tags');
  return data.data;
};
