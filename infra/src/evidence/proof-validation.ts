import { LifecycleLogEntry } from '../core/types';

export function hasCompleteFinalizedProof(entry: LifecycleLogEntry): boolean {
  return Boolean(
    entry.bundleId &&
    entry.signature &&
    entry.submittedSlot !== null &&
    entry.submittedSlot !== undefined &&
    entry.processedSlot !== null &&
    entry.processedSlot !== undefined &&
    entry.confirmedSlot !== null &&
    entry.confirmedSlot !== undefined &&
    entry.finalizedSlot !== null &&
    entry.finalizedSlot !== undefined &&
    entry.submittedAt &&
    entry.processedAt &&
    entry.confirmedAt &&
    entry.finalizedAt &&
    entry.tipLamports &&
    entry.tipLamports > 0 &&
    entry.tipAccount &&
    entry.blockhash &&
    entry.lastValidBlockHeight !== null &&
    entry.lastValidBlockHeight !== undefined &&
    entry.lifecycleSource,
  );
}

export function hasValidLifecycleProgression(
  entry: LifecycleLogEntry,
): boolean {
  if (!hasCompleteFinalizedProof(entry)) {
    return false;
  }

  const slots = [
    entry.submittedSlot!,
    entry.processedSlot!,
    entry.confirmedSlot!,
    entry.finalizedSlot!,
  ];
  const times = [
    Date.parse(entry.submittedAt!),
    Date.parse(entry.processedAt!),
    Date.parse(entry.confirmedAt!),
    Date.parse(entry.finalizedAt!),
  ];
  if (
    times.some((time) => !Number.isFinite(time)) ||
    !isMonotonic(slots) ||
    !isMonotonic(times)
  ) {
    return false;
  }

  return (
    entry.submittedToProcessedMs === times[1] - times[0] &&
    entry.processedToConfirmedMs === times[2] - times[1] &&
    entry.confirmedToFinalizedMs === times[3] - times[2] &&
    entry.totalLifecycleMs === times[3] - times[0]
  );
}

export function findAutonomousExpiredRetryRuns(
  entries: LifecycleLogEntry[],
): Set<string> {
  const runIds = new Set(entries.map((entry) => entry.runId));
  const provenRuns = new Set<string>();

  for (const runId of runIds) {
    const runEntries = entries.filter((entry) => entry.runId === runId);
    const expiredFailures = runEntries.filter(
      (entry) =>
        entry.event === 'failed' && entry.failureClass === 'expired_blockhash',
    );
    const openAiRetries = runEntries.filter(
      (entry) =>
        entry.event === 'agent_decision' &&
        entry.failureClass === 'expired_blockhash' &&
        entry.agentSource === 'openai' &&
        Boolean(entry.agentModel) &&
        entry.agentDecision?.decision === 'retry' &&
        entry.agentDecision.refreshBlockhash,
    );

    if (
      expiredFailures.some((failure) =>
        openAiRetries.some(
          (decision) =>
            decision.attempt === failure.attempt &&
            runEntries.some(
              (entry) =>
                entry.event === 'finalized' &&
                entry.attempt > decision.attempt &&
                Boolean(
                  entry.blockhash &&
                  failure.blockhash &&
                  entry.blockhash !== failure.blockhash,
                ) &&
                (entry.tipLamports ?? 0) > 0,
            ),
        ),
      )
    ) {
      provenRuns.add(runId);
    }
  }

  return provenRuns;
}

export function failureFilesMatch(
  expected: LifecycleLogEntry[],
  actual: LifecycleLogEntry[],
): boolean {
  return sameEventMultiset(expected, actual, failureIdentity);
}

export function agentDecisionFilesMatch(
  expected: LifecycleLogEntry[],
  actual: LifecycleLogEntry[],
): boolean {
  return sameEventMultiset(expected, actual, agentDecisionIdentity);
}

function isMonotonic(values: number[]): boolean {
  return values.every(
    (value, index) => index === 0 || value >= values[index - 1],
  );
}

function sameEventMultiset(
  expected: LifecycleLogEntry[],
  actual: LifecycleLogEntry[],
  identity: (entry: LifecycleLogEntry) => string,
): boolean {
  const counts = new Map<string, number>();
  for (const entry of expected) {
    const key = identity(entry);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const entry of actual) {
    const key = identity(entry);
    const count = counts.get(key) ?? 0;
    if (count === 0) {
      return false;
    }
    counts.set(key, count - 1);
  }
  return (
    expected.length === actual.length &&
    [...counts.values()].every((count) => count === 0)
  );
}

function failureIdentity(entry: LifecycleLogEntry): string {
  return JSON.stringify([
    entry.event,
    entry.runId,
    entry.attempt,
    entry.failureClass,
    entry.blockhash,
  ]);
}

function agentDecisionIdentity(entry: LifecycleLogEntry): string {
  return JSON.stringify([
    entry.event,
    entry.runId,
    entry.attempt,
    entry.failureClass,
    entry.agentSource,
    entry.agentModel,
    entry.agentDecision,
  ]);
}
