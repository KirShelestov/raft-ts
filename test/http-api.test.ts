import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createHttpServer, type RaftHttpNode } from "../src/api/http-server.js";
import { RaftNode } from "../src/core/raft-node.js";
import type { NodeStatus } from "../src/core/status.js";
import { Role, type NodeId } from "../src/core/types.js";
import { MemoryStateStorage } from "../src/storage/memory-state-storage.js";
import { HttpTransport } from "../src/transport/http-transport.js";
import { fastTiming } from "./support/test-cluster.js";
import { waitFor } from "./support/wait.js";

const ids: readonly NodeId[] = ["n1", "n2", "n3"];
const nodes = new Map<NodeId, RaftNode>();
const servers = new Map<NodeId, Server>();
const urls = new Map<NodeId, string>();

function lateBound(id: NodeId): RaftHttpNode {
  const node = (): RaftNode => {
    const resolved = nodes.get(id);
    if (resolved === undefined) {
      throw new Error(`${id} is not ready`);
    }
    return resolved;
  };
  return {
    status: () => node().status(),
    handleRequestVote: (args) => node().handleRequestVote(args),
    handleAppendEntries: (args) => node().handleAppendEntries(args),
  };
}

function urlOf(id: NodeId): string {
  const url = urls.get(id);
  assert.ok(url);
  return url;
}

async function fetchStatus(id: NodeId): Promise<NodeStatus> {
  const response = await fetch(new URL("/status", urlOf(id)));
  assert.equal(response.status, 200);
  return (await response.json()) as NodeStatus;
}

function postJson(id: NodeId, path: string, body: unknown): Promise<Response> {
  return fetch(new URL(path, urlOf(id)), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("HTTP API over a real 3-node cluster", () => {
  before(async () => {
    for (const id of ids) {
      const server = createHttpServer(lateBound(id));
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      servers.set(id, server);
      urls.set(id, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    }
    for (const id of ids) {
      const peers = ids.filter((peer) => peer !== id);
      const node = new RaftNode({
        id,
        peers,
        storage: new MemoryStateStorage(),
        transport: new HttpTransport(new Map(peers.map((peer) => [peer, urlOf(peer)])), 50),
        timing: { ...fastTiming, heartbeatIntervalMs: 20 },
      });
      nodes.set(id, node);
      node.start();
    }
  });

  after(() => {
    for (const node of nodes.values()) {
      node.stop();
    }
    for (const server of servers.values()) {
      server.close();
      server.closeAllConnections();
    }
  });

  it("exposes a status in which all nodes agree on one leader", async () => {
    const leader = await waitFor(async () => {
      const statuses = await Promise.all(ids.map(fetchStatus));
      const leaders = statuses.filter((status) => status.role === Role.Leader);
      const candidate = leaders[0];
      if (leaders.length !== 1 || candidate === undefined) {
        return undefined;
      }
      const agreed = statuses.every(
        (status) => status.leaderId === candidate.id && status.currentTerm === candidate.currentTerm,
      );
      return agreed ? candidate : undefined;
    });
    assert.ok(leader.leaderState);
    assert.deepEqual(Object.keys(leader.leaderState.nextIndex).sort(), [...leader.peers].sort());
    assert.deepEqual(Object.values(leader.leaderState.nextIndex), [1, 1]);
    assert.deepEqual(Object.values(leader.leaderState.matchIndex), [0, 0]);
  });

  it("answers RequestVote over HTTP and refuses a stale candidate", async () => {
    const response = await postJson("n1", "/raft/request-vote", {
      term: 0,
      candidateId: "intruder",
      lastLogIndex: 0,
      lastLogTerm: 0,
    });
    assert.equal(response.status, 200);
    const result = (await response.json()) as { term: number; voteGranted: boolean };
    assert.equal(result.voteGranted, false);
    assert.ok(result.term >= 1);
  });

  it("rejects malformed RPC bodies with 400", async () => {
    const response = await postJson("n1", "/raft/append-entries", { term: "one" });
    assert.equal(response.status, 400);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(new URL("/nope", urlOf("n1")));
    assert.equal(response.status, 404);
  });
});
