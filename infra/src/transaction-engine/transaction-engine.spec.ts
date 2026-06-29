import { BlockhashManager } from '../solana/blockhash-manager';
import {
  AgentDecisionPort,
  BundleBuilderPort,
  LifecycleLogPort,
  SolanaRpcPort,
  StreamPort,
  SubmissionPlannerPort,
  TipOraclePort,
  TransactionBuilderPort,
} from '../core/ports';
import {
  AgentDecision,
  BuiltTransaction,
  LifecycleLogEntry,
} from '../core/types';
import { FailureClassifier } from '../lifecycle/failure-classifier';
import { LifecycleTracker } from '../lifecycle/lifecycle-tracker';
import { SubmissionWindowCoordinator } from '../jito/submission-window';
import { RetryDecisionExecutor } from '../retry/retry-decision-executor';
import { TransactionEngine } from './transaction-engine';

class FinalizedRpc implements SolanaRpcPort {
  async getLatestBlockhash() {
    return {
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 300_000_100,
      fetchedSlot: 100,
      fetchedAt: new Date().toISOString(),
      commitment: 'confirmed' as const,
    };
  }
  async getCurrentSlot() {
    return 100;
  }
  async getCurrentBlockHeight() {
    return 300_000_000;
  }
  async getBalance() {
    return 10_000_000;
  }
  async getSignatureStatus() {
    return {
      slot: 101,
      confirmationStatus: 'finalized' as const,
      err: null,
    };
  }
  async getRecentPrioritizationFees() {
    return [1_000];
  }
  async simulateTransaction() {
    return { err: null, logs: [] };
  }
}

class TimeoutStream implements StreamPort {
  stopCalls = 0;

  async start() {}
  async stop() {
    this.stopCalls += 1;
  }
  getCurrentSlot() {
    return 100;
  }
  async waitForSignatureLifecycle(): Promise<Partial<LifecycleLogEntry>> {
    throw new Error(
      'stream_timeout waiting for signature lifecycle progression',
    );
  }
}

class InMemoryLogs implements LifecycleLogPort {
  entries: LifecycleLogEntry[] = [];
  async appendLifecycle(entry: LifecycleLogEntry) {
    this.entries.push(entry);
  }
  async appendFailure() {}
  async appendAgentDecision() {}
  async readLifecycle() {
    return this.entries;
  }
}

