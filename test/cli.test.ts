import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCliOptions } from "../src/config/cli.js";

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
  });

  it("requires a node id", () => {
    assert.throws(() => parseCliOptions([]), /--id/);
  });

  it("preserves config, data directory and host options", () => {
    assert.deepEqual(parseCliOptions([
      "--id", "n1", "--config", "custom.json", "--storage", "memory", "--data-dir", "custom-data", "--host", "127.0.0.1",
    ]), {
      id: "n1", configPath: "custom.json", dataDir: "custom-data", storage: "memory", host: "127.0.0.1",
    });
  });
});
