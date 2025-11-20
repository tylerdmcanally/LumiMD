/**
 * Options for the retry mechanism
 */
export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  shouldRetry?: (error: any) => boolean;
}

/**
 * Default options for retries
 */
const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffFactor: 2,
  shouldRetry: () => true,
};

/**
 * Waits for a specified duration
 */
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Executes a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;
  let currentDelay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // If we've reached max attempts or shouldn't retry this error, throw
      if (attempt === config.maxAttempts || !config.shouldRetry(error)) {
        throw error;
      }

      // Wait before next attempt
      await delay(currentDelay);

      // Calculate next delay with exponential backoff
      currentDelay = Math.min(
        currentDelay * config.backoffFactor,
        config.maxDelayMs
      );
    }
  }

  throw lastError;
}
