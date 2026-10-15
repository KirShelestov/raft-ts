import { RaftLog } from "./raft-log.js";
import type { StateStorage } from "./storage.js";
import type { NodeId, Term } from "./types.js";

export class PersistentState {
  private term: Term;
  private vote: NodeId | null;
  readonly log: RaftLog;

  constructor(private readonly storage: StateStorage) {
    const snapshot = storage.load();
    this.term = snapshot.currentTerm;
    this.vote = snapshot.votedFor;
    this.log = new RaftLog(snapshot.log);
  }

  get currentTerm(): Term {
    return this.term;
  }

  get votedFor(): NodeId | null {
    return this.vote;
  }

  enterTerm(term: Term, votedFor: NodeId | null = null): void {
    if (term <= this.term) {
      throw new RangeError(`Term must increase monotonically: ${this.term} -> ${term}`);
    }
    this.persist(term, votedFor);
  }

  recordVote(candidateId: NodeId): void {
    this.persist(this.term, candidateId);
  }

  private persist(term: Term, votedFor: NodeId | null): void {
    this.storage.save({ currentTerm: term, votedFor, log: this.log.toArray() });
    this.term = term;
    this.vote = votedFor;
  }
}
