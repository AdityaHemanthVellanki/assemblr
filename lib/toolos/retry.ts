
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    backoffFactor?: number;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 500,
    backoffFactor = 2,
    shouldRetry = (err) => {
      // Retry on 429 and 5xx
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.includes("Too Many Requests")) return true;
      // Some APIs return 429 in status code property of error object if available
      if ((err as any)?.status === 429 || (err as any)?.statusCode === 429) return true;
      
      if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
      if ((err as any)?.status >= 500 || (err as any)?.statusCode >= 500) return true;
      
      return false;
    }
  } = options;

  let retries = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (retries >= maxRetries || !shouldRetry(err)) {
        throw err;
      }
      retries++;
      // Jitter
      const jitter = Math.random() * 0.1 * initialDelayMs;
      const delay = initialDelayMs * Math.pow(backoffFactor, retries - 1) + jitter;
      console.warn(`[Retry] Attempt ${retries}/${maxRetries} failed. Retrying in ${Math.round(delay)}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
