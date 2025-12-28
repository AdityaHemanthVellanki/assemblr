import "server-only";

type RateLimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

type Entry = { count: number; windowStartMs: number };

const globalForRateLimit = globalThis as unknown as {
  __rateLimitStore?: Map<string, Entry>;
};

const store = (globalForRateLimit.__rateLimitStore ??= new Map<
  string,
  Entry
>());

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
