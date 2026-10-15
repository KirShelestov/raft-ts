import type {
  AppendEntriesArgs,
  AppendEntriesResult,
  RequestVoteArgs,
  RequestVoteResult,
} from "./messages.js";
import type { NodeId } from "./types.js";

export interface RaftTransport {
  requestVote(peer: NodeId, args: RequestVoteArgs): Promise<RequestVoteResult>;
  appendEntries(peer: NodeId, args: AppendEntriesArgs): Promise<AppendEntriesResult>;
}
