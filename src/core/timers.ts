export class ElectionTimer {
  private handle: NodeJS.Timeout | null = null;

  constructor(
    private readonly minMs: number,
    private readonly maxMs: number,
    private readonly onTimeout: () => void,
    private readonly random: () => number = Math.random,
  ) {}

  reset(): void {
    this.stop();
    const timeoutMs = this.minMs + this.random() * (this.maxMs - this.minMs);
    this.handle = setTimeout(() => {
      this.handle = null;
      this.onTimeout();
    }, timeoutMs);
  }

  stop(): void {
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }
}

export class HeartbeatTimer {
  private handle: NodeJS.Timeout | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly onTick: () => void,
  ) {}

  start(): void {
    this.stop();
    this.onTick();
    this.handle = setInterval(this.onTick, this.intervalMs);
  }

  stop(): void {
    if (this.handle !== null) {
      clearInterval(this.handle);
      this.handle = null;
    }
  }
}
