const refreshLocks = new Map<string, Promise<any>>();

export async function withRefreshLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = refreshLocks.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const promise = fn().finally(() => {
    if (refreshLocks.get(key) === promise) {
      refreshLocks.delete(key);
    }
  });
  refreshLocks.set(key, promise);
  return promise;
}
