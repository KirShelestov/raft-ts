export type NodeId = string;
export type Term = number;
export type LogIndex = number;

export const Role = {
  Follower: "follower",
  Candidate: "candidate",
  Leader: "leader",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export interface LogEntry {
  readonly term: Term;
  readonly command: unknown;
}
