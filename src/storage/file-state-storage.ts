import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { initialPersistentState, type PersistentStateSnapshot, type StateStorage } from "../core/storage.js";
import {
  asFields,
  parseLogEntries,
  readNonNegativeInteger,
  readNullableNodeId,
} from "../codec/validation.js";

export class FileStateStorage implements StateStorage {
  constructor(private readonly filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  load(): PersistentStateSnapshot {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return initialPersistentState;
      }
      throw error;
    }
    return parsePersistentState(JSON.parse(raw));
  }

  save(state: PersistentStateSnapshot): void {
    const temporaryPath = `${this.filePath}.tmp`;
    const descriptor = openSync(temporaryPath, "w");
    try {
      writeSync(descriptor, JSON.stringify(state));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporaryPath, this.filePath);
  }
}

function parsePersistentState(value: unknown): PersistentStateSnapshot {
  const fields = asFields(value, "Persistent state");
  return {
    currentTerm: readNonNegativeInteger(fields, "currentTerm"),
    votedFor: readNullableNodeId(fields, "votedFor"),
    log: parseLogEntries(fields["log"], "log"),
  };
}
