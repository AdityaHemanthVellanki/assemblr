const toolBuildLocks = new Map<string, Promise<void>>();

export async function withToolBuildLock<T>(toolId: string, fn: () => Promise<T>): Promise<T> {
  const previous = toolBuildLocks.get(toolId) ?? Promise.resolve();
  let resolveNext: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    resolveNext = resolve;
  });
  const current = previous.then(() => next);
  toolBuildLocks.set(toolId, current);
  try {
    await previous;
    return await fn();
  } finally {
    resolveNext();
    if (toolBuildLocks.get(toolId) === current) {
      toolBuildLocks.delete(toolId);
    }
  }
}
