import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { initialPersistentState } from "../src/core/storage.js";
import { InvalidMessageError } from "../src/codec/validation.js";
import { FileStateStorage } from "../src/storage/file-state-storage.js";

describe("FileStateStorage", () => {
  const directory = mkdtempSync(join(tmpdir(), "raft-storage-"));
  after(() => rmSync(directory, { recursive: true, force: true }));

  it("returns the initial state when nothing was saved yet", () => {
    const storage = new FileStateStorage(join(directory, "fresh", "n1.json"));
    assert.deepEqual(storage.load(), initialPersistentState);
  });

  it("survives a restart by reading back what was saved", () => {
    const filePath = join(directory, "n2.json");
    const state = { currentTerm: 4, votedFor: "n3", log: [{ term: 2, command: { op: "noop" } }] };
    new FileStateStorage(filePath).save(state);
    assert.deepEqual(new FileStateStorage(filePath).load(), state);
    assert.deepEqual(JSON.parse(readFileSync(filePath, "utf8")), state);
  });

  it("refuses to load a corrupted state file", () => {
    const filePath = join(directory, "broken.json");
    writeFileSync(filePath, JSON.stringify({ currentTerm: -1, votedFor: null, log: [] }));
    assert.throws(() => new FileStateStorage(filePath).load(), InvalidMessageError);
  });
});
