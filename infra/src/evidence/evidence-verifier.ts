import { LifecycleLogEntry } from '../core/types';
import {
  agentDecisionFilesMatch,
  failureFilesMatch,
  findAutonomousExpiredRetryRuns,
  hasCompleteFinalizedProof,
  hasValidLifecycleProgression,
} from './proof-validation';

export interface EvidenceSummary {
  lifecycleEntries: number;
  finalizedEntries: number;
  uniqueFinalizedRuns: number;
  uniqueFinalizedSignatures: number;
  uniqueFinalizedBundles: number;
  failureEntries: number;
  uniqueFailureRuns: number;
  expiredBlockhashFailures: number;
  agentDecisionEntries: number;
  openAiDecisionEntries: number;
  yellowstoneFinalizedEntries: number;
  incompleteFinalizedEntries: number;
  invalidLifecycleEntries: number;
  mockSubmissionPlanEntries: number;
  mockBundleEntries: number;
  autonomousExpiredRetryRuns: number;
  failureFileEntries: number;
  agentDecisionFileEntries: number;
  requireLive: boolean;
}

export interface EvidenceAudit {
  summary: EvidenceSummary;
  problems: string[];
}

export function auditEvidence(input: {
  lifecycle: LifecycleLogEntry[];
  failures: LifecycleLogEntry[];
  agentDecisions: LifecycleLogEntry[];
  requireLive: boolean;
}): EvidenceAudit {
  const finalized = input.lifecycle.filter(
    (entry) => entry.event === 'finalized',
  );
  const failures = input.lifecycle.filter((entry) => entry.event === 'failed');
  const agentDecisions = input.lifecycle.filter(
    (entry) => entry.event === 'agent_decision',
  );
  const openAiDecisions = agentDecisions.filter(
    (entry) => entry.agentSource === 'openai',
  );
  const expiredFailures = failures.filter(
    (entry) => entry.failureClass === 'expired_blockhash',
  );
  const yellowstoneFinalized = finalized.filter(
    (entry) => entry.lifecycleSource === 'yellowstone',
  );
  const incompleteFinalized = finalized.filter(
    (entry) => !hasCompleteFinalizedProof(entry),
  );
  const invalidLifecycle = finalized.filter(
    (entry) => !hasValidLifecycleProgression(entry),
  );
  const mockSubmissionPlans = finalized.filter(
    (entry) => entry.submissionPlan?.source === 'mock',
  );
  const mockBundles = input.lifecycle.filter((entry) =>
    entry.bundleId?.startsWith('mock_bundle_'),
  );
  const uniqueFinalizedRuns = new Set(finalized.map((entry) => entry.runId));
  const uniqueFailureRuns = new Set(failures.map((entry) => entry.runId));
  const uniqueFinalizedSignatures = new Set(
    finalized.flatMap((entry) => (entry.signature ? [entry.signature] : [])),
  );
  const uniqueFinalizedBundles = new Set(
    finalized.flatMap((entry) => (entry.bundleId ? [entry.bundleId] : [])),
  );
  const autonomousExpiredRetryRuns = findAutonomousExpiredRetryRuns(
    input.lifecycle,
  );

  const summary: EvidenceSummary = {
    lifecycleEntries: input.lifecycle.length,
    finalizedEntries: finalized.length,
    uniqueFinalizedRuns: uniqueFinalizedRuns.size,
    uniqueFinalizedSignatures: uniqueFinalizedSignatures.size,
    uniqueFinalizedBundles: uniqueFinalizedBundles.size,
    failureEntries: failures.length,
    uniqueFailureRuns: uniqueFailureRuns.size,
    expiredBlockhashFailures: expiredFailures.length,
    agentDecisionEntries: agentDecisions.length,
    openAiDecisionEntries: openAiDecisions.length,
    yellowstoneFinalizedEntries: yellowstoneFinalized.length,
    incompleteFinalizedEntries: incompleteFinalized.length,
    invalidLifecycleEntries: invalidLifecycle.length,
    mockSubmissionPlanEntries: mockSubmissionPlans.length,
    mockBundleEntries: mockBundles.length,
    autonomousExpiredRetryRuns: autonomousExpiredRetryRuns.size,
    failureFileEntries: input.failures.length,
    agentDecisionFileEntries: input.agentDecisions.length,
    requireLive: input.requireLive,
  };

  const problems: string[] = [];
  if (uniqueFinalizedRuns.size < 10) {
    problems.push('Need at least 10 finalized runs.');
  }
  if (uniqueFailureRuns.size < 2) {
    problems.push('Need failures in at least 2 distinct runs.');
  }
  if (expiredFailures.length < 1) {
    problems.push('Need at least 1 expired-blockhash failure.');
  }
  if (agentDecisions.length < 1) {
    problems.push('Need at least 1 agent decision.');
  }
  if (!failureFilesMatch(failures, input.failures)) {
    problems.push('failures.jsonl is inconsistent with lifecycle.jsonl.');
  }
  if (!agentDecisionFilesMatch(agentDecisions, input.agentDecisions)) {
    problems.push(
      'agent-decisions.jsonl is inconsistent with lifecycle.jsonl.',
    );
  }

  if (input.requireLive) {
    if (mockBundles.length > 0) {
      problems.push('Live verification cannot include mock bundle ids.');
    }
    if (mockSubmissionPlans.length > 0) {
      problems.push('Live verification cannot include mock submission plans.');
    }
    if (openAiDecisions.length < 1) {
      problems.push(
        'Live verification requires at least 1 OpenAI-owned decision.',
      );
    }
    if (autonomousExpiredRetryRuns.size < 1) {
      problems.push(
        'Live verification requires a model-attributed OpenAI retry with blockhash refresh followed by finalization in the same expired-blockhash run.',
      );
    }
    if (yellowstoneFinalized.length < 7) {
      problems.push(
        'Live verification requires at least 7 Yellowstone-proven finalized runs.',
      );
    }
    if (incompleteFinalized.length > 0) {
      problems.push('Live finalized entries contain missing proof fields.');
    }
    if (invalidLifecycle.length > 0) {
      problems.push(
        'Live finalized entries contain non-monotonic slots, timestamps, or incorrect latency deltas.',
      );
    }
    if (uniqueFinalizedSignatures.size < uniqueFinalizedRuns.size) {
      problems.push('Live verification requires a unique signature per run.');
    }
    if (uniqueFinalizedBundles.size < uniqueFinalizedRuns.size) {
      problems.push('Live verification requires a unique bundle id per run.');
    }
  }

  return { summary, problems };
}
