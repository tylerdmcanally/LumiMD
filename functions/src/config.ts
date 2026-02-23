/**
 * Configuration for Firebase Functions
 * Reads from environment variables (process.env)
 *
 * Required environment variables:
 * - OPENAI_API_KEY: For AI summaries
 * - ASSEMBLYAI_API_KEY: For audio transcription
 * - STORAGE_BUCKET: Firebase Storage bucket name
 * - ALLOWED_ORIGINS: Comma-separated list of allowed CORS origins
 *
 * Optional:
 * - SUBSCRIPTION_ENFORCEMENT_DISABLED: Set to "true" to bypass subscription checks
 *
 * For production, set these via Firebase Functions secrets:
 *   firebase functions:secrets:set OPENAI_API_KEY
 */

export const assemblyAIConfig = {
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
};

export const openAIConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  visitShadowCompare: process.env.OPENAI_VISIT_SHADOW_COMPARE === 'true',
};

export const storageConfig = {
  bucket: process.env.STORAGE_BUCKET || 'lumimd-dev.appspot.com',
};

export const webhookConfig = {
  assemblyaiWebhookSecret: process.env.ASSEMBLYAI_WEBHOOK_SECRET || '',
};

const parseTimeoutMs = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

export const externalDrugDataConfig = {
  enabled: process.env.EXTERNAL_DRUG_DATA_ENABLED === 'true',
  baseUrl: process.env.EXTERNAL_DRUG_DATA_BASE_URL || 'https://rxnav.nlm.nih.gov/REST',
  timeoutMs: parseTimeoutMs(process.env.EXTERNAL_DRUG_DATA_TIMEOUT_MS, 8000),
};

export const escalationIncidentConfig = {
  webhookUrl: process.env.POST_COMMIT_ESCALATION_WEBHOOK_URL || '',
  webhookToken: process.env.POST_COMMIT_ESCALATION_WEBHOOK_TOKEN || '',
  timeoutMs: parseTimeoutMs(process.env.POST_COMMIT_ESCALATION_WEBHOOK_TIMEOUT_MS, 8000),
};

export const corsConfig = {
  // Comma-separated list of allowed origins for CORS
  // Example: "https://portal.lumimd.app,https://lumimd.app"
  allowedOrigins: process.env.ALLOWED_ORIGINS || '',
  // Allow development origins when NODE_ENV is not production
  isDevelopment: process.env.NODE_ENV !== 'production',
};
