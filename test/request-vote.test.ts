import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "../src/core/types.js";
import { createIdleNode } from "./support/single-node.js";

describe("RequestVote receiver", () => {
  it("rejects a candidate whose term is older than currentTerm", () => {
    const { node } = createIdleNode({ currentTerm: 5, votedFor: null, log: [] });
    const result = node.handleRequestVote({ term: 4, candidateId: "n2", lastLogIndex: 0, lastLogTerm: 0 });
    assert.deepEqual(result, { term: 5, voteGranted: false });
    assert.equal(node.status().votedFor, null);
  });

  it("grants at most one vote per term on a first-come-first-served basis", () => {
    const { node } = createIdleNode();
    const first = node.handleRequestVote({ term: 1, candidateId: "n2", lastLogIndex: 0, lastLogTerm: 0 });
    const second = node.handleRequestVote({ term: 1, candidateId: "n3", lastLogIndex: 0, lastLogTerm: 0 });
    assert.deepEqual(first, { term: 1, voteGranted: true });
    assert.deepEqual(second, { term: 1, voteGranted: false });
    assert.equal(node.status().votedFor, "n2");
  });

  it("grants the vote again to the same candidate for a repeated request", () => {
    const { node } = createIdleNode();
    const args = { term: 1, candidateId: "n2", lastLogIndex: 0, lastLogTerm: 0 };
    assert.equal(node.handleRequestVote(args).voteGranted, true);
    assert.equal(node.handleRequestVote(args).voteGranted, true);
  });

  it("adopts a newer term and clears the previous vote", () => {
    const { node } = createIdleNode({ currentTerm: 2, votedFor: "n2", log: [] });
    const result = node.handleRequestVote({ term: 3, candidateId: "n3", lastLogIndex: 0, lastLogTerm: 0 });
    assert.deepEqual(result, { term: 3, voteGranted: true });
    assert.equal(node.status().currentTerm, 3);
    assert.equal(node.status().votedFor, "n3");
    assert.equal(node.status().role, Role.Follower);
  });

  it("denies the vote when its own log is more up-to-date than the candidate's", () => {
    const { node } = createIdleNode({
      currentTerm: 2,
      votedFor: null,
      log: [
        { term: 1, command: "x" },
        { term: 2, command: "y" },
      ],
    });
    const olderTerm = node.handleRequestVote({ term: 3, candidateId: "n2", lastLogIndex: 5, lastLogTerm: 1 });
    const shorterLog = node.handleRequestVote({ term: 3, candidateId: "n3", lastLogIndex: 1, lastLogTerm: 2 });
    assert.equal(olderTerm.voteGranted, false);
    assert.equal(shorterLog.voteGranted, false);
    assert.equal(node.status().currentTerm, 3);
    assert.equal(node.status().votedFor, null);
  });

  it("persists currentTerm and votedFor before responding", () => {
    const { node, storage } = createIdleNode();
    node.handleRequestVote({ term: 7, candidateId: "n3", lastLogIndex: 0, lastLogTerm: 0 });
    const persisted = storage.load();
    assert.equal(persisted.currentTerm, 7);
    assert.equal(persisted.votedFor, "n3");
  });
});
