import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCliOptions, parseClusterCliOptions } from "../src/config/cli.js";

describe("Launch options", () => {
  it("keeps file storage as the default", () => {
    assert.deepEqual(parseCliOptions(["--id", "n1"]), {
      id: "n1", configPath: "cluster.json", dataDir: "data", storage: "file", host: undefined,
    });
  });

  it("selects memory storage for a single node", () => {
    assert.equal(parseCliOptions(["--id", "n1", "--storage", "memory"]).storage, "memory");
  });

  it("rejects an unknown storage mode", () => {
    assert.throws(() => parseCliOptions(["--id", "n1", "--storage", "unknown"]), /file or memory/);
    assert.throws(() => parseClusterCliOptions(["--storage", "unknown"]), /file or memory/);
  });

  it("requires a node id", () => {
    assert.throws(() => parseCliOptions([]), /--id/);
  });

  it("accepts cluster options without a positional config", () => {
    assert.deepEqual(parseClusterCliOptions(["--storage", "memory"]), {
      configPath: "cluster.json", dataDir: "data", storage: "memory", host: undefined,
    });
  });

  it("preserves the positional cluster config and accepts launch options", () => {
    assert.deepEqual(parseClusterCliOptions([
      "cluster.two-nodes.json", "--storage", "memory", "--data-dir", "custom-data", "--host", "127.0.0.1",
    ]), {
      configPath: "cluster.two-nodes.json", dataDir: "custom-data", storage: "memory", host: "127.0.0.1",
    });
  });

  it("accepts an explicit cluster config", () => {
    assert.equal(parseClusterCliOptions(["--config", "custom.json"]).configPath, "custom.json");
  });

  it("rejects ambiguous cluster configs", () => {
    assert.throws(() => parseClusterCliOptions(["one.json", "two.json"]), /one cluster config/);
    assert.throws(() => parseClusterCliOptions(["one.json", "--config", "two.json"]), /one cluster config/);
  });
});
