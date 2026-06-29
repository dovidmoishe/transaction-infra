import type { SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import { LifecycleLogEntry } from '../core/types';
import { normalizeYellowstoneUpdate } from './update-normalizer';

export interface YellowstoneLifecycleState {
  processedAt: string | null;
  confirmedAt: string | null;
  finalizedAt: string | null;
  processedSlot: number | null;
  confirmedSlot: number | null;
  finalizedSlot: number | null;
  targetSlot: number | null;
  slotParents: Map<number, number>;
}

export function emptyLifecycleState(): YellowstoneLifecycleState {
  return {
    processedAt: null,
    confirmedAt: null,
    finalizedAt: null,
    processedSlot: null,
    confirmedSlot: null,
    finalizedSlot: null,
    targetSlot: null,
    slotParents: new Map(),
  };
}

export function applyLifecycleUpdate(
  update: SubscribeUpdate,
  signature: string,
  state: YellowstoneLifecycleState,
) {
  for (const event of normalizeYellowstoneUpdate(update)) {
    if (event.kind === 'slot') {
      if (event.parentSlot !== null) {
        state.slotParents.set(event.slot, event.parentSlot);
        trimSlotParents(state.slotParents);
      }
      if (state.targetSlot !== null) {
        const commitsTarget =
          event.slot === state.targetSlot ||
          isDescendantOf(event.slot, state.targetSlot, state.slotParents);
        if (
          commitsTarget &&
          event.status === 'confirmed' &&
          !state.confirmedAt
        ) {
          state.confirmedAt = event.receivedAt;
          state.confirmedSlot = state.targetSlot;
        }
        if (
          commitsTarget &&
          event.status === 'finalized' &&
          !state.finalizedAt
        ) {
          state.confirmedAt ??= event.receivedAt;
          state.confirmedSlot ??= state.targetSlot;
          state.finalizedAt = event.receivedAt;
          state.finalizedSlot = state.targetSlot;
        }
      }
      continue;
    }

    if (event.signature !== signature) {
      continue;
    }
    if (event.error) {
      throw new Error(
        `transaction_failed ${signature}: ${JSON.stringify(event.error)}`,
      );
    }
    state.targetSlot = event.slot;
    if (!state.processedAt) {
      state.processedAt = event.receivedAt;
      state.processedSlot = event.slot;
    }
  }
}

export function isLifecycleComplete(state: YellowstoneLifecycleState): boolean {
  return Boolean(state.processedAt && state.confirmedAt && state.finalizedAt);
}

export function lifecycleResult(
  state: YellowstoneLifecycleState,
  submittedAt: string,
): Partial<LifecycleLogEntry> {
  const submittedAtMs = Date.parse(submittedAt);
  return {
    processedAt: state.processedAt,
    processedSlot: state.processedSlot,
    confirmedAt: state.confirmedAt,
    confirmedSlot: state.confirmedSlot,
    finalizedAt: state.finalizedAt,
    finalizedSlot: state.finalizedSlot,
    submittedToProcessedMs: Date.parse(state.processedAt!) - submittedAtMs,
    processedToConfirmedMs:
      Date.parse(state.confirmedAt!) - Date.parse(state.processedAt!),
    confirmedToFinalizedMs:
      Date.parse(state.finalizedAt!) - Date.parse(state.confirmedAt!),
    totalLifecycleMs: Date.parse(state.finalizedAt!) - submittedAtMs,
    lifecycleSource: 'yellowstone',
  };
}

function isDescendantOf(
  slot: number,
  ancestor: number,
  parents: Map<number, number>,
): boolean {
  let cursor = slot;
  const visited = new Set<number>();
  while (!visited.has(cursor)) {
    visited.add(cursor);
    const parent = parents.get(cursor);
    if (parent === undefined) {
      return false;
    }
    if (parent === ancestor) {
      return true;
    }
    cursor = parent;
  }
  return false;
}

function trimSlotParents(parents: Map<number, number>) {
  while (parents.size > 2_048) {
    const oldest = parents.keys().next().value as number | undefined;
    if (oldest === undefined) {
      return;
    }
    parents.delete(oldest);
  }
}
