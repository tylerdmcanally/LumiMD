import axios from 'axios';
import Constants from 'expo-constants';

import { ENV } from '@/shared/config/env';

interface TokenBundle {
  accessToken: string;
  refreshToken: string;
}

const DEFAULT_BASE_URL = 'http://localhost:3000/api';

const resolveApiBaseUrl = () => {
  if (ENV.API_BASE_URL) {
    return `${ENV.API_BASE_URL.replace(/\/$/, '')}/api`;
  }

  if (__DEV__) {
    const host =
      Constants.expoConfig?.hostUri?.split(':')[0] ??
      Constants.expoGoConfig?.debuggerHost?.split(':')[0];

    if (host) {
      return `http://${host}:3000/api`;
    }
  }

  return DEFAULT_BASE_URL;
};

const apiBaseURL = resolveApiBaseUrl();

const apiClient = axios.create({
  baseURL: apiBaseURL,
  // Allow extra time in dev to handle cold starts on hosted backends (e.g. Render free tier).
  timeout: __DEV__ ? 45000 : 20000,
});

let tokens: TokenBundle | null = null;
let refreshHandler: (() => Promise<TokenBundle | null>) | null = null;
let refreshPromise: Promise<TokenBundle | null> | null = null;

export const updateAuthTokens = (next: TokenBundle | null) => {
  tokens = next;
};

export const registerTokenRefresh = (handler: (() => Promise<TokenBundle | null>) | null) => {
  refreshHandler = handler;
};

type RetryConfig = {
  _retry?: boolean;
};

apiClient.interceptors.request.use((config) => {
  if (tokens?.accessToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${tokens.accessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryConfig & typeof error.config;

    if (error.response?.status === 401 && !originalRequest?._retry && refreshHandler) {
      originalRequest._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshHandler();
      }

      const refreshed = await refreshPromise.catch(() => null);
      refreshPromise = null;

      if (refreshed) {
        updateAuthTokens(refreshed);
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
        return apiClient(originalRequest);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
