/**
 * Async semaphore for limiting concurrency.
 * Usage: const sem = new Semaphore(5); await sem.acquire(); ... sem.release();
 */
export class Semaphore {
  private count: number;
  private readonly waiting: Array<() => void> = [];

  constructor(concurrency: number) {
    this.count = Math.max(1, concurrency);
  }

  async acquire(): Promise<void> {
    if (this.count > 0) {
      this.count--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) {
      next();
    } else {
      this.count++;
    }
  }
}
