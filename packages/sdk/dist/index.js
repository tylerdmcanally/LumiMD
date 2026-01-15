'use strict';

var reactQuery = require('@tanstack/react-query');
var react = require('react');

// src/models/error.ts
function isApiError(error) {
  return error instanceof Error && "status" in error;
}

// src/api-client.ts
var DEFAULT_TIMEOUT_MS = 2e4;
var RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 425, 500, 502, 503, 504]);
var NETWORK_ERROR_MESSAGE = "We couldn't reach LumiMD right now. Please check your connection and try again.";
var SERVER_ERROR_MESSAGE = "We ran into an issue on our end. Please try again in a moment.";
var UNAUTHORIZED_MESSAGE = "Your session expired. Please sign in again.";
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function normalizeHeaders(headersInit) {
  if (!headersInit) return {};
  if (headersInit instanceof Headers) {
    const result = {};
    headersInit.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headersInit)) {
    return headersInit.reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }
  return { ...headersInit };
}
function mapUserMessage(status, fallbackMessage) {
  if (status === 401 || status === 403) return UNAUTHORIZED_MESSAGE;
  if (status === 404) return "We couldn't find what you were looking for.";
  if (status === 429) {
    return "You're doing that a little too quickly. Please wait a moment and try again.";
  }
  if (status >= 500) return SERVER_ERROR_MESSAGE;
  return fallbackMessage;
}
async function buildApiError(response) {
  let parsedBody = null;
  let rawBody = null;
  try {
    rawBody = await response.text();
    if (rawBody) {
      parsedBody = JSON.parse(rawBody);
    }
  } catch {
    parsedBody = null;
  }
  const code = parsedBody?.code ?? parsedBody?.error?.code ?? parsedBody?.error_code ?? void 0;
  const message = parsedBody?.message ?? parsedBody?.error?.message ?? response.statusText ?? "Request failed";
  const error = new Error(message);
  error.status = response.status;
  error.code = code;
  error.details = parsedBody?.details ?? parsedBody?.error?.details;
  error.body = parsedBody ?? rawBody ?? null;
  error.userMessage = parsedBody?.userMessage ?? parsedBody?.error?.userMessage ?? mapUserMessage(response.status, message);
  error.retriable = RETRYABLE_STATUS_CODES.has(response.status) || response.status >= 500 && response.status < 600;
  console.error("[API] HTTP Error", {
    status: response.status,
    code,
    message,
    body: error.body
  });
  return error;
}
function buildNetworkError(original) {
  if (original instanceof Error && original.name === "AbortError") {
    const error2 = new Error("Request timed out");
    error2.code = "timeout";
    error2.userMessage = NETWORK_ERROR_MESSAGE;
    error2.retriable = true;
    return error2;
  }
  const message = original instanceof Error ? original.message : "Network request failed";
  const error = new Error(message);
  error.code = "network_error";
  error.userMessage = NETWORK_ERROR_MESSAGE;
  error.retriable = true;
  return error;
}
function buildParseError(original) {
  const error = new Error(
    "Failed to process the server response. Please try again."
  );
  error.code = "parse_error";
  error.userMessage = "We received an unexpected response from the server. Please try again.";
  error.details = original;
  error.retriable = true;
  return error;
}
function isRetryable(error, method) {
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    return Boolean(error.retriable && error.code !== "timeout");
  }
  if (error.retriable) return true;
  if (typeof error.status === "number") {
    return RETRYABLE_STATUS_CODES.has(error.status) || error.status >= 500 && error.status < 600;
  }
  return error.code === "network_error" || error.code === "timeout";
}
async function fetchWithTimeout(url, options, timeoutMs) {
  if (options.signal) {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
function createApiClient(config) {
  const { baseUrl, getAuthToken, enableLogging = false } = config;
  async function apiRequest(endpoint, options = {}) {
    const {
      requireAuth = true,
      timeoutMs = DEFAULT_TIMEOUT_MS,
      retry: retryOption,
      headers: providedHeaders,
      ...restOptions
    } = options;
    const method = (restOptions.method ?? "GET").toString().toUpperCase();
    const headers = normalizeHeaders(providedHeaders);
    if (!headers["Content-Type"] && restOptions.body) {
      headers["Content-Type"] = "application/json";
    }
    if (requireAuth) {
      const token = await getAuthToken();
      if (!token) {
        const error = new Error("Authentication required");
        error.code = "auth_required";
        error.userMessage = UNAUTHORIZED_MESSAGE;
        error.status = 401;
        throw error;
      }
      headers["Authorization"] = `Bearer ${token}`;
    }
    const url = `${baseUrl}${endpoint}`;
    const maxRetries = retryOption ?? (["GET", "HEAD", "OPTIONS"].includes(method) ? 2 : 0);
    let attempt = 0;
    let lastError;
    while (attempt <= maxRetries) {
      const requestInit = {
        ...restOptions,
        method,
        headers
      };
      try {
        if (enableLogging) {
          console.log(`[API] ${method} ${url} (attempt ${attempt + 1})`);
        }
        const response = await fetchWithTimeout(url, requestInit, timeoutMs);
        if (!response.ok) {
          const error = await buildApiError(response);
          if (attempt < maxRetries && isRetryable(error, method)) {
            lastError = error;
            attempt += 1;
            await sleep(250 * attempt);
            continue;
          }
          throw error;
        }
        if (response.status === 204) {
          return void 0;
        }
        const rawBody = await response.text();
        if (!rawBody) {
          return void 0;
        }
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          return rawBody;
        }
        try {
          return JSON.parse(rawBody);
        } catch (parseError) {
          const error = buildParseError(parseError);
          if (attempt < maxRetries && isRetryable(error, method)) {
            lastError = error;
            attempt += 1;
            await sleep(250 * attempt);
            continue;
          }
          throw error;
        }
      } catch (err) {
        const error = err?.userMessage || err?.status !== void 0 ? err : buildNetworkError(err);
        if (attempt < maxRetries && isRetryable(error, method)) {
          lastError = error;
          attempt += 1;
          await sleep(250 * attempt);
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new Error("Request failed unexpectedly");
  }
  return {
    // Health check
    health: () => apiRequest("/health", { requireAuth: false }),
    // Visits
    visits: {
      list: (params) => {
        if (params) {
          const searchParams = new URLSearchParams();
          Object.entries(params).forEach(([k, v]) => {
            searchParams.append(k, String(v));
          });
          return apiRequest(`/v1/visits?${searchParams.toString()}`);
        }
        return apiRequest("/v1/visits");
      },
      get: (id) => apiRequest(`/v1/visits/${id}`),
      create: (data) => apiRequest("/v1/visits", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      update: (id, data) => apiRequest(`/v1/visits/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
      delete: (id) => apiRequest(`/v1/visits/${id}`, {
        method: "DELETE"
      }),
      retry: (id) => apiRequest(`/v1/visits/${id}/retry`, {
        method: "POST"
      })
    },
    // Action Items
    actions: {
      list: () => apiRequest("/v1/actions"),
      get: (id) => apiRequest(`/v1/actions/${id}`),
      create: (data) => apiRequest("/v1/actions", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      update: (id, data) => apiRequest(`/v1/actions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
      delete: (id) => apiRequest(`/v1/actions/${id}`, {
        method: "DELETE"
      })
    },
    // Medications
    medications: {
      list: () => apiRequest("/v1/meds"),
      get: (id) => apiRequest(`/v1/meds/${id}`),
      create: (data) => apiRequest("/v1/meds", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      update: (id, data) => apiRequest(`/v1/meds/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
      delete: (id) => apiRequest(`/v1/meds/${id}`, {
        method: "DELETE"
      })
    },
    // User Profile
    user: {
      getProfile: () => apiRequest("/v1/users/me"),
      updateProfile: (data) => apiRequest("/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
      registerPushToken: (data) => apiRequest("/v1/users/push-tokens", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      unregisterPushToken: (data) => apiRequest("/v1/users/push-tokens", {
        method: "DELETE",
        body: JSON.stringify(data)
      }),
      exportData: () => apiRequest("/v1/users/me/export", {
        method: "GET"
      }),
      deleteAccount: () => apiRequest("/v1/users/me", {
        method: "DELETE"
      }),
      // Caregiver management
      listCaregivers: () => apiRequest("/v1/users/me/caregivers"),
      addCaregiver: (data) => apiRequest("/v1/users/me/caregivers", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      updateCaregiver: (id, data) => apiRequest(`/v1/users/me/caregivers/${id}`, {
        method: "PUT",
        body: JSON.stringify(data)
      }),
      deleteCaregiver: (id) => apiRequest(`/v1/users/me/caregivers/${id}`, {
        method: "DELETE"
      })
    },
    // Shares
    shares: {
      list: () => apiRequest("/v1/shares"),
      get: (id) => apiRequest(`/v1/shares/${id}`),
      create: (data) => apiRequest("/v1/shares", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      update: (id, data) => apiRequest(`/v1/shares/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
      // Legacy accept-invite endpoint
      acceptInvite: (token) => apiRequest("/v1/shares/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token })
      }),
      getInvites: () => apiRequest("/v1/shares/invites"),
      cancelInvite: (inviteId) => apiRequest(`/v1/shares/invites/${inviteId}`, {
        method: "PATCH"
      }),
      // NEW: Token-based invite system
      invite: (data) => apiRequest("/v1/shares/invite", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      acceptToken: (token) => apiRequest(`/v1/shares/accept/${token}`, {
        method: "POST"
      }),
      myInvites: () => apiRequest("/v1/shares/my-invites"),
      revokeInvite: (token) => apiRequest(`/v1/shares/revoke/${token}`, {
        method: "PATCH"
      })
    },
    // LumiBot Nudges
    nudges: {
      list: () => apiRequest("/v1/nudges"),
      history: (limit) => apiRequest(`/v1/nudges/history${limit ? `?limit=${limit}` : ""}`),
      update: (id, data) => apiRequest(`/v1/nudges/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data)
      }),
      respond: (id, data) => apiRequest(`/v1/nudges/${id}/respond`, {
        method: "POST",
        body: JSON.stringify(data)
      })
    },
    // LumiBot Health Logs
    healthLogs: {
      list: (params) => {
        const searchParams = new URLSearchParams();
        if (params?.type) searchParams.append("type", params.type);
        if (params?.limit) searchParams.append("limit", String(params.limit));
        if (params?.startDate) searchParams.append("startDate", params.startDate);
        if (params?.endDate) searchParams.append("endDate", params.endDate);
        const query = searchParams.toString();
        return apiRequest(`/v1/health-logs${query ? `?${query}` : ""}`);
      },
      create: (data) => apiRequest("/v1/health-logs", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      delete: (id) => apiRequest(`/v1/health-logs/${id}`, {
        method: "DELETE"
      }),
      summary: (days) => apiRequest(`/v1/health-logs/summary${days ? `?days=${days}` : ""}`),
      export: (days) => apiRequest(`/v1/health-logs/export${days ? `?days=${days}` : ""}`),
      providerReport: async () => {
        const token = await config.getAuthToken();
        const response = await fetch(`${config.baseUrl}/v1/health-logs/provider-report`, {
          method: "GET",
          headers: {
            ...token ? { Authorization: `Bearer ${token}` } : {}
          }
        });
        if (!response.ok) {
          throw new Error("Failed to generate provider report");
        }
        return response.blob();
      }
    },
    medicationReminders: {
      list: () => apiRequest("/v1/medication-reminders"),
      create: (data) => apiRequest("/v1/medication-reminders", {
        method: "POST",
        body: JSON.stringify(data)
      }),
      update: (id, data) => apiRequest(`/v1/medication-reminders/${id}`, {
        method: "PUT",
        body: JSON.stringify(data)
      }),
      delete: (id) => apiRequest(`/v1/medication-reminders/${id}`, {
        method: "DELETE"
      })
    }
  };
}
var queryKeys = {
  visits: ["visits"],
  visit: (id) => ["visits", id],
  actions: ["actions"],
  action: (id) => ["actions", id],
  medications: ["medications"],
  medication: (id) => ["medications", id],
  profile: ["profile"],
  nudges: ["nudges"],
  healthLogs: ["healthLogs"],
  healthLogsSummary: ["healthLogs", "summary"]
};
function createApiHooks(api) {
  function useVisits(options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.visits,
      queryFn: () => api.visits.list(),
      staleTime: 5 * 60 * 1e3,
      // 5 minutes
      ...options
    });
  }
  function useVisit(id, options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.visit(id),
      queryFn: () => api.visits.get(id),
      enabled: !!id,
      staleTime: 5 * 60 * 1e3,
      ...options
    });
  }
  function useLatestVisit(options) {
    return reactQuery.useQuery({
      queryKey: [...queryKeys.visits, "latest"],
      queryFn: async () => {
        const visits = await api.visits.list({ limit: 1, sort: "desc" });
        return visits.length > 0 ? visits[0] : null;
      },
      staleTime: 2 * 60 * 1e3,
      // 2 minutes
      ...options
    });
  }
  function useActionItems(options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.actions,
      queryFn: () => api.actions.list(),
      staleTime: 5 * 60 * 1e3,
      ...options
    });
  }
  function usePendingActions(options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.actions,
      queryFn: () => api.actions.list(),
      select: (actions) => actions.filter((action) => !action.completed),
      staleTime: 30 * 1e3,
      // 30 seconds
      ...options
    });
  }
  function useMedications(options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.medications,
      queryFn: () => api.medications.list(),
      staleTime: 60 * 1e3,
      // 1 minute
      ...options
    });
  }
  function useActiveMedications(options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.medications,
      queryFn: () => api.medications.list(),
      select: (meds) => meds.filter((med) => med.active !== false),
      staleTime: 60 * 1e3,
      // 1 minute
      ...options
    });
  }
  function useUserProfile(options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.profile,
      queryFn: () => api.user.getProfile(),
      staleTime: 5 * 60 * 1e3,
      ...options
    });
  }
  function useNudges(options) {
    return reactQuery.useQuery({
      queryKey: queryKeys.nudges,
      queryFn: () => api.nudges.list(),
      staleTime: 30 * 1e3,
      // 30 seconds
      ...options
    });
  }
  function useHealthLogs(params, options) {
    return reactQuery.useQuery({
      queryKey: [...queryKeys.healthLogs, params],
      queryFn: () => api.healthLogs.list(params),
      staleTime: 60 * 1e3,
      // 1 minute
      ...options
    });
  }
  function useHealthLogsSummary(days, options) {
    return reactQuery.useQuery({
      queryKey: [...queryKeys.healthLogsSummary, days],
      queryFn: () => api.healthLogs.summary(days),
      staleTime: 5 * 60 * 1e3,
      // 5 minutes
      ...options
    });
  }
  function useUpdateNudge() {
    const queryClient = reactQuery.useQueryClient();
    return reactQuery.useMutation({
      mutationFn: ({ id, data }) => api.nudges.update(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.nudges });
      }
    });
  }
  function useRespondToNudge() {
    const queryClient = reactQuery.useQueryClient();
    return reactQuery.useMutation({
      mutationFn: ({ id, data }) => api.nudges.respond(id, data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.nudges });
      }
    });
  }
  function useCreateHealthLog() {
    const queryClient = reactQuery.useQueryClient();
    return reactQuery.useMutation({
      mutationFn: (data) => api.healthLogs.create(data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.healthLogs });
        queryClient.invalidateQueries({ queryKey: queryKeys.nudges });
      }
    });
  }
  return {
    useVisits,
    useVisit,
    useLatestVisit,
    useActionItems,
    usePendingActions,
    useMedications,
    useActiveMedications,
    useUserProfile,
    // LumiBot
    useNudges,
    useHealthLogs,
    useHealthLogsSummary,
    useUpdateNudge,
    useRespondToNudge,
    useCreateHealthLog
  };
}
var firestoreModule = null;
function configureFirestoreRealtime(module) {
  firestoreModule = module;
}
function requireFirestoreModule() {
  if (!firestoreModule) {
    throw new Error(
      "[Realtime] Firestore module not configured. Call configureFirestoreRealtime() before using realtime helpers."
    );
  }
  return firestoreModule;
}
function convertValue(value) {
  if (value === null || value === void 0) return value;
  const module = firestoreModule;
  if (module && value instanceof module.Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      return value.toDate().toISOString();
    } catch {
    }
  }
  if (Array.isArray(value)) {
    return value.map((item) => convertValue(item));
  }
  if (typeof value === "object" && value !== null) {
    const convertedEntries = Object.entries(value).map(
      ([key, val]) => [key, convertValue(val)]
    );
    return Object.fromEntries(convertedEntries);
  }
  return value;
}
function serializeDoc(snapshot) {
  const data = snapshot.data() ?? {};
  return {
    id: snapshot.id,
    ...convertValue(data)
  };
}
function sortByTimestampDescending(items) {
  return [...items].sort((a, b) => {
    const aTime = a.updatedAt && Date.parse(a.updatedAt) || a.createdAt && Date.parse(a.createdAt) || 0;
    const bTime = b.updatedAt && Date.parse(b.updatedAt) || b.createdAt && Date.parse(b.createdAt) || 0;
    return bTime - aTime;
  });
}
function useFirestoreCollection(queryRef, key, options) {
  const { onSnapshot, getDocs } = requireFirestoreModule();
  const queryClient = reactQuery.useQueryClient();
  const {
    transform,
    enabled = true,
    staleTimeMs = 3e4,
    onError,
    queryOptions
  } = options ?? {};
  const combinedEnabled = typeof queryOptions?.enabled === "boolean" ? enabled && queryOptions.enabled : enabled;
  const mapDoc = react.useCallback((snapshot) => {
    return serializeDoc(snapshot);
  }, []);
  react.useEffect(() => {
    if (!queryRef || !combinedEnabled) return;
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const docs = snapshot.docs.map(mapDoc);
        const data = transform ? transform(docs) : docs;
        queryClient.setQueryData(key, data);
      },
      (error) => {
        console.error("[Firestore] Snapshot error", error);
        onError?.(error);
      }
    );
    return () => unsubscribe();
  }, [combinedEnabled, key, mapDoc, onError, queryClient, queryRef, transform]);
  return reactQuery.useQuery({
    queryKey: key,
    staleTime: staleTimeMs,
    ...queryOptions ?? {},
    enabled: combinedEnabled,
    queryFn: async () => {
      if (!queryRef) return [];
      const snapshot = await getDocs(queryRef);
      const docs = snapshot.docs.map(mapDoc);
      return transform ? transform(docs) : docs;
    }
  });
}
function useFirestoreDocument(docRef, key, options) {
  const { onSnapshot, getDoc } = requireFirestoreModule();
  const queryClient = reactQuery.useQueryClient();
  const { enabled = true, staleTimeMs = 15e3, onError, queryOptions } = options ?? {};
  const combinedEnabled = typeof queryOptions?.enabled === "boolean" ? enabled && queryOptions.enabled : enabled;
  const mapDoc = react.useCallback((snapshot) => {
    return serializeDoc(snapshot);
  }, []);
  react.useEffect(() => {
    if (!docRef || !combinedEnabled) return;
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          queryClient.setQueryData(key, null);
          return;
        }
        const data = mapDoc(snapshot);
        queryClient.setQueryData(key, data);
      },
      (error) => {
        console.error("[Firestore] Snapshot error", error);
        onError?.(error);
      }
    );
    return () => unsubscribe();
  }, [combinedEnabled, docRef, key, mapDoc, onError, queryClient]);
  return reactQuery.useQuery({
    queryKey: key,
    staleTime: staleTimeMs,
    refetchOnReconnect: true,
    ...queryOptions ?? {},
    enabled: combinedEnabled,
    queryFn: async () => {
      if (!docRef) return null;
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;
      return mapDoc(snapshot);
    }
  });
}

exports.configureFirestoreRealtime = configureFirestoreRealtime;
exports.convertValue = convertValue;
exports.createApiClient = createApiClient;
exports.createApiHooks = createApiHooks;
exports.isApiError = isApiError;
exports.queryKeys = queryKeys;
exports.serializeDoc = serializeDoc;
exports.sortByTimestampDescending = sortByTimestampDescending;
exports.useFirestoreCollection = useFirestoreCollection;
exports.useFirestoreDocument = useFirestoreDocument;
