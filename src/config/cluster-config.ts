import { readFileSync } from "node:fs";
import { assertValidTiming, defaultTiming, type RaftTiming } from "../core/timing.js";
import type { NodeId } from "../core/types.js";

export interface ClusterMember {
  readonly id: NodeId;
  readonly url: string;
}

export interface ClusterConfig {
  readonly nodes: readonly ClusterMember[];
  readonly timing: RaftTiming;
  readonly rpcTimeoutMs: number;
}

interface RawClusterConfig {
  readonly nodes?: unknown;
  readonly timing?: Partial<RaftTiming>;
  readonly rpcTimeoutMs?: unknown;
}

export function loadClusterConfig(filePath: string): ClusterConfig {
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as RawClusterConfig;
  const nodes = parseMembers(raw.nodes);
  const timing: RaftTiming = { ...defaultTiming, ...raw.timing };
  assertValidTiming(timing);
  const rpcTimeoutMs = raw.rpcTimeoutMs ?? timing.heartbeatIntervalMs * 2;
  if (typeof rpcTimeoutMs !== "number" || !(rpcTimeoutMs > 0)) {
    throw new Error("rpcTimeoutMs must be a positive number");
  }
  return { nodes, timing, rpcTimeoutMs };
}

function parseMembers(value: unknown): ClusterMember[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Cluster config must list at least one node in \"nodes\"");
  }
  const members = value.map((item: unknown, position) => {
    const { id, url } = (item ?? {}) as Record<string, unknown>;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`nodes[${position}].id must be a non-empty string`);
    }
    if (typeof url !== "string" || new URL(url).port === "") {
      throw new Error(`nodes[${position}].url must be an absolute URL with an explicit port`);
    }
    return { id, url };
  });
  if (new Set(members.map((member) => member.id)).size !== members.length) {
    throw new Error("Node ids in cluster config must be unique");
  }
  return members;
}
