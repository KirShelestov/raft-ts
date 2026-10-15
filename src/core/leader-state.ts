import type { LogIndex, NodeId } from "./types.js";

export interface LeaderStateSnapshot {
  readonly nextIndex: Readonly<Record<NodeId, LogIndex>>;
  readonly matchIndex: Readonly<Record<NodeId, LogIndex>>;
}

export class LeaderState {
  private readonly nextIndex = new Map<NodeId, LogIndex>();
  private readonly matchIndex = new Map<NodeId, LogIndex>();

  constructor(peers: readonly NodeId[], lastLogIndex: LogIndex) {
    for (const peer of peers) {
      this.nextIndex.set(peer, lastLogIndex + 1);
      this.matchIndex.set(peer, 0);
    }
  }

  nextIndexFor(peer: NodeId): LogIndex {
    const index = this.nextIndex.get(peer);
    if (index === undefined) {
      throw new Error(`Unknown peer: ${peer}`);
    }
    return index;
  }

  snapshot(): LeaderStateSnapshot {
    return {
      nextIndex: Object.fromEntries(this.nextIndex),
      matchIndex: Object.fromEntries(this.matchIndex),
    };
  }
}
