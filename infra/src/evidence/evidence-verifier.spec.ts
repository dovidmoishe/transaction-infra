import { LifecycleLogEntry } from '../core/types';
import { auditEvidence } from './evidence-verifier';

describe('auditEvidence', () => {
  it('requires distinct failure runs and a linked autonomous retry', () => {
    const lifecycle = makeLiveEvidence();
    const failures = lifecycle.filter((entry) => entry.event === 'failed');
    const decisions = lifecycle.filter(
      (entry) => entry.event === 'agent_decision',
    );

    const audit = auditEvidence({
      lifecycle,
      failures,
      agentDecisions: decisions,
      requireLive: true,
    });

    expect(audit.problems).toEqual([]);
    expect(audit.summary).toMatchObject({
      uniqueFinalizedRuns: 10,
      uniqueFailureRuns: 2,
      autonomousExpiredRetryRuns: 1,
      invalidLifecycleEntries: 0,
    });
  });

  it('rejects duplicate proof and disconnected AI decisions', () => {
    const lifecycle = makeLiveEvidence();
    const finalized = lifecycle.filter((entry) => entry.event === 'finalized');
    finalized[1].signature = finalized[0].signature;
    const retryDecision = lifecycle.find(
      (entry) =>
        entry.event === 'agent_decision' &&
        entry.failureClass === 'expired_blockhash',
    )!;
    retryDecision.agentDecision = {
      ...retryDecision.agentDecision!,
      refreshBlockhash: false,
    };

    const audit = auditEvidence({
      lifecycle,
      failures: lifecycle.filter((entry) => entry.event === 'failed'),
      agentDecisions: lifecycle.filter(
        (entry) => entry.event === 'agent_decision',
      ),
      requireLive: true,
    });

    expect(audit.problems).toEqual(
      expect.arrayContaining([
        'Live verification requires a model-attributed OpenAI retry with blockhash refresh followed by finalization in the same expired-blockhash run.',
        'Live verification requires a unique signature per run.',
      ]),
    );
  });
});

function makeLiveEvidence(): LifecycleLogEntry[] {
  const entries: LifecycleLogEntry[] = [];
  for (let index = 0; index < 10; index += 1) {
    const runId = `run-${index}`;
    const retry = index === 0;
    if (index < 2) {
      entries.push(
        entry({
          event: 'failed',
          runId,
          attempt: 1,
          failureClass: retry ? 'expired_blockhash' : 'bundle_not_landed',
          blockhash: retry ? 'expired-blockhash' : `failed-${index}`,
          tipLamports: 1_000,
        }),
      );
    }
    if (retry) {
      entries.push(
        entry({
          event: 'agent_decision',
          runId,
          attempt: 1,
          failureClass: 'expired_blockhash',
          agentSource: 'openai',
          agentModel: 'gpt-test',
          agentDecision: {
            decision: 'retry',
            reason: 'Refresh the expired blockhash.',
            refreshBlockhash: true,
            tipMultiplier: 1.2,
            delaySlots: 0,
          },
        }),
      );
    }

    const attempt = retry ? 2 : 1;
    const submittedAt = new Date(Date.UTC(2026, 5, 23, 0, 0, index)).getTime();
    entries.push(
      entry({
        event: 'finalized',
        runId,
        attempt,
        bundleId: `bundle-${index}`,
        signature: `signature-${index}`,
        submittedAt: new Date(submittedAt).toISOString(),
        submittedSlot: 100 + index * 4,
        processedAt: new Date(submittedAt + 100).toISOString(),
        processedSlot: 101 + index * 4,
        confirmedAt: new Date(submittedAt + 200).toISOString(),
        confirmedSlot: 102 + index * 4,
        finalizedAt: new Date(submittedAt + 300).toISOString(),
        finalizedSlot: 103 + index * 4,
        submittedToProcessedMs: 100,
        processedToConfirmedMs: 100,
        confirmedToFinalizedMs: 100,
        totalLifecycleMs: 300,
        tipLamports: 1_000,
        tipAccount: `tip-${index}`,
        blockhash: `blockhash-${index}`,
        lastValidBlockHeight: 1_000 + index,
        lifecycleSource: index < 7 ? 'yellowstone' : 'rpc_fallback',
        submissionPlan: {
          shouldSubmit: true,
          currentSlot: 100 + index * 4,
          waitSlots: 0,
          reason: 'live',
          source: 'jito_searcher',
        },
      }),
    );
  }
  return entries;
}

function entry(
  overrides: Partial<LifecycleLogEntry> &
    Pick<LifecycleLogEntry, 'event' | 'runId' | 'attempt'>,
): LifecycleLogEntry {
  return {
    network: 'mainnet-beta',
    createdAt: '2026-06-23T00:00:00.000Z',
    ...overrides,
  };
}
