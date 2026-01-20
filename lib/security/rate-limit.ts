import "server-only";

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type Entry = { count: number; windowStartMs: number };

const globalForRateLimit = globalThis as unknown as {
  __rateLimitStore?: Map<string, Entry>;
  __requestCoordinator?: RequestCoordinator;
};

const store = (globalForRateLimit.__rateLimitStore ??= new Map<
  string,
  Entry
>());

export class RequestCoordinator {
  private queues = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.queues.set(key, previous.then(() => current));
    await previous;
    try {
      return await task();
    } finally {
      release?.();
      if (this.queues.get(key) === current) {
        this.queues.delete(key);
      }
    }
  }
}

export const requestCoordinator =
  (globalForRateLimit.__requestCoordinator ??= new RequestCoordinator());

export function checkRateLimit({
  key,
  windowMs,
  max,
}: {
  key: string;
  windowMs: number;
  max: number;
}): RateLimitResult {
  const now = Date.now();
  const existing = store.get(key);

  if (!existing) {
    store.set(key, { count: 1, windowStartMs: now });
    return { ok: true };
  }

  const elapsed = now - existing.windowStartMs;
  if (elapsed >= windowMs) {
    store.set(key, { count: 1, windowStartMs: now });
    return { ok: true };
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.ceil((windowMs - elapsed) / 1000);
    return { ok: false, retryAfterSeconds };
  }

  existing.count += 1;
  store.set(key, existing);
  return { ok: true };
}

export async function checkIntegrationLimit(integrationType: string): Promise<RateLimitResult> {
  // In Phase 11, we hardcode limits or fetch from DB. 
  // For simplicity/speed, using hardcoded map matching the DB defaults.
  const LIMITS: Record<string, number> = {
    github: 30,
    slack: 20,
    linear: 60
  };
  
  const limit = LIMITS[integrationType] || 60;
  
  return checkRateLimit({
    key: `integration:${integrationType}`,
    windowMs: 60000, // 1 minute
    max: limit
  });
}
