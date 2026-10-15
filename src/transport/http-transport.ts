import type {
  AppendEntriesArgs,
  AppendEntriesResult,
  RequestVoteArgs,
  RequestVoteResult,
} from "../core/messages.js";
import type { RaftTransport } from "../core/transport.js";
import type { NodeId } from "../core/types.js";
import { parseAppendEntriesResult, parseRequestVoteResult } from "../rpc/codec.js";
import { RaftRoutes } from "../rpc/routes.js";

export class HttpTransport implements RaftTransport {
  constructor(
    private readonly peerUrls: ReadonlyMap<NodeId, string>,
    private readonly timeoutMs: number,
  ) {}

  requestVote(peer: NodeId, args: RequestVoteArgs): Promise<RequestVoteResult> {
    return this.call(peer, RaftRoutes.requestVote, args, parseRequestVoteResult);
  }

  appendEntries(peer: NodeId, args: AppendEntriesArgs): Promise<AppendEntriesResult> {
    return this.call(peer, RaftRoutes.appendEntries, args, parseAppendEntriesResult);
  }

  private async call<T>(peer: NodeId, path: string, body: unknown, parse: (value: unknown) => T): Promise<T> {
    const baseUrl = this.peerUrls.get(peer);
    if (baseUrl === undefined) {
      throw new Error(`Unknown peer: ${peer}`);
    }
    const response = await fetch(new URL(path, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`${peer} responded with HTTP ${response.status}`);
    }
    return parse(await response.json());
  }
}
