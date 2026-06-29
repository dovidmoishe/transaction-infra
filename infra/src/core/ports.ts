import {
  AgentDecision,
  BlockhashSnapshot,
  BundleSubmission,
  BuiltTransaction,
  CommitmentLevel,
  FailureClass,
  FailureContext,
  LifecycleLogEntry,
  TipQuote,
  SubmissionPlan,
  ComputeBudgetSettings,
} from './types';

export interface SolanaRpcPort {
  getLatestBlockhash(
    commitment: Exclude<CommitmentLevel, 'finalized'>,
  ): Promise<BlockhashSnapshot>;
  getCurrentSlot(): Promise<number>;
  getCurrentBlockHeight(): Promise<number>;
  getBalance(address: string): Promise<number>;
  getSignatureStatus(signature: string): Promise<{
    slot: number | null;
    confirmationStatus: CommitmentLevel | null;
    err: unknown;
  } | null>;
  getRecentPrioritizationFees(): Promise<number[]>;
  simulateTransaction(serializedTransaction: Buffer): Promise<{
    err: unknown;
    logs: string[];
  }>;
}

export interface JitoBundlePort {
  getTipAccounts(): Promise<string[]>;
  getTipFloorLamports(): Promise<number | null>;
  submitBundle(encodedTransactions: string[]): Promise<{
    bundleId: string;
    rawResponse: unknown;
  }>;
  getBundleStatus(bundleId: string): Promise<unknown>;
}

export interface TipOraclePort {
  quoteTip(input: {
    failureClass?: FailureClass | null;
    tipMultiplier?: number;
    priorityFeeMicroLamports?: number | null;
  }): Promise<TipQuote>;
}

export interface TransactionBuilderPort {
  buildTransfer(input: {
    lamports: number;
    blockhash: BlockhashSnapshot;
    staleBlockhash?: boolean;
    computeBudget?: ComputeBudgetSettings;
    memo?: string;
    tipLamports?: number;
    tipAccount?: string;
    tipMemo?: string;
  }): Promise<BuiltTransaction>;
  buildTipTransaction(input: {
    tipLamports: number;
    tipAccount: string;
    blockhash: BlockhashSnapshot;
    memo?: string;
  }): Promise<BuiltTransaction>;
}

export interface StreamPort {
  start(): Promise<void>;
  stop(): Promise<void>;
  getCurrentSlot(): number | null;
  waitForSignatureLifecycle(input: {
    signature: string;
    submittedAt: string;
    submittedSlot: number;
    timeoutMs: number;
  }): Promise<Partial<LifecycleLogEntry>>;
}

export interface LifecycleTrackerPort {
  track(input: {
    signature: string;
    bundleId: string;
    submittedAt: string;
    submittedSlot: number;
  }): Promise<Partial<LifecycleLogEntry>>;
}

export interface LifecycleLogPort {
  appendLifecycle(entry: LifecycleLogEntry): Promise<void>;
  appendFailure(entry: LifecycleLogEntry): Promise<void>;
  appendAgentDecision(entry: LifecycleLogEntry): Promise<void>;
  readLifecycle(runId?: string): Promise<LifecycleLogEntry[]>;
}

export interface FailureClassifierPort {
  classify(input: {
    rawError?: unknown;
    simulationLogs?: string[];
    timedOut?: boolean;
    blockhash?: BlockhashSnapshot | null;
    currentBlockHeight?: number | null;
  }): FailureClass;
}

export interface AgentDecisionPort {
  readonly source: 'rule' | 'openai';
  readonly model?: string;
  decide(context: FailureContext): Promise<AgentDecision>;
}

export interface BundleBuilderPort {
  submitUserTransaction(input: {
    userTransaction: BuiltTransaction;
    tipTransaction: BuiltTransaction;
    tipQuote: TipQuote;
    submittedSlot: number;
  }): Promise<BundleSubmission>;
  getBundleStatus(bundleId: string): Promise<unknown>;
}

export interface SubmissionPlannerPort {
  plan(): Promise<SubmissionPlan>;
}

export interface SubmissionWindowPort {
  waitForWindow(): Promise<SubmissionPlan>;
}

export interface RetryDecisionExecutorPort {
  readonly source: 'rule' | 'openai';
  readonly model?: string;
  resolve(
    context: FailureContext,
    onDecision: (decision: AgentDecision) => Promise<void>,
  ): Promise<{
    decision: AgentDecision;
    holdCycles: number;
    holdLimitReached: boolean;
    retryDelayMs: number;
  }>;
}
