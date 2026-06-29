import {
  BlockhashSnapshot,
  FailureClass,
  LifecycleLogEntry,
  Network,
  nowIso,
} from '../core/types';

export class LifecycleEntryFactory {
  constructor(private readonly network: Network) {}

  create(
    input: Omit<Partial<LifecycleLogEntry>, 'createdAt' | 'network'> & {
      runId: string;
      attempt: number;
      event: LifecycleLogEntry['event'];
    },
  ): LifecycleLogEntry {
    return {
      event: input.event,
      runId: input.runId,
      attempt: input.attempt,
      network: this.network,
      bundleId: input.bundleId ?? null,
      signature: input.signature ?? null,
      submittedAt: input.submittedAt ?? null,
      submittedSlot: input.submittedSlot ?? null,
      processedAt: input.processedAt ?? null,
      processedSlot: input.processedSlot ?? null,
      confirmedAt: input.confirmedAt ?? null,
      confirmedSlot: input.confirmedSlot ?? null,
      finalizedAt: input.finalizedAt ?? null,
      finalizedSlot: input.finalizedSlot ?? null,
      tipLamports: input.tipLamports ?? null,
      tipAccount: input.tipAccount ?? null,
      tipSource: input.tipSource ?? null,
      tipReason: input.tipReason ?? null,
      blockhash: input.blockhash ?? null,
      lastValidBlockHeight: input.lastValidBlockHeight ?? null,
      submittedToProcessedMs: input.submittedToProcessedMs ?? null,
      processedToConfirmedMs: input.processedToConfirmedMs ?? null,
      confirmedToFinalizedMs: input.confirmedToFinalizedMs ?? null,
      totalLifecycleMs: input.totalLifecycleMs ?? null,
      failureClass: input.failureClass ?? null,
      agentDecision: input.agentDecision ?? null,
      agentSource: input.agentSource ?? null,
      agentModel: input.agentModel ?? null,
      submissionPlan: input.submissionPlan ?? null,
      lifecycleSource: input.lifecycleSource ?? null,
      simulationLogs: input.simulationLogs ?? null,
      rawError: input.rawError,
      createdAt: nowIso(),
    };
  }

  failure(input: {
    runId: string;
    attempt: number;
    blockhash: BlockhashSnapshot | null;
    tipLamports: number | null;
    tipAccount: string | null;
    tipSource: string | null;
    tipReason: string | null;
    submittedSlot: number | null;
    failureClass: FailureClass;
    rawError: unknown;
    submissionPlan?: LifecycleLogEntry['submissionPlan'];
    simulationLogs?: string[] | null;
  }): LifecycleLogEntry {
    return this.create({
      event: 'failed',
      runId: input.runId,
      attempt: input.attempt,
      submittedAt: nowIso(),
      submittedSlot: input.submittedSlot,
      tipLamports: input.tipLamports,
      tipAccount: input.tipAccount,
      tipSource: input.tipSource,
      tipReason: input.tipReason,
      blockhash: input.blockhash?.blockhash ?? null,
      lastValidBlockHeight: input.blockhash?.lastValidBlockHeight ?? null,
      failureClass: input.failureClass,
      submissionPlan: input.submissionPlan,
      simulationLogs: input.simulationLogs ?? null,
      rawError:
        input.rawError instanceof Error
          ? { message: input.rawError.message, stack: input.rawError.stack }
          : input.rawError,
    });
  }
}
