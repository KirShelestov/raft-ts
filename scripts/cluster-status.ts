import type { ClusterMember } from "../src/config/cluster-config.js";
import type { NodeStatus } from "../src/core/status.js";

export interface StatusRow {
  readonly id: string;
  readonly role: string;
  readonly term: number | string;
  readonly votedFor: string;
  readonly leader: string;
}

export async function collectStatus(members: readonly ClusterMember[]): Promise<StatusRow[]> {
  return Promise.all(
    members.map(async (member): Promise<StatusRow> => {
      try {
        const response = await fetch(new URL("/status", member.url), { signal: AbortSignal.timeout(500) });
        const status = (await response.json()) as NodeStatus;
        return {
          id: status.id,
          role: status.role,
          term: status.currentTerm,
          votedFor: status.votedFor ?? "-",
          leader: status.leaderId ?? "-",
        };
      } catch {
        return { id: member.id, role: "down", term: "-", votedFor: "-", leader: "-" };
      }
    }),
  );
}
