import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "../src/core/types.js";
import { createIdleNode } from "./support/single-node.js";

const heartbeat = { leaderId: "n2", prevLogIndex: 0, prevLogTerm: 0, entries: [], leaderCommit: 0 };

describe("AppendEntries receiver (heartbeat)", () => {
  it("rejects a leader whose term is older than currentTerm", () => {
    const { node } = createIdleNode({ currentTerm: 3, votedFor: null, log: [] });
    const result = node.handleAppendEntries({ ...heartbeat, term: 2 });
    assert.deepEqual(result, { term: 3, success: false });
    assert.equal(node.status().leaderId, null);
  });

  it("accepts a heartbeat from the current leader and remembers it", () => {
    const { node } = createIdleNode({ currentTerm: 3, votedFor: null, log: [] });
    const result = node.handleAppendEntries({ ...heartbeat, term: 3 });
    assert.deepEqual(result, { term: 3, success: true });
    assert.equal(node.status().leaderId, "n2");
  });

  it("adopts the newer term of a leader", () => {
    const { node } = createIdleNode({ currentTerm: 1, votedFor: "n1", log: [] });
    const result = node.handleAppendEntries({ ...heartbeat, term: 4 });
    assert.deepEqual(result, { term: 4, success: true });
    assert.equal(node.status().currentTerm, 4);
    assert.equal(node.status().votedFor, null);
    assert.equal(node.status().role, Role.Follower);
  });

  it("fails the consistency check when prevLogIndex is missing from the log", () => {
    const { node } = createIdleNode({ currentTerm: 2, votedFor: null, log: [] });
    const result = node.handleAppendEntries({ ...heartbeat, term: 2, prevLogIndex: 1, prevLogTerm: 1 });
    assert.deepEqual(result, { term: 2, success: false });
  });
});
