/**
 * Configuration for Firebase Functions
 * Reads from environment variables (process.env)
 *
 * Required environment variables:
 * - OPENAI_API_KEY: For AI summaries
 * - ASSEMBLYAI_API_KEY: For audio transcription
 * - VISIT_PROCESSING_WEBHOOK_SECRET: For secure webhook calls
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
};

export const storageConfig = {
  bucket: process.env.STORAGE_BUCKET || 'lumimd-dev.appspot.com',
};

export const webhookConfig = {
  visitProcessingSecret: process.env.VISIT_PROCESSING_WEBHOOK_SECRET || '',
  assemblyaiWebhookSecret: process.env.ASSEMBLYAI_WEBHOOK_SECRET || '',
};

export const corsConfig = {
  // Comma-separated list of allowed origins for CORS
  // Example: "https://portal.lumimd.app,https://lumimd.app"
  allowedOrigins: process.env.ALLOWED_ORIGINS || '',
  // Allow development origins when NODE_ENV is not production
  isDevelopment: process.env.NODE_ENV !== 'production',
};
