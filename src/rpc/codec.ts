import type {
  AppendEntriesArgs,
  AppendEntriesResult,
  RequestVoteArgs,
  RequestVoteResult,
} from "../core/messages.js";
import {
  asFields,
  parseLogEntries,
  readBoolean,
  readNodeId,
  readNonNegativeInteger,
} from "../codec/validation.js";

export function parseRequestVoteArgs(value: unknown): RequestVoteArgs {
  const fields = asFields(value, "RequestVote arguments");
  return {
    term: readNonNegativeInteger(fields, "term"),
    candidateId: readNodeId(fields, "candidateId"),
    lastLogIndex: readNonNegativeInteger(fields, "lastLogIndex"),
    lastLogTerm: readNonNegativeInteger(fields, "lastLogTerm"),
  };
}

export function parseRequestVoteResult(value: unknown): RequestVoteResult {
  const fields = asFields(value, "RequestVote result");
  return {
    term: readNonNegativeInteger(fields, "term"),
    voteGranted: readBoolean(fields, "voteGranted"),
  };
}

export function parseAppendEntriesArgs(value: unknown): AppendEntriesArgs {
  const fields = asFields(value, "AppendEntries arguments");
  return {
    term: readNonNegativeInteger(fields, "term"),
    leaderId: readNodeId(fields, "leaderId"),
    prevLogIndex: readNonNegativeInteger(fields, "prevLogIndex"),
    prevLogTerm: readNonNegativeInteger(fields, "prevLogTerm"),
    entries: parseLogEntries(fields["entries"]),
    leaderCommit: readNonNegativeInteger(fields, "leaderCommit"),
  };
}

export function parseAppendEntriesResult(value: unknown): AppendEntriesResult {
  const fields = asFields(value, "AppendEntries result");
  return {
    term: readNonNegativeInteger(fields, "term"),
    success: readBoolean(fields, "success"),
  };
}
