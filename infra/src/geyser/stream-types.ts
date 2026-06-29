export type SlotCommitmentStatus =
  | 'processed'
  | 'confirmed'
  | 'finalized'
  | 'unknown';

export interface NormalizedSlotEvent {
  kind: 'slot';
  slot: number;
  parentSlot: number | null;
  status: SlotCommitmentStatus;
  receivedAt: string;
}

export interface NormalizedTransactionStatusEvent {
  kind: 'transaction_status';
  signature: string;
  slot: number;
  error: unknown;
  receivedAt: string;
}

export type NormalizedGeyserEvent =
  | NormalizedSlotEvent
  | NormalizedTransactionStatusEvent;
