import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ClusterMember } from "../src/config/cluster-config.js";
import type { NodeStatus } from "../src/core/status.js";
import { Role } from "../src/core/types.js";
import { waitFor } from "./support/wait.js";

describe("Launching two configured nodes in separate processes", () => {
  for (const storage of ["file", "memory"] as const) {
    it(`elects a stable leader and handles restarts with ${storage} storage`, async (t) => {
      const directory = mkdtempSync(join(tmpdir(), "raft-launch-"));
      const configPath = join(directory, "cluster.json");
      const dataDir = join(directory, "data");
      const children = new Set<ChildProcess>();
      let output = "";

      const stopNodes = async (): Promise<void> => {
        await Promise.all([...children].map(async (child) => {
          if (child.exitCode === null && child.signalCode === null) {
            const exited = once(child, "exit");
            child.kill("SIGTERM");
            await exited;
          }
        }));
        children.clear();
      };
      t.after(async () => {
        await stopNodes();
        rmSync(directory, { recursive: true, force: true });
      });

      // Reserve both ports together so that the OS cannot return the same port twice.
      const reservations = [createServer(), createServer()];
      t.after(() => {
        for (const server of reservations) {
          server.close();
        }
      });
      const members: ClusterMember[] = [];
      for (const [index, server] of reservations.entries()) {
        server.listen(0, "127.0.0.1");
        await once(server, "listening");
        members.push({ id: `n${index + 1}`, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
      }
      writeFileSync(configPath, JSON.stringify({ nodes: members }));
      await Promise.all(reservations.map((server) => new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      })));

      const startNodes = (): void => {
        output = "";
        for (const { id } of members) {
          const args = ["--import", "tsx", "src/main.ts", "--id", id, "--config", configPath, "--data-dir", dataDir];
          // Also exercise the default mode, which must continue to persist to disk.
          if (storage === "memory") {
            args.push("--storage", "memory");
          }
          const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
          child.stdout?.on("data", (chunk) => { output += String(chunk); });
          child.stderr?.on("data", (chunk) => { output += String(chunk); });
          children.add(child);
        }
      };

      const statuses = (): Promise<NodeStatus[]> => Promise.all(members.map(async ({ url }) => {
        const response = await fetch(new URL("/status", url), { signal: AbortSignal.timeout(500) });
        assert.equal(response.status, 200);
        return await response.json() as NodeStatus;
      }));

      const waitForLeader = async (minTerm = 1): Promise<NodeStatus> => {
        try {
          return await waitFor(async () => {
            for (const child of children) {
              assert.equal(child.exitCode, null, output);
            }
            let current: NodeStatus[];
            try {
              current = await statuses();
            } catch {
              return undefined;
            }
            const leaders = current.filter((status) => status.role === Role.Leader);
            const leader = leaders[0];
            return leaders.length === 1 && leader !== undefined && leader.currentTerm >= minTerm
              && current.every((status) => status.leaderId === leader.id && status.currentTerm === leader.currentTerm)
              ? leader : undefined;
          }, 5000);
        } catch (error) {
          throw new Error(`Cluster failed to elect a leader:\n${output}`, { cause: error });
        }
      };

      startNodes();
      const leader = await waitForLeader();
      await delay(900); // Three maximum election timeouts with real HTTP heartbeats.
      assert.deepEqual(await waitForLeader(), leader);
      assert.match(output, new RegExp(`storage=${storage}, cluster size=2, quorum=2`));

      // Advance the term well beyond a fresh process to make a reset observable.
      const target = members[0];
      assert.ok(target);
      const higherTerm = leader.currentTerm + 100;
      const response = await fetch(new URL("/raft/request-vote", target.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ term: higherTerm, candidateId: "n2", lastLogIndex: 0, lastLogTerm: 0 }),
        signal: AbortSignal.timeout(1000),
      });
      assert.equal(response.status, 200);
      await response.json();
      const beforeRestart = await waitForLeader(higherTerm);
      await stopNodes();

      let existingFile: string | undefined;
      if (storage === "file") {
        for (const { id } of members) {
          const saved = JSON.parse(readFileSync(join(dataDir, `${id}.json`), "utf8")) as { currentTerm: number };
          assert.equal(saved.currentTerm, beforeRestart.currentTerm);
        }
      } else {
        assert.equal(existsSync(dataDir), false);
        // Memory mode must also ignore state left on disk by an earlier file-mode run.
        mkdirSync(dataDir);
        existingFile = JSON.stringify({ currentTerm: higherTerm + 100, votedFor: "n1", log: [] });
        writeFileSync(join(dataDir, "n1.json"), existingFile);
      }

      startNodes();
      const restarted = await waitForLeader();
      if (storage === "file") {
        assert.ok(restarted.currentTerm > beforeRestart.currentTerm);
      } else {
        assert.ok(restarted.currentTerm < higherTerm);
        assert.equal(readFileSync(join(dataDir, "n1.json"), "utf8"), existingFile);
        assert.equal(existsSync(join(dataDir, "n2.json")), false);
      }
    });
  }
});
