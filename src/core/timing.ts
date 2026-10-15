export interface RaftTiming {
  readonly electionTimeoutMinMs: number;
  readonly electionTimeoutMaxMs: number;
  readonly heartbeatIntervalMs: number;
}

export const defaultTiming: RaftTiming = Object.freeze({
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
  heartbeatIntervalMs: 50,
});

export function assertValidTiming(timing: RaftTiming): void {
  const { electionTimeoutMinMs, electionTimeoutMaxMs, heartbeatIntervalMs } = timing;
  if (!(heartbeatIntervalMs > 0)) {
    throw new RangeError("heartbeatIntervalMs must be positive");
  }
  if (!(electionTimeoutMinMs > heartbeatIntervalMs)) {
    throw new RangeError("electionTimeoutMinMs must be greater than heartbeatIntervalMs");
  }
  if (!(electionTimeoutMaxMs > electionTimeoutMinMs)) {
    throw new RangeError("electionTimeoutMaxMs must be greater than electionTimeoutMinMs");
  }
}
