import { setImmediate as nextTick } from "node:timers/promises";
import type {
  AppendEntriesArgs,
  AppendEntriesResult,
  RequestVoteArgs,
  RequestVoteResult,
} from "../../src/core/messages.js";
import type { RaftNode } from "../../src/core/raft-node.js";
import type { RaftTransport } from "../../src/core/transport.js";
import type { NodeId } from "../../src/core/types.js";

export class InMemoryNetwork {
  private readonly nodes = new Map<NodeId, RaftNode>();
  private readonly isolated = new Set<NodeId>();

  attach(node: RaftNode): void {
    this.nodes.set(node.id, node);
  }

  detach(id: NodeId): void {
    this.nodes.delete(id);
  }

  isolate(id: NodeId): void {
    this.isolated.add(id);
  }

  heal(id: NodeId): void {
    this.isolated.delete(id);
  }

  transportFor(from: NodeId): RaftTransport {
    return {
      requestVote: (peer: NodeId, args: RequestVoteArgs): Promise<RequestVoteResult> =>
        this.deliver(from, peer, (node) => node.handleRequestVote(args)),
      appendEntries: (peer: NodeId, args: AppendEntriesArgs): Promise<AppendEntriesResult> =>
        this.deliver(from, peer, (node) => node.handleAppendEntries(args)),
    };
  }

  private async deliver<T>(from: NodeId, to: NodeId, call: (node: RaftNode) => T): Promise<T> {
    await nextTick();
    const result = call(this.reachable(from, to));
    await nextTick();
    this.reachable(from, to);
    return result;
  }

  private reachable(from: NodeId, to: NodeId): RaftNode {
    const target = this.nodes.get(to);
    if (target === undefined || !this.nodes.has(from) || this.isolated.has(from) || this.isolated.has(to)) {
      throw new Error(`${to} is unreachable from ${from}`);
    }
    return target;
  }
}
