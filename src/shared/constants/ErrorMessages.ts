/**
 * Error Messages Constants
 * Centralized error messages for user-facing errors
 */

export interface ErrorMessage {
  code: string;
  message: string;
  title?: string;
}

export const ERROR_MESSAGES = {
  // Permission errors
  PERMISSION_MICROPHONE: {
    code: 'PERMISSION_MICROPHONE',
    title: 'Microphone Permission Required',
    message: 'Please grant microphone permission to record your visit.',
  },
  PERMISSION_LOCATION: {
    code: 'PERMISSION_LOCATION',
    title: 'Location Permission Required',
    message: 'Please grant location permission to find nearby providers.',
  },
  PERMISSION_CAMERA: {
    code: 'PERMISSION_CAMERA',
    title: 'Camera Permission Required',
    message: 'Please grant camera permission to scan documents.',
  },

  // Recording errors
  RECORDING_FAILED: {
    code: 'RECORDING_FAILED',
    title: 'Recording Failed',
    message: 'Failed to start recording. Please try again.',
  },
  RECORDING_STOP_FAILED: {
    code: 'RECORDING_STOP_FAILED',
    title: 'Recording Error',
    message: 'Failed to stop recording. Please try again.',
  },
  RECORDING_TOO_SHORT: {
    code: 'RECORDING_TOO_SHORT',
    title: 'Recording Too Short',
    message: 'Recording must be at least 5 seconds long.',
  },

  // Upload errors
  UPLOAD_FAILED: {
    code: 'UPLOAD_FAILED',
    title: 'Upload Failed',
    message: 'Failed to upload your recording. Please check your connection and try again.',
  },
  UPLOAD_NETWORK: {
    code: 'UPLOAD_NETWORK',
    title: 'Network Error',
    message: 'Network connection error. Please check your internet connection and try again.',
  },
  UPLOAD_TIMEOUT: {
    code: 'UPLOAD_TIMEOUT',
    title: 'Upload Timeout',
    message: 'Upload took too long. Please try again with a better connection.',
  },

  // Processing errors
  PROCESSING_FAILED: {
    code: 'PROCESSING_FAILED',
    title: 'Processing Failed',
    message: 'Failed to process your visit. Our team has been notified.',
  },
  TRANSCRIPTION_FAILED: {
    code: 'TRANSCRIPTION_FAILED',
    title: 'Transcription Failed',
    message: 'Failed to transcribe your recording. Please try recording again.',
  },
  SUMMARY_FAILED: {
    code: 'SUMMARY_FAILED',
    title: 'Summary Generation Failed',
    message: 'Failed to generate visit summary. Please try again later.',
  },

  // Authentication errors
  AUTH_REQUIRED: {
    code: 'AUTH_REQUIRED',
    title: 'Authentication Required',
    message: 'Please log in to continue.',
  },
  AUTH_EXPIRED: {
    code: 'AUTH_EXPIRED',
    title: 'Session Expired',
    message: 'Your session has expired. Please log in again.',
  },
  AUTH_INVALID: {
    code: 'AUTH_INVALID',
    title: 'Invalid Credentials',
    message: 'Invalid email or password. Please try again.',
  },

  // Network errors
  NETWORK_ERROR: {
    code: 'NETWORK_ERROR',
    title: 'Network Error',
    message: 'Unable to connect to the server. Please check your internet connection.',
  },
  SERVER_ERROR: {
    code: 'SERVER_ERROR',
    title: 'Server Error',
    message: 'Something went wrong on our end. Please try again later.',
  },
  TIMEOUT_ERROR: {
    code: 'TIMEOUT_ERROR',
    title: 'Request Timeout',
    message: 'The request took too long. Please try again.',
  },

  // Validation errors
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    title: 'Validation Error',
    message: 'Please check your input and try again.',
  },
  INVALID_INPUT: {
    code: 'INVALID_INPUT',
    title: 'Invalid Input',
    message: 'Please provide valid information.',
  },

  // Data errors
  NOT_FOUND: {
    code: 'NOT_FOUND',
    title: 'Not Found',
    message: 'The requested item was not found.',
  },
  ALREADY_EXISTS: {
    code: 'ALREADY_EXISTS',
    title: 'Already Exists',
    message: 'This item already exists.',
  },

  // Storage errors
  STORAGE_FULL: {
    code: 'STORAGE_FULL',
    title: 'Storage Full',
    message: 'Your device storage is full. Please free up some space.',
  },
  STORAGE_ERROR: {
    code: 'STORAGE_ERROR',
    title: 'Storage Error',
    message: 'Failed to save data locally. Please try again.',
  },

  // Provider errors
  PROVIDER_NOT_FOUND: {
    code: 'PROVIDER_NOT_FOUND',
    title: 'Provider Not Found',
    message: 'The selected provider was not found.',
  },
  PROVIDER_CREATE_FAILED: {
    code: 'PROVIDER_CREATE_FAILED',
    title: 'Failed to Create Provider',
    message: 'Failed to create provider. Please try again.',
  },

  // Visit errors
  VISIT_NOT_FOUND: {
    code: 'VISIT_NOT_FOUND',
    title: 'Visit Not Found',
    message: 'The requested visit was not found.',
  },
  VISIT_CREATE_FAILED: {
    code: 'VISIT_CREATE_FAILED',
    title: 'Failed to Create Visit',
    message: 'Failed to create visit. Please try again.',
  },
  VISIT_UPDATE_FAILED: {
    code: 'VISIT_UPDATE_FAILED',
    title: 'Failed to Update Visit',
    message: 'Failed to update visit. Please try again.',
  },
  VISIT_DELETE_FAILED: {
    code: 'VISIT_DELETE_FAILED',
    title: 'Failed to Delete Visit',
    message: 'Failed to delete visit. Please try again.',
  },

  // Generic errors
  UNKNOWN_ERROR: {
    code: 'UNKNOWN_ERROR',
    title: 'Error',
    message: 'An unexpected error occurred. Please try again.',
  },
} as const;

/**
 * Helper function to get error message by code
 */
export function getErrorMessage(code: string): ErrorMessage {
  const errorKey = Object.keys(ERROR_MESSAGES).find(
    (key) => ERROR_MESSAGES[key as keyof typeof ERROR_MESSAGES].code === code
  );

  if (errorKey) {
    return ERROR_MESSAGES[errorKey as keyof typeof ERROR_MESSAGES];
  }

  return ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Helper function to format error for display
 */
export function formatError(error: any): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error?.message) {
    return error.message;
  }

  if (error?.response?.data?.message) {
    return error.response.data.message;
  }

  return ERROR_MESSAGES.UNKNOWN_ERROR.message;
}
