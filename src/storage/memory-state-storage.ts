import { initialPersistentState, type PersistentStateSnapshot, type StateStorage } from "../core/storage.js";

export class MemoryStateStorage implements StateStorage {
  private state: PersistentStateSnapshot;

  constructor(initial: PersistentStateSnapshot = initialPersistentState) {
    this.state = structuredClone(initial);
  }

  load(): PersistentStateSnapshot {
    return structuredClone(this.state);
  }

  save(state: PersistentStateSnapshot): void {
    this.state = structuredClone(state);
  }
}
