import bs58 from 'bs58';
import { normalizeYellowstoneUpdate } from './update-normalizer';

describe('normalizeYellowstoneUpdate', () => {
  it('normalizes slot and transaction status payloads', () => {
    const signature = Uint8Array.from(
      Array.from({ length: 64 }, (_, index) => index + 1),
    );

    expect(
      normalizeYellowstoneUpdate({
        filters: [],
        slot: { slot: '42', parent: '41', status: 1 },
        transactionStatus: {
          signature,
          slot: '42',
          isVote: false,
          index: '0',
          err: undefined,
        },
        createdAt: new Date('2026-06-23T00:00:00.000Z'),
      }),
    ).toEqual([
      {
        kind: 'slot',
        slot: 42,
        parentSlot: 41,
        status: 'confirmed',
        receivedAt: '2026-06-23T00:00:00.000Z',
      },
      {
        kind: 'transaction_status',
        signature: bs58.encode(signature),
        slot: 42,
        error: null,
        receivedAt: '2026-06-23T00:00:00.000Z',
      },
    ]);
  });
});
