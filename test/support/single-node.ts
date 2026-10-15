import type { PersistentStateSnapshot } from "../../src/core/storage.js";
import { RaftNode } from "../../src/core/raft-node.js";
import type { RaftTransport } from "../../src/core/transport.js";
import { MemoryStateStorage } from "../../src/storage/memory-state-storage.js";

export const unreachableTransport: RaftTransport = {
  requestVote: () => Promise.reject(new Error("unreachable")),
  appendEntries: () => Promise.reject(new Error("unreachable")),
};

export function createIdleNode(initial?: PersistentStateSnapshot): { node: RaftNode; storage: MemoryStateStorage } {
  const storage = new MemoryStateStorage(initial);
  const node = new RaftNode({ id: "n1", peers: ["n2", "n3"], storage, transport: unreachableTransport });
  return { node, storage };
}
