import { randomUUID } from 'node:crypto';
import {
  BundleBuilderPort,
  FailureClassifierPort,
  LifecycleTrackerPort,
  LifecycleLogPort,
  RetryDecisionExecutorPort,
  SolanaRpcPort,
  StreamPort,
  SubmissionWindowPort,
  TipOraclePort,
  TransactionBuilderPort,
} from '../core/ports';
import {
  AgentDecision,
  BlockhashSnapshot,
  BuiltTransaction,
  FailureClass,
  LifecycleLogEntry,
  RunRequest,
  RunResult,
  SubmissionPlan,
  TipQuote,
} from '../core/types';
import { BlockhashManager } from '../solana/blockhash-manager';
import { transactionMemo } from '../solana/transaction-memo';
import { errorMessage, FailureAnalyzer } from './failure-analyzer';
import { LifecycleEntryFactory } from './lifecycle-entry-factory';
import { runRequestSchema } from './run-request-schema';

export class TransactionEngine {
  private readonly entryFactory: LifecycleEntryFactory;
  private readonly failureAnalyzer: FailureAnalyzer;

  constructor(
    private readonly network: 'devnet' | 'mainnet-beta',
    private readonly solanaRpc: SolanaRpcPort,
    private readonly blockhashManager: BlockhashManager,
    private readonly transactionBuilder: TransactionBuilderPort,
    private readonly tipOracle: TipOraclePort,
    private readonly bundleBuilder: BundleBuilderPort,
    private readonly stream: StreamPort,
    private readonly lifecycleTracker: LifecycleTrackerPort,
    private readonly submissionWindow: SubmissionWindowPort,
    private readonly classifier: FailureClassifierPort,
    private readonly retryExecutor: RetryDecisionExecutorPort,
    private readonly logs: LifecycleLogPort,
    private readonly defaultMaxRetries: number,
    private readonly localFaultInjectionOnly: boolean,
  ) {
    this.entryFactory = new LifecycleEntryFactory(network);
    this.failureAnalyzer = new FailureAnalyzer(solanaRpc, classifier);
  }

