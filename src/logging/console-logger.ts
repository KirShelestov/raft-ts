import type { Logger } from "../core/logger.js";

export class ConsoleLogger implements Logger {
  constructor(private readonly nodeId: string) {}

  info(message: string): void {
    console.log(this.format(message));
  }

  warn(message: string): void {
    console.warn(this.format(message));
  }

  private format(message: string): string {
    return `${new Date().toISOString()} [${this.nodeId}] ${message}`;
  }
}
