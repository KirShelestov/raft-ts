import type { LogEntry, LogIndex, Term } from "./types.js";

export interface LogPosition {
  readonly index: LogIndex;
  readonly term: Term;
}

export function isAtLeastAsUpToDate(candidate: LogPosition, own: LogPosition): boolean {
  if (candidate.term !== own.term) {
    return candidate.term > own.term;
  }
  return candidate.index >= own.index;
}

export class RaftLog {
  private readonly entries: LogEntry[];

  constructor(entries: readonly LogEntry[] = []) {
    this.entries = [...entries];
  }

  get lastIndex(): LogIndex {
    return this.entries.length;
  }

  get lastTerm(): Term {
    return this.requireTermAt(this.lastIndex);
  }

  lastPosition(): LogPosition {
    return { index: this.lastIndex, term: this.lastTerm };
  }

  termAt(index: LogIndex): Term | undefined {
    if (index === 0) {
      return 0;
    }
    return this.entries[index - 1]?.term;
  }

  requireTermAt(index: LogIndex): Term {
    const term = this.termAt(index);
    if (term === undefined) {
      throw new RangeError(`Log has no entry at index ${index}`);
    }
    return term;
  }

  toArray(): readonly LogEntry[] {
    return [...this.entries];
  }
}
