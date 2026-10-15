import { setTimeout as delay } from "node:timers/promises";

export async function waitFor<T>(probe: () => T | undefined | Promise<T | undefined>, timeoutMs = 3000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) {
      return value;
    }
    await delay(5);
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