describe('TransactionEngine', () => {
  it('stops the stream when failure handling throws', async () => {
    const rpc = new FinalizedRpc();
    const transaction: BuiltTransaction = {
      signature: 'signature',
      transaction: {},
      serializedTransaction: Buffer.from('transaction'),
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 300_000_100,
    };
    const transactionBuilder: TransactionBuilderPort = {
      buildTransfer: async () => transaction,
      buildTipTransaction: async () => transaction,
    };
    const tipOracle: TipOraclePort = {
      quoteTip: async () => ({
        tipLamports: 1_000,
        tipAccount: '11111111111111111111111111111111',
        source: 'test',
        reason: 'test',
      }),
    };
    const bundleBuilder: BundleBuilderPort = {
      submitUserTransaction: async () => {
        throw new Error('bundle submission failed');
      },
      getBundleStatus: async () => null,
    };
    const planner: SubmissionPlannerPort = {
      plan: async () => ({
        shouldSubmit: true,
        currentSlot: 100,
        waitSlots: 0,
        reason: 'test',
        source: 'mock',
      }),
    };
    const agent: AgentDecisionPort = {
      source: 'rule',
      decide: async () => {
        throw new Error('agent unavailable');
      },
    };
    const stream = new TimeoutStream();
    const engine = new TransactionEngine(
      'devnet',
      rpc,
      new BlockhashManager(rpc),
      transactionBuilder,
      tipOracle,
      bundleBuilder,
      stream,
      new LifecycleTracker(stream, rpc, bundleBuilder, 1_000),
      new SubmissionWindowCoordinator(planner, 1_000),
      new FailureClassifier(),
      new RetryDecisionExecutor(agent, rpc, stream, 0, 3),
      new InMemoryLogs(),
      1,
      false,
    );

    await expect(engine.run({ lamports: 1, maxAttempts: 1 })).rejects.toThrow(
      'agent unavailable',
    );
    expect(stream.stopCalls).toBe(1);
  });

  it('uses RPC only as fallback when Yellowstone times out', async () => {
    const rpc = new FinalizedRpc();
    const transaction: BuiltTransaction = {
      signature: 'signature',
      transaction: {},
      serializedTransaction: Buffer.from('transaction'),
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 300_000_100,
    };
    const transactionBuilder: TransactionBuilderPort = {
      buildTransfer: async () => transaction,
      buildTipTransaction: async () => transaction,
    };
    const tipOracle: TipOraclePort = {
      quoteTip: async () => ({
        tipLamports: 1_000,
        tipAccount: '11111111111111111111111111111111',
        source: 'test',
        reason: 'test',
      }),
    };
    const bundleBuilder: BundleBuilderPort = {
      submitUserTransaction: async () => ({
        bundleId: 'bundle',
        signature: 'signature',
        submittedAt: new Date().toISOString(),
        submittedSlot: 100,
        tipLamports: 1_000,
        tipAccount: '11111111111111111111111111111111',
      }),
      getBundleStatus: async () => ({ status: 'Landed' }),
    };
    const planner: SubmissionPlannerPort = {
      plan: async () => ({
        shouldSubmit: true,
        currentSlot: 100,
        waitSlots: 0,
        reason: 'test',
        source: 'mock',
      }),
    };
    const agent: AgentDecisionPort = {
      source: 'rule',
      decide: async (): Promise<AgentDecision> => ({
        decision: 'abort',
        reason: 'should not be called',
        refreshBlockhash: false,
        tipMultiplier: 1,
        delaySlots: 0,
      }),
    };
    const logs = new InMemoryLogs();
    const stream = new TimeoutStream();
    const engine = new TransactionEngine(
      'devnet',
      rpc,
      new BlockhashManager(rpc),
      transactionBuilder,
      tipOracle,
      bundleBuilder,
      stream,
      new LifecycleTracker(stream, rpc, bundleBuilder, 1_000),
      new SubmissionWindowCoordinator(planner, 1_000),
      new FailureClassifier(),
      new RetryDecisionExecutor(agent, rpc, stream, 0, 3),
      logs,
      1,
      false,
    );

    const result = await engine.run({ lamports: 1, maxAttempts: 1 });

    expect(result.finalStage).toBe('finalized');
    expect(result.attempts.at(-1)).toMatchObject({
      event: 'finalized',
      lifecycleSource: 'rpc_fallback',
    });
  });

  it('reuses the prior blockhash when the agent declines refresh', async () => {
    const rpc = new FinalizedRpc();
    const fresh = jest.fn(async () => ({
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 300_000_100,
      fetchedSlot: 100,
      fetchedAt: new Date().toISOString(),
      commitment: 'confirmed' as const,
    }));
    const blockhashManager = {
      fresh,
      staleForFaultInjection: fresh,
    } as unknown as BlockhashManager;
    const usedBlockhashes: string[] = [];
    const transactionBuilder: TransactionBuilderPort = {
      buildTransfer: async ({ blockhash }) => {
        usedBlockhashes.push(blockhash.blockhash);
        return {
          signature: 'signature',
          transaction: {},
          serializedTransaction: Buffer.from('transaction'),
          blockhash: blockhash.blockhash,
          lastValidBlockHeight: blockhash.lastValidBlockHeight,
        };
      },
      buildTipTransaction: async ({ blockhash }) => ({
        signature: 'tip-signature',
        transaction: {},
        serializedTransaction: Buffer.from('tip'),
        blockhash: blockhash.blockhash,
        lastValidBlockHeight: blockhash.lastValidBlockHeight,
      }),
    };
    const tipOracle: TipOraclePort = {
      quoteTip: async () => ({
        tipLamports: 1_000,
        tipAccount: '11111111111111111111111111111111',
        source: 'test',
        reason: 'test',
      }),
    };
    let submissions = 0;
    const bundleBuilder: BundleBuilderPort = {
      submitUserTransaction: async () => {
        submissions += 1;
        if (submissions === 1) {
          throw new Error('bundle not landed');
        }
        return {
          bundleId: 'bundle',
          signature: 'signature',
          submittedAt: new Date().toISOString(),
          submittedSlot: 100,
          tipLamports: 1_000,
          tipAccount: '11111111111111111111111111111111',
        };
      },
      getBundleStatus: async () => null,
    };
    const stream: StreamPort = {
      start: async () => undefined,
      stop: async () => undefined,
      getCurrentSlot: () => 100,
      waitForSignatureLifecycle: async ({ submittedAt }) => ({
        processedAt: submittedAt,
        processedSlot: 101,
        confirmedAt: submittedAt,
        confirmedSlot: 101,
        finalizedAt: submittedAt,
        finalizedSlot: 101,
        lifecycleSource: 'yellowstone',
      }),
    };
    const planner: SubmissionPlannerPort = {
      plan: async () => ({
        shouldSubmit: true,
        currentSlot: 100,
        waitSlots: 0,
        reason: 'test',
        source: 'mock',
      }),
    };
    const agent: AgentDecisionPort = {
      source: 'rule',
      decide: async () => ({
        decision: 'retry',
        reason: 'reuse blockhash',
        refreshBlockhash: false,
        tipMultiplier: 1,
        delaySlots: 0,
      }),
    };

    const engine = new TransactionEngine(
      'devnet',
      rpc,
      blockhashManager,
      transactionBuilder,
      tipOracle,
      bundleBuilder,
      stream,
      new LifecycleTracker(stream, rpc, bundleBuilder, 1_000),
      new SubmissionWindowCoordinator(planner, 1_000),
      new FailureClassifier(),
      new RetryDecisionExecutor(agent, rpc, stream, 0, 3),
      new InMemoryLogs(),
      1,
      false,
    );

    const result = await engine.run({ lamports: 1, maxAttempts: 2 });

    expect(result.finalStage).toBe('finalized');
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(usedBlockhashes).toHaveLength(2);
    expect(new Set(usedBlockhashes).size).toBe(1);
  });

  it('re-evaluates a hold decision before resubmitting', async () => {
    const rpc = new FinalizedRpc();
    const transaction: BuiltTransaction = {
      signature: 'signature',
      transaction: {},
      serializedTransaction: Buffer.from('transaction'),
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: 300_000_100,
    };
    const transactionBuilder: TransactionBuilderPort = {
      buildTransfer: async () => transaction,
      buildTipTransaction: async () => transaction,
    };
    const tipOracle: TipOraclePort = {
      quoteTip: async () => ({
        tipLamports: 1_000,
        tipAccount: '11111111111111111111111111111111',
        source: 'test',
        reason: 'test',
      }),
    };
    let submissions = 0;
    const bundleBuilder: BundleBuilderPort = {
      submitUserTransaction: async () => {
        submissions += 1;
        if (submissions === 1) {
          throw new Error('bundle not landed');
        }
        return {
          bundleId: 'bundle',
          signature: 'signature',
          submittedAt: new Date().toISOString(),
          submittedSlot: 100,
          tipLamports: 1_000,
          tipAccount: '11111111111111111111111111111111',
        };
      },
      getBundleStatus: async () => null,
    };
    const stream: StreamPort = {
      start: async () => undefined,
      stop: async () => undefined,
      getCurrentSlot: () => 100,
      waitForSignatureLifecycle: async ({ submittedAt }) => ({
        processedAt: submittedAt,
        processedSlot: 101,
        confirmedAt: submittedAt,
        confirmedSlot: 101,
        finalizedAt: submittedAt,
        finalizedSlot: 101,
        lifecycleSource: 'yellowstone',
      }),
    };
    const planner: SubmissionPlannerPort = {
      plan: async () => ({
        shouldSubmit: true,
        currentSlot: 100,
        waitSlots: 0,
        reason: 'test',
        source: 'mock',
      }),
    };
    let decisions = 0;
    const agent: AgentDecisionPort = {
      source: 'openai',
      decide: async () => {
        decisions += 1;
        return decisions === 1
          ? {
              decision: 'hold',
              reason: 'wait for fresher slot context',
              refreshBlockhash: false,
              tipMultiplier: 1,
              delaySlots: 0,
            }
          : {
              decision: 'retry',
              reason: 'conditions improved',
              refreshBlockhash: true,
              tipMultiplier: 1.2,
              delaySlots: 0,
            };
      },
    };

    const engine = new TransactionEngine(
      'devnet',
      rpc,
      new BlockhashManager(rpc),
      transactionBuilder,
      tipOracle,
      bundleBuilder,
      stream,
      new LifecycleTracker(stream, rpc, bundleBuilder, 1_000),
      new SubmissionWindowCoordinator(planner, 1_000),
      new FailureClassifier(),
      new RetryDecisionExecutor(agent, rpc, stream, 0, 3),
      new InMemoryLogs(),
      1,
      false,
    );

    const result = await engine.run({ lamports: 1, maxAttempts: 2 });

    expect(result.finalStage).toBe('finalized');
    expect(decisions).toBe(2);
    expect(submissions).toBe(2);
    expect(
      result.attempts.filter((entry) => entry.event === 'agent_decision'),
    ).toHaveLength(2);
  });
});
