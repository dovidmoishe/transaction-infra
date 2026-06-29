export type Network = 'devnet' | 'mainnet-beta';

export type AdapterMode = 'mock' | 'live';

export type CommitmentLevel = 'processed' | 'confirmed' | 'finalized';

export type LifecycleStage =
  | 'submitted'
  | 'processed'
  | 'confirmed'
  | 'finalized'
  | 'failed'
  | 'aborted';

export type FailureClass =
  | 'expired_blockhash'
  | 'fee_or_tip_too_low'
  | 'compute_exceeded'
  | 'bundle_not_landed'
  | 'skipped_leader'
  | 'simulation_failed'
  | 'stream_timeout'
  | 'unknown';

export type AgentDecisionType = 'retry' | 'hold' | 'abort';

export interface BlockhashSnapshot {
  blockhash: string;
  lastValidBlockHeight: number;
  fetchedSlot: number;
  fetchedAt: string;
  commitment: Exclude<CommitmentLevel, 'finalized'>;
}

export interface TipQuote {
  tipLamports: number;
  tipAccount: string;
  source: string;
  reason: string;
}

export interface ComputeBudgetSettings {
  computeUnitLimit?: number;
  computeUnitPriceMicroLamports?: number;
}

export interface BuiltTransaction {
  signature: string;
  transaction: unknown;
  serializedTransaction: Buffer;
  blockhash: string;
  lastValidBlockHeight: number;
}

export interface BundleSubmission {
  bundleId: string;
  signature: string;
  submittedAt: string;
  submittedSlot: number;
  tipLamports: number;
  tipAccount: string;
  rawResponse?: unknown;
}

export interface AgentDecision {
  decision: AgentDecisionType;
  reason: string;
  refreshBlockhash: boolean;
  tipMultiplier: number;
  delaySlots: number;
}

export interface SubmissionPlan {
  shouldSubmit: boolean;
  currentSlot: number;
  nextLeaderSlot?: number | null;
  nextLeaderIdentity?: string | null;
  slotsUntilLeader?: number | null;
  waitSlots: number;
  reason: string;
  source: 'mock' | 'jito_searcher';
}

export interface LifecycleLogEntry {
  event: LifecycleStage | 'agent_decision';
  runId: string;
  attempt: number;
  network: Network;
  bundleId?: string | null;
  signature?: string | null;
  submittedAt?: string | null;
  submittedSlot?: number | null;
  processedAt?: string | null;
  processedSlot?: number | null;
  confirmedAt?: string | null;
  confirmedSlot?: number | null;
  finalizedAt?: string | null;
  finalizedSlot?: number | null;
  tipLamports?: number | null;
  tipAccount?: string | null;
  tipSource?: string | null;
  tipReason?: string | null;
  blockhash?: string | null;
  lastValidBlockHeight?: number | null;
  submittedToProcessedMs?: number | null;
  processedToConfirmedMs?: number | null;
  confirmedToFinalizedMs?: number | null;
  totalLifecycleMs?: number | null;
  failureClass?: FailureClass | null;
  agentDecision?: AgentDecision | null;
  agentSource?: 'rule' | 'openai' | null;
  agentModel?: string | null;
  submissionPlan?: SubmissionPlan | null;
  lifecycleSource?: 'yellowstone' | 'mock' | 'rpc_fallback' | null;
  simulationLogs?: string[] | null;
  rawError?: unknown;
  createdAt: string;
}

export interface FailureContext {
  runId: string;
  attempt: number;
  network: Network;
  failureClass: FailureClass;
  rawError?: unknown;
  submittedSlot?: number | null;
  currentSlot?: number | null;
  blockhashFetchedSlot?: number | null;
  lastValidBlockHeight?: number | null;
  tipLamports?: number | null;
  simulationLogs?: string[];
  recentLifecycleTimings?: Partial<LifecycleLogEntry>[];
  recentFailedAttempts?: Partial<LifecycleLogEntry>[];
}

export interface RunRequest {
  lamports: number;
  faultInjection?: 'expired_blockhash';
  maxAttempts?: number;
  computeBudget?: ComputeBudgetSettings;
}

export interface RunResult {
  runId: string;
  finalStage: LifecycleStage;
  attempts: LifecycleLogEntry[];
}

export const nowIso = () => new Date().toISOString();
