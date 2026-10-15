import type { LogEntry, LogIndex, NodeId, Term } from "./types.js";

export interface RequestVoteArgs {
  readonly term: Term;
  readonly candidateId: NodeId;
  readonly lastLogIndex: LogIndex;
  readonly lastLogTerm: Term;
}

export interface RequestVoteResult {
  readonly term: Term;
  readonly voteGranted: boolean;
}

export interface AppendEntriesArgs {
  readonly term: Term;
  readonly leaderId: NodeId;
  readonly prevLogIndex: LogIndex;
  readonly prevLogTerm: Term;
  readonly entries: readonly LogEntry[];
  readonly leaderCommit: LogIndex;
}

export interface AppendEntriesResult {
  readonly term: Term;
  readonly success: boolean;
}
