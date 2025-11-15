import * as functions from 'firebase-functions';

const getFunctionsConfigValue = <T = unknown>(path: string[], fallback: T): T => {
  try {
    return path.reduce((acc: any, key) => {
      if (acc && typeof acc === 'object' && key in acc) {
        return acc[key];
      }
      throw new Error('Missing key');
    }, functions.config() as unknown) as T;
  } catch {
    return fallback;
  }
};

export const assemblyAIConfig = {
  apiKey:
    process.env.ASSEMBLYAI_API_KEY ||
    getFunctionsConfigValue<string>(['assemblyai', 'api_key'], ''),
};

export const openAIConfig = {
  apiKey:
    process.env.OPENAI_API_KEY ||
    getFunctionsConfigValue<string>(['openai', 'api_key'], ''),
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
};

export const storageConfig = {
  bucket: process.env.STORAGE_BUCKET || 'lumimd-dev.appspot.com',
};

export const webhookConfig = {
  visitProcessingSecret:
    process.env.VISIT_PROCESSING_WEBHOOK_SECRET ||
    getFunctionsConfigValue<string>(['webhook', 'visit_processing_secret'], ''),
};



