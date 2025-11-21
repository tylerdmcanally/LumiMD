/**
 * Configuration for Firebase Functions
 * Reads from environment variables (process.env)
 * 
 * For local development, create a .env file in the functions directory with:
 * - OPENAI_API_KEY
 * - ASSEMBLYAI_API_KEY
 * - VISIT_PROCESSING_WEBHOOK_SECRET
 * - STORAGE_BUCKET
 * 
 * For production, set these via Firebase Functions secrets or environment config
 */

export const assemblyAIConfig = {
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
};

export const openAIConfig = {
  apiKey: process.env.OPENAI_API_KEY || '',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};

export const storageConfig = {
  bucket: process.env.STORAGE_BUCKET || 'lumimd-dev.appspot.com',
};

export const webhookConfig = {
  visitProcessingSecret: process.env.VISIT_PROCESSING_WEBHOOK_SECRET || '',
};
