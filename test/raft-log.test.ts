import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RaftLog, isAtLeastAsUpToDate } from "../src/core/raft-log.js";

describe("RaftLog", () => {
  it("starts empty with index 0 and term 0", () => {
    const log = new RaftLog();
    assert.deepEqual(log.lastPosition(), { index: 0, term: 0 });
    assert.equal(log.termAt(0), 0);
    assert.equal(log.termAt(1), undefined);
  });

  it("uses 1-based indexes", () => {
    const log = new RaftLog([
      { term: 1, command: "a" },
      { term: 3, command: "b" },
    ]);
    assert.equal(log.termAt(1), 1);
    assert.equal(log.termAt(2), 3);
    assert.deepEqual(log.lastPosition(), { index: 2, term: 3 });
    assert.throws(() => log.requireTermAt(3), RangeError);
  });
});

describe("isAtLeastAsUpToDate", () => {
  it("prefers the log whose last entry has the later term", () => {
    assert.equal(isAtLeastAsUpToDate({ index: 1, term: 3 }, { index: 10, term: 2 }), true);
    assert.equal(isAtLeastAsUpToDate({ index: 10, term: 2 }, { index: 1, term: 3 }), false);
  });

  it("prefers the longer log when last terms are equal", () => {
    assert.equal(isAtLeastAsUpToDate({ index: 5, term: 2 }, { index: 4, term: 2 }), true);
    assert.equal(isAtLeastAsUpToDate({ index: 4, term: 2 }, { index: 4, term: 2 }), true);
    assert.equal(isAtLeastAsUpToDate({ index: 3, term: 2 }, { index: 4, term: 2 }), false);
  });
});
