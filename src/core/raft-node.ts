import { setTimeout as delay } from "node:timers/promises";
import { LeaderState } from "./leader-state.js";
import { silentLogger, type Logger } from "./logger.js";
import type {
  AppendEntriesArgs,
  AppendEntriesResult,
  RequestVoteArgs,
  RequestVoteResult,
} from "./messages.js";
import { PersistentState } from "./persistent-state.js";
import { isAtLeastAsUpToDate } from "./raft-log.js";
import type { NodeStatus } from "./status.js";
import type { StateStorage } from "./storage.js";
import { ElectionTimer, HeartbeatTimer } from "./timers.js";
import { assertValidTiming, defaultTiming, type RaftTiming } from "./timing.js";
import type { RaftTransport } from "./transport.js";
import { Role, type LogIndex, type NodeId, type Term } from "./types.js";

export interface RaftNodeOptions {
  readonly id: NodeId;
  readonly peers: readonly NodeId[];
  readonly storage: StateStorage;
  readonly transport: RaftTransport;
  readonly timing?: RaftTiming;
  readonly logger?: Logger;
  readonly random?: () => number;
}

export class RaftNode {
  readonly id: NodeId;
  private readonly peers: readonly NodeId[];
  private readonly transport: RaftTransport;
  private readonly timing: RaftTiming;
  private readonly logger: Logger;
  private readonly state: PersistentState;
  private readonly electionTimer: ElectionTimer;
  private readonly heartbeatTimer: HeartbeatTimer;

  private running = false;
  private role: Role = Role.Follower;
  private leaderId: NodeId | null = null;
  private commitIndex: LogIndex = 0;
  private lastApplied: LogIndex = 0;
  private leaderState: LeaderState | null = null;
  private votesReceived = new Set<NodeId>();

  constructor(options: RaftNodeOptions) {
    if (options.peers.includes(options.id)) {
      throw new Error(`Node ${options.id} must not be listed among its own peers`);
    }
    if (new Set(options.peers).size !== options.peers.length) {
      throw new Error("Peer ids must be unique");
    }
    this.id = options.id;
    this.peers = [...options.peers];
    this.transport = options.transport;
    this.timing = options.timing ?? defaultTiming;
    assertValidTiming(this.timing);
    this.logger = options.logger ?? silentLogger;
    this.state = new PersistentState(options.storage);
    this.electionTimer = new ElectionTimer(
      this.timing.electionTimeoutMinMs,
      this.timing.electionTimeoutMaxMs,
      () => this.onElectionTimeout(),
      options.random,
    );
    this.heartbeatTimer = new HeartbeatTimer(this.timing.heartbeatIntervalMs, () => this.sendHeartbeats());
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.role = Role.Follower;
    this.leaderId = null;
    this.commitIndex = 0;
    this.lastApplied = 0;
    this.leaderState = null;
    this.votesReceived.clear();
    this.logger.info(`started as follower in term ${this.state.currentTerm}`);
    this.electionTimer.reset();
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.electionTimer.stop();
    this.heartbeatTimer.stop();
    this.logger.info("stopped");
  }

  status(): NodeStatus {
    return {
      id: this.id,
      role: this.role,
      currentTerm: this.state.currentTerm,
      votedFor: this.state.votedFor,
      leaderId: this.leaderId,
      commitIndex: this.commitIndex,
      lastApplied: this.lastApplied,
      lastLogIndex: this.state.log.lastIndex,
      lastLogTerm: this.state.log.lastTerm,
      peers: [...this.peers],
      leaderState: this.leaderState?.snapshot() ?? null,
    };
  }

  handleRequestVote(args: RequestVoteArgs): RequestVoteResult {
    this.observeTerm(args.term);
    if (args.term < this.state.currentTerm) {
      return this.voteResult(false);
    }
    const votedFor = this.state.votedFor;
    const canVote = votedFor === null || votedFor === args.candidateId;
    const candidateLog = { index: args.lastLogIndex, term: args.lastLogTerm };
    if (!canVote || !isAtLeastAsUpToDate(candidateLog, this.state.log.lastPosition())) {
      return this.voteResult(false);
    }
    if (votedFor === null) {
      this.state.recordVote(args.candidateId);
      this.logger.info(`voted for ${args.candidateId} in term ${args.term}`);
    }
    this.resetElectionTimer();
    return this.voteResult(true);
  }

  handleAppendEntries(args: AppendEntriesArgs): AppendEntriesResult {
    this.observeTerm(args.term);
    if (args.term < this.state.currentTerm) {
      return this.appendResult(false);
    }
    if (this.role === Role.Candidate) {
      this.becomeFollower();
    }
    this.recognizeLeader(args.leaderId);
    this.resetElectionTimer();
    const matches = this.state.log.termAt(args.prevLogIndex) === args.prevLogTerm;
    return this.appendResult(matches);
  }

