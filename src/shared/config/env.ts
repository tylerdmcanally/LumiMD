// Environment configuration for the mobile client.
// Keys are sourced from Expo env variables (EXPO_PUBLIC_*).

const OPENAI_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

export const ENV = {
  OPENAI_API_KEY: OPENAI_KEY,
  GOOGLE_MAPS_API_KEY: GOOGLE_MAPS_KEY,
  API_BASE_URL,
};

if (__DEV__) {
  console.log('ENV loaded:', {
    hasOpenAI: Boolean(ENV.OPENAI_API_KEY),
    hasGoogleMaps: Boolean(ENV.GOOGLE_MAPS_API_KEY),
    apiBaseUrl: ENV.API_BASE_URL || '(not set)',
  });
}
