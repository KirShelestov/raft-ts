import { RaftNode } from "../../src/core/raft-node.js";
import type { NodeStatus } from "../../src/core/status.js";
import type { RaftTiming } from "../../src/core/timing.js";
import { Role, type NodeId } from "../../src/core/types.js";
import { MemoryStateStorage } from "../../src/storage/memory-state-storage.js";
import { InMemoryNetwork } from "./in-memory-network.js";
import { waitFor } from "./wait.js";

export const fastTiming: RaftTiming = {
  electionTimeoutMinMs: 60,
  electionTimeoutMaxMs: 120,
  heartbeatIntervalMs: 15,
};

export class TestCluster {
  readonly network = new InMemoryNetwork();
  private readonly nodes = new Map<NodeId, RaftNode>();
  private readonly storages = new Map<NodeId, MemoryStateStorage>();

  constructor(
    readonly ids: readonly NodeId[],
    private readonly timing: RaftTiming = fastTiming,
  ) {
    for (const id of ids) {
      this.storages.set(id, new MemoryStateStorage());
      this.boot(id);
    }
  }

  static ofSize(size: number): TestCluster {
    return new TestCluster(Array.from({ length: size }, (_, index) => `n${index + 1}`));
  }

  node(id: NodeId): RaftNode {
    const node = this.nodes.get(id);
    if (node === undefined) {
      throw new Error(`Node ${id} is not running`);
    }
    return node;
  }

  statuses(): NodeStatus[] {
    return [...this.nodes.values()].map((node) => node.status());
  }

  leaders(among: readonly NodeId[] = this.ids): NodeStatus[] {
    return this.statuses().filter((status) => status.role === Role.Leader && among.includes(status.id));
  }

  crash(id: NodeId): void {
    this.node(id).stop();
    this.network.detach(id);
    this.nodes.delete(id);
  }

  restart(id: NodeId): RaftNode {
    return this.boot(id);
  }

  shutdown(): void {
    for (const id of [...this.nodes.keys()]) {
      this.crash(id);
    }
  }

  async waitForLeader(among: readonly NodeId[] = this.ids, timeoutMs = 3000): Promise<NodeStatus> {
    return waitFor(() => {
      const leaders = this.leaders(among);
      const leader = leaders[0];
      if (leaders.length !== 1 || leader === undefined) {
        return undefined;
      }
      const followers = this.statuses().filter((status) => among.includes(status.id) && status.id !== leader.id);
      const acknowledged = followers.every(
        (status) => status.leaderId === leader.id && status.currentTerm === leader.currentTerm,
      );
      return acknowledged ? leader : undefined;
    }, timeoutMs);
  }

  private boot(id: NodeId): RaftNode {
    const storage = this.storages.get(id);
    if (storage === undefined) {
      throw new Error(`Unknown node ${id}`);
    }
    const node = new RaftNode({
      id,
      peers: this.ids.filter((peer) => peer !== id),
      storage,
      transport: this.network.transportFor(id),
      timing: this.timing,
    });
    this.nodes.set(id, node);
    this.network.attach(node);
    node.start();
    return node;
  }
}