  private observeTerm(term: Term): boolean {
    if (term <= this.state.currentTerm) {
      return false;
    }
    this.logger.info(`observed newer term ${term} (was ${this.state.currentTerm})`);
    this.state.enterTerm(term);
    this.leaderId = null;
    this.becomeFollower();
    return true;
  }

  private onElectionTimeout(): void {
    if (!this.running || this.role === Role.Leader) {
      return;
    }
    if (this.role === Role.Candidate) {
      const quorum = Math.floor((this.peers.length + 1) / 2) + 1;
      this.logger.warn(
        `election in term ${this.state.currentTerm} timed out: received ${this.votesReceived.size}/${quorum} required votes `
        + `(cluster size ${this.peers.length + 1}); no quorum, retrying`,
      );
    }
    this.startElection();
  }

  private startElection(): void {
    this.role = Role.Candidate;
    this.leaderId = null;
    this.state.enterTerm(this.state.currentTerm + 1, this.id);
    this.votesReceived = new Set([this.id]);
    this.resetElectionTimer();
    this.logger.info(`election timeout, became candidate in term ${this.state.currentTerm}`);

    if (this.isMajority(this.votesReceived.size)) {
      this.becomeLeader();
      return;
    }

    const args: RequestVoteArgs = {
      term: this.state.currentTerm,
      candidateId: this.id,
      lastLogIndex: this.state.log.lastIndex,
      lastLogTerm: this.state.log.lastTerm,
    };
    for (const peer of this.peers) {
      void this.requestVote(peer, args);
    }
  }

  private async requestVote(peer: NodeId, args: RequestVoteArgs): Promise<void> {
    while (this.isCandidateIn(args.term)) {
      try {
        const result = await this.transport.requestVote(peer, args);
        this.handleVoteResult(peer, args.term, result);
        return;
      } catch {
        await delay(this.timing.heartbeatIntervalMs);
      }
    }
  }

  private handleVoteResult(peer: NodeId, electionTerm: Term, result: RequestVoteResult): void {
    if (!this.running || this.observeTerm(result.term)) {
      return;
    }
    if (!this.isCandidateIn(electionTerm) || !result.voteGranted) {
      return;
    }
    this.votesReceived.add(peer);
    if (this.isMajority(this.votesReceived.size)) {
      this.becomeLeader();
    }
  }

  private becomeLeader(): void {
    this.role = Role.Leader;
    this.leaderId = this.id;
    this.votesReceived.clear();
    this.leaderState = new LeaderState(this.peers, this.state.log.lastIndex);
    this.electionTimer.stop();
    this.logger.info(`became leader in term ${this.state.currentTerm}`);
    this.heartbeatTimer.start();
  }

  private becomeFollower(): void {
    const previousRole = this.role;
    this.role = Role.Follower;
    this.leaderState = null;
    this.votesReceived.clear();
    this.heartbeatTimer.stop();
    if (previousRole === Role.Leader) {
      this.resetElectionTimer();
    }
    if (previousRole !== Role.Follower) {
      this.logger.info(`stepped down from ${previousRole} to follower in term ${this.state.currentTerm}`);
    }
  }

  private recognizeLeader(leaderId: NodeId): void {
    if (this.leaderId !== leaderId) {
      this.leaderId = leaderId;
      this.logger.info(`recognized ${leaderId} as leader of term ${this.state.currentTerm}`);
    }
  }

  private sendHeartbeats(): void {
    for (const peer of this.peers) {
      void this.sendHeartbeat(peer);
    }
  }

  private async sendHeartbeat(peer: NodeId): Promise<void> {
    if (!this.running || this.leaderState === null) {
      return;
    }
    const prevLogIndex = this.leaderState.nextIndexFor(peer) - 1;
    const args: AppendEntriesArgs = {
      term: this.state.currentTerm,
      leaderId: this.id,
      prevLogIndex,
      prevLogTerm: this.state.log.requireTermAt(prevLogIndex),
      entries: [],
      leaderCommit: this.commitIndex,
    };
    let result: AppendEntriesResult;
    try {
      result = await this.transport.appendEntries(peer, args);
    } catch {
      return;
    }
    if (this.running) {
      this.observeTerm(result.term);
    }
  }

  private resetElectionTimer(): void {
    if (this.running) {
      this.electionTimer.reset();
    }
  }

  private isCandidateIn(term: Term): boolean {
    return this.running && this.role === Role.Candidate && this.state.currentTerm === term;
  }

  private isMajority(count: number): boolean {
    return count * 2 > this.peers.length + 1;
  }

  private voteResult(voteGranted: boolean): RequestVoteResult {
    return { term: this.state.currentTerm, voteGranted };
  }

  private appendResult(success: boolean): AppendEntriesResult {
    return { term: this.state.currentTerm, success };
  }
}
