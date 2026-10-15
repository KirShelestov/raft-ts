import type { LeaderStateSnapshot } from "./leader-state.js";
import type { LogIndex, NodeId, Role, Term } from "./types.js";

export interface NodeStatus {
  readonly id: NodeId;
  readonly role: Role;
  readonly currentTerm: Term;
  readonly votedFor: NodeId | null;
  readonly leaderId: NodeId | null;
  readonly commitIndex: LogIndex;
  readonly lastApplied: LogIndex;
  readonly lastLogIndex: LogIndex;
  readonly lastLogTerm: Term;
  readonly peers: readonly NodeId[];
  readonly leaderState: LeaderStateSnapshot | null;
}
