import type { LogEntry, NodeId, Term } from "./types.js";

export interface PersistentStateSnapshot {
  readonly currentTerm: Term;
  readonly votedFor: NodeId | null;
  readonly log: readonly LogEntry[];
}

export interface StateStorage {
  load(): PersistentStateSnapshot;
  save(state: PersistentStateSnapshot): void;
}

export const initialPersistentState: PersistentStateSnapshot = Object.freeze({
  currentTerm: 0,
  votedFor: null,
  log: Object.freeze([]),
});
