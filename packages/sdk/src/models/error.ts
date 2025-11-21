/**
 * API Error Model
 */

export interface ApiError extends Error {
  status?: number;
  code?: string;
  userMessage?: string;
  details?: unknown;
  body?: unknown;
  retriable?: boolean;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && 'status' in error;
}

