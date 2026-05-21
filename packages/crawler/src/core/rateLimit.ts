export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RateLimiter {
  private lastRun = 0;

  constructor(private readonly delayMs: number) {}

  async wait(): Promise<void> {
    const elapsed = Date.now() - this.lastRun;
    const remaining = this.delayMs - elapsed;
    if (remaining > 0) {
      await sleep(remaining);
    }
    this.lastRun = Date.now();
  }
}
