import bs58 from 'bs58';
import type { SubscribeUpdate } from '@triton-one/yellowstone-grpc';
import { nowIso } from '../core/types';
import { NormalizedGeyserEvent, SlotCommitmentStatus } from './stream-types';

export function normalizeYellowstoneUpdate(
  update: SubscribeUpdate,
): NormalizedGeyserEvent[] {
  const receivedAt = update.createdAt?.toISOString() ?? nowIso();
  const events: NormalizedGeyserEvent[] = [];

  if (update.slot) {
    events.push({
      kind: 'slot',
      slot: Number(update.slot.slot),
      parentSlot:
        update.slot.parent === undefined ? null : Number(update.slot.parent),
      status: normalizeSlotStatus(update.slot.status),
      receivedAt,
    });
  }

  if (update.transactionStatus) {
    events.push({
      kind: 'transaction_status',
      signature: bs58.encode(update.transactionStatus.signature),
      slot: Number(update.transactionStatus.slot),
      error: update.transactionStatus.err ?? null,
      receivedAt,
    });
  }

  return events;
}

function normalizeSlotStatus(status: unknown): SlotCommitmentStatus {
  switch (Number(status)) {
    case 0:
      return 'processed';
    case 1:
      return 'confirmed';
    case 2:
      return 'finalized';
    default:
      return 'unknown';
  }
}
