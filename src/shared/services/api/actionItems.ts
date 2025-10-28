import apiClient from './client';

export type ActionItemType =
  | 'FOLLOW_UP_APPOINTMENT'
  | 'LAB_WORK'
  | 'IMAGING'
  | 'MEDICATION_START'
  | 'MEDICATION_CHANGE'
  | 'MEDICATION_STOP'
  | 'MEDICATION'
  | 'SPECIALIST_REFERRAL'
  | 'OTHER';

export interface ActionItem {
  id: string;
  userId: string;
  visitId: string | null;
  type: ActionItemType;
  description: string;
  dueDate: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  visit?: {
    id: string;
    visitDate: string;
    provider?: {
      id: string;
      name: string;
      specialty?: string;
    };
  } | null;
}

export interface CreateActionItemRequest {
  visitId?: string;
  type: ActionItemType;
  description: string;
  dueDate?: string;
}

export interface UpdateActionItemRequest {
  description?: string;
  dueDate?: string;
  completed?: boolean;
}

export interface ActionItemStatistics {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  upcoming: number;
}

/**
 * List all action items
 */
export const listActionItems = async (filters?: {
  completed?: boolean;
  upcoming?: boolean;
  overdue?: boolean;
}): Promise<ActionItem[]> => {
  const params = new URLSearchParams();
  if (filters?.completed !== undefined) {
    params.append('completed', String(filters.completed));
  }
  if (filters?.upcoming) {
    params.append('upcoming', 'true');
  }
  if (filters?.overdue) {
    params.append('overdue', 'true');
  }

  const response = await apiClient.get(`/action-items?${params.toString()}`);
  return response.data.data;
};

/**
 * Get action item by ID
 */
export const getActionItemById = async (id: string): Promise<ActionItem> => {
  const response = await apiClient.get(`/action-items/${id}`);
  return response.data.data;
};

/**
 * Create a new action item
 */
export const createActionItem = async (data: CreateActionItemRequest): Promise<ActionItem> => {
  const response = await apiClient.post('/action-items', data);
  return response.data.data;
};

/**
 * Update an action item
 */
export const updateActionItem = async (
  id: string,
  data: UpdateActionItemRequest
): Promise<ActionItem> => {
  const response = await apiClient.put(`/action-items/${id}`, data);
  return response.data.data;
};

/**
 * Mark action item as complete
 */
export const completeActionItem = async (id: string): Promise<ActionItem> => {
  const response = await apiClient.post(`/action-items/${id}/complete`);
  return response.data.data;
};

/**
 * Delete an action item
 */
export const deleteActionItem = async (id: string): Promise<void> => {
  await apiClient.delete(`/action-items/${id}`);
};

/**
 * Get action item statistics
 */
export const getActionItemStatistics = async (): Promise<ActionItemStatistics> => {
  const response = await apiClient.get('/action-items/statistics');
  return response.data.data;
};

