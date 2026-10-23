import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { RaftNode } from "../src/core/raft-node.js";
import { Role, type NodeId, type Term } from "../src/core/types.js";
import { MemoryStateStorage } from "../src/storage/memory-state-storage.js";
import { unreachableTransport } from "./support/single-node.js";
import { TestCluster, fastTiming } from "./support/test-cluster.js";
import { waitFor } from "./support/wait.js";

describe("Leader election", () => {
  let cluster: TestCluster | undefined;
  let standalone: RaftNode | undefined;

  afterEach(() => {
    cluster?.shutdown();
    standalone?.stop();
    cluster = undefined;
    standalone = undefined;
  });

  it("elects exactly one leader that every follower recognizes", async () => {
    cluster = TestCluster.ofSize(5);
    const leader = await cluster.waitForLeader();
    assert.ok(leader.currentTerm >= 1);
    assert.equal(cluster.leaders().length, 1);
    for (const status of cluster.statuses()) {
      assert.equal(status.leaderId, leader.id);
      assert.equal(status.currentTerm, leader.currentTerm);
    }
  });

  it("keeps the same leader while heartbeats flow", async () => {
    cluster = TestCluster.ofSize(3);
    const leader = await cluster.waitForLeader();
    await delay(fastTiming.electionTimeoutMaxMs * 5);
    const current = await cluster.waitForLeader();
    assert.equal(current.id, leader.id);
    assert.equal(current.currentTerm, leader.currentTerm);
  });

  it("elects a stable leader when the configured cluster has exactly two nodes", async () => {
    cluster = TestCluster.ofSize(2);
    const leader = await cluster.waitForLeader();
    await delay(fastTiming.electionTimeoutMaxMs * 5);
    const current = await cluster.waitForLeader();
    assert.equal(current.id, leader.id);
    assert.equal(current.currentTerm, leader.currentTerm);
    const follower = leader.peers[0];
    assert.ok(follower);
    assert.equal(cluster.node(follower).status().votedFor, leader.id);
  });

  it("requires three of five configured nodes and recovers when the third returns", async () => {
    cluster = TestCluster.ofSize(5);
    for (const id of ["n3", "n4", "n5"]) {
      cluster.crash(id);
    }
    await delay(fastTiming.electionTimeoutMaxMs * 5);
    assert.equal(cluster.leaders().length, 0);
    assert.ok(cluster.statuses().every((status) => status.currentTerm > 1));

    cluster.restart("n3");
    const leader = await cluster.waitForLeader(["n1", "n2", "n3"]);
    await delay(fastTiming.electionTimeoutMaxMs * 3);
    const current = await cluster.waitForLeader(["n1", "n2", "n3"]);
    assert.equal(current.id, leader.id);
    assert.equal(current.currentTerm, leader.currentTerm);
  });

  it("elects a single-node cluster leader on its own", async () => {
    standalone = new RaftNode({
      id: "solo",
      peers: [],
      storage: new MemoryStateStorage(),
      transport: unreachableTransport,
      timing: fastTiming,
    });
    standalone.start();
    await delay(fastTiming.electionTimeoutMaxMs * 2);
    assert.equal(standalone.status().role, Role.Leader);
    assert.equal(standalone.status().currentTerm, 1);
  });

  it("elects a new leader in a higher term after the leader is cut off", async () => {
    cluster = TestCluster.ofSize(5);
    const oldLeader = await cluster.waitForLeader();
    cluster.network.isolate(oldLeader.id);
    const majority = cluster.ids.filter((id) => id !== oldLeader.id);
    const newLeader = await cluster.waitForLeader(majority);
    assert.notEqual(newLeader.id, oldLeader.id);
    assert.ok(newLeader.currentTerm > oldLeader.currentTerm);
  });

  it("makes a stale leader step down when it rejoins", async () => {
    cluster = TestCluster.ofSize(3);
    const oldLeader = await cluster.waitForLeader();
    cluster.network.isolate(oldLeader.id);
    await cluster.waitForLeader(cluster.ids.filter((id) => id !== oldLeader.id));
    assert.equal(cluster.node(oldLeader.id).status().role, Role.Leader);

    cluster.network.heal(oldLeader.id);
    const leader = await cluster.waitForLeader();
    const rejoined = cluster.node(oldLeader.id).status();
    assert.equal(rejoined.role, Role.Follower);
    assert.equal(rejoined.leaderId, leader.id);
    assert.equal(rejoined.currentTerm, leader.currentTerm);
  });

  it("cannot elect a leader without a majority", async () => {
    cluster = TestCluster.ofSize(5);
    const leader = await cluster.waitForLeader();
    const minority = cluster.ids.filter((id) => id !== leader.id).slice(0, 2);
    for (const id of cluster.ids) {
      if (!minority.includes(id)) {
        cluster.crash(id);
      }
    }
    await delay(fastTiming.electionTimeoutMaxMs * 6);
    assert.equal(cluster.leaders(minority).length, 0);
    for (const id of minority) {
      assert.ok(cluster.node(id).status().currentTerm > leader.currentTerm);
    }
  });

  it("restores currentTerm and votedFor after a crash", async () => {
    cluster = TestCluster.ofSize(3);
    const leader = await cluster.waitForLeader();
    const follower = cluster.ids.find((id) => id !== leader.id) as NodeId;
    const before = cluster.node(follower).status();
    cluster.crash(follower);
    const restarted = cluster.restart(follower).status();
    assert.equal(restarted.role, Role.Follower);
    assert.equal(restarted.currentTerm, before.currentTerm);
    assert.equal(restarted.votedFor, before.votedFor);
    await cluster.waitForLeader();
  });

  it("returns a candidate to follower when a leader of the same term appears", async () => {
    standalone = new RaftNode({
      id: "n1",
      peers: ["n2", "n3"],
      storage: new MemoryStateStorage(),
      transport: unreachableTransport,
      timing: fastTiming,
    });
    standalone.start();
    const node = standalone;
    const candidate = await waitFor(() =>
      node.status().role === Role.Candidate ? node.status() : undefined,
    );
    const result = node.handleAppendEntries({
      term: candidate.currentTerm,
      leaderId: "n2",
      prevLogIndex: 0,
      prevLogTerm: 0,
      entries: [],
      leaderCommit: 0,
    });
    assert.equal(result.success, true);
    assert.equal(node.status().role, Role.Follower);
    assert.equal(node.status().leaderId, "n2");
  });

  it("never has two leaders in the same term under repeated failures", async () => {
    cluster = TestCluster.ofSize(5);
    const leadersByTerm = new Map<Term, Set<NodeId>>();
    const observe = (): void => {
      for (const status of cluster?.leaders() ?? []) {
        const leaders = leadersByTerm.get(status.currentTerm) ?? new Set<NodeId>();
        leaders.add(status.id);
        leadersByTerm.set(status.currentTerm, leaders);
      }
    };
    const observer = setInterval(observe, 2);
    try {
      for (let round = 0; round < 6; round += 1) {
        const leader = await cluster.waitForLeader();
        cluster.network.isolate(leader.id);
        await delay(fastTiming.electionTimeoutMaxMs * 2);
        cluster.network.heal(leader.id);
      }
      await cluster.waitForLeader();
    } finally {
      clearInterval(observer);
    }
    assert.ok(leadersByTerm.size >= 6);
    for (const [term, leaders] of leadersByTerm) {
      assert.equal(leaders.size, 1, `term ${term} had leaders ${[...leaders].join(", ")}`);
    }
  });
});