  async run(request: RunRequest): Promise<RunResult> {
    const validatedRequest = runRequestSchema.parse(request);
    const runId = `run_${Date.now()}_${randomUUID()}`;
    const maxAttempts =
      validatedRequest.maxAttempts ?? this.defaultMaxRetries + 1;
    const attempts: LifecycleLogEntry[] = [];
    let attempt = 1;
    let failureClass: FailureClass | null = null;
    let tipMultiplier = 1;
    let forceExpiredBlockhash =
      validatedRequest.faultInjection === 'expired_blockhash';
    let carriedBlockhash: BlockhashSnapshot | null = null;

    await this.stream.start();

    try {
      while (attempt <= maxAttempts) {
        let submissionPlan: SubmissionPlan | null = null;
        let blockhash: BlockhashSnapshot | null = null;
        let tipQuote: TipQuote | null = null;
        let submittedSlot: number | null = null;
        let userTransaction: BuiltTransaction | null = null;

        try {
          submissionPlan = await this.submissionWindow.waitForWindow();
          blockhash = forceExpiredBlockhash
            ? await this.blockhashManager.staleForFaultInjection()
            : (carriedBlockhash ?? (await this.blockhashManager.fresh()));
          const priorityFeeMicroLamports =
            await this.priorityFeePressureMicroLamports();
          tipQuote = await this.tipOracle.quoteTip({
            failureClass,
            tipMultiplier,
            priorityFeeMicroLamports,
          });
          userTransaction = await this.transactionBuilder.buildTransfer({
            lamports: validatedRequest.lamports,
            blockhash,
            computeBudget: validatedRequest.computeBudget,
            memo: transactionMemo(runId, 'user', attempt),
            tipLamports: tipQuote.tipLamports,
            tipAccount: tipQuote.tipAccount,
            tipMemo: transactionMemo(runId, 'tip', attempt),
          });
          const tipTransaction = userTransaction;

          if (forceExpiredBlockhash && this.localFaultInjectionOnly) {
            throw new Error('Blockhash not found: simulated expired blockhash');
          }

          submittedSlot =
            this.stream.getCurrentSlot() ??
            submissionPlan.currentSlot ??
            (await this.solanaRpc.getCurrentSlot());
          const submission = await this.bundleBuilder.submitUserTransaction({
            userTransaction,
            tipTransaction,
            tipQuote,
            submittedSlot,
          });
          const submittedEntry = this.entryFactory.create({
            event: 'submitted',
            runId,
            attempt,
            bundleId: submission.bundleId,
            signature: submission.signature,
            submittedAt: submission.submittedAt,
            submittedSlot: submission.submittedSlot,
            tipLamports: submission.tipLamports,
            tipAccount: submission.tipAccount,
            tipSource: tipQuote.source,
            tipReason: tipQuote.reason,
            blockhash: userTransaction.blockhash,
            lastValidBlockHeight: userTransaction.lastValidBlockHeight,
            submissionPlan,
          });
          await this.logs.appendLifecycle(submittedEntry);
          attempts.push(submittedEntry);

          const lifecycle = await this.lifecycleTracker.track({
            signature: submission.signature,
            submittedAt: submission.submittedAt,
            bundleId: submission.bundleId,
            submittedSlot: submission.submittedSlot,
          });
          const finalizedEntry = this.entryFactory.create({
            ...submittedEntry,
            ...lifecycle,
            event: 'finalized',
          });
          await this.logs.appendLifecycle(finalizedEntry);
          attempts.push(finalizedEntry);

          return {
            runId,
            finalStage: 'finalized',
            attempts,
          };
        } catch (error) {
          const analysis = await this.failureAnalyzer.analyze({
            error,
            transaction: userTransaction,
            blockhash,
          });
          const classifiedFailure = analysis.failureClass;
          failureClass = classifiedFailure;
          const failureEntry = this.entryFactory.failure({
            runId,
            attempt,
            blockhash,
            tipLamports: tipQuote?.tipLamports ?? null,
            tipAccount: tipQuote?.tipAccount ?? null,
            tipSource: tipQuote?.source ?? null,
            tipReason: tipQuote?.reason ?? null,
            submittedSlot,
            failureClass: classifiedFailure,
            rawError: error,
            submissionPlan,
            simulationLogs: analysis.simulationLogs,
          });
          await this.logs.appendLifecycle(failureEntry);
          await this.logs.appendFailure(failureEntry);
          attempts.push(failureEntry);

          const failureContext = {
            runId,
            attempt,
            network: this.network,
            failureClass: classifiedFailure,
            rawError: errorMessage(error),
            submittedSlot,
            currentSlot: this.stream.getCurrentSlot(),
            blockhashFetchedSlot: blockhash?.fetchedSlot,
            lastValidBlockHeight: blockhash?.lastValidBlockHeight,
            tipLamports: tipQuote?.tipLamports,
            simulationLogs: analysis.simulationLogs ?? undefined,
            recentLifecycleTimings: attempts.slice(-5),
            recentFailedAttempts: attempts.filter(
              (entry) => entry.failureClass,
            ),
          };
          const retryResult = await this.retryExecutor.resolve(
            failureContext,
            (decision) =>
              this.recordAgentDecision(
                runId,
                attempt,
                classifiedFailure,
                decision,
                attempts,
              ),
          );
          const { decision, holdCycles } = retryResult;

          if (
            decision.decision === 'abort' ||
            decision.decision === 'hold' ||
            attempt === maxAttempts
          ) {
            const abortedEntry = this.entryFactory.create({
              event: 'aborted',
              runId,
              attempt,
              failureClass: classifiedFailure,
              agentDecision: decision,
              agentSource: this.retryExecutor.source,
              agentModel: this.retryExecutor.model,
              rawError:
                decision.decision === 'hold'
                  ? `Hold safety limit reached after ${holdCycles} cycle(s).`
                  : undefined,
            });
            await this.logs.appendLifecycle(abortedEntry);
            attempts.push(abortedEntry);
            return {
              runId,
              finalStage: 'aborted',
              attempts,
            };
          }

          if (retryResult.retryDelayMs > 0) {
            await delay(retryResult.retryDelayMs);
          }

          tipMultiplier = decision.tipMultiplier;
          carriedBlockhash = decision.refreshBlockhash ? null : blockhash;
          forceExpiredBlockhash = false;
          attempt += 1;
        }
      }

      return {
        runId,
        finalStage: 'aborted',
        attempts,
      };
    } finally {
      await this.stream.stop();
    }
  }

  private async recordAgentDecision(
    runId: string,
    attempt: number,
    failureClass: FailureClass,
    decision: AgentDecision,
    attempts: LifecycleLogEntry[],
  ) {
    const decisionEntry = this.entryFactory.create({
      event: 'agent_decision',
      runId,
      attempt,
      failureClass,
      agentDecision: decision,
      agentSource: this.retryExecutor.source,
      agentModel: this.retryExecutor.model,
    });
    await this.logs.appendLifecycle(decisionEntry);
    await this.logs.appendAgentDecision(decisionEntry);
    attempts.push(decisionEntry);
  }

  private async priorityFeePressureMicroLamports(): Promise<number | null> {
    const fees = await this.solanaRpc.getRecentPrioritizationFees();
    if (fees.length === 0) {
      return null;
    }

    const sorted = [...fees].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75));
    return sorted[index];
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
