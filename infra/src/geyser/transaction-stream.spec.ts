import bs58 from 'bs58';
import { PassThrough } from 'node:stream';
import {
  emptyLifecycleState,
  YellowstoneTransactionStream,
} from './transaction-stream';

describe('YellowstoneTransactionStream', () => {
  it('reconnects with replay and preserves lifecycle state', async () => {
    const signatureBytes = Uint8Array.from(
      Array.from({ length: 64 }, (_, i) => i + 1),
    );
    const signature = bs58.encode(signatureBytes);
    const first = new PassThrough({ objectMode: true });
    const second = new PassThrough({ objectMode: true });
    let subscribeCalls = 0;
    const client = {
      connect: async () => undefined,
      getSlot: async () => ({ slot: 123 }),
      subscribe: async () => {
        subscribeCalls += 1;
        if (subscribeCalls === 1) {
          setTimeout(() => first.emit('error', new Error('disconnect')), 5);
          return first;
        }
        queueMicrotask(() => {
          second.write({
            filters: [],
            transactionStatus: {
              signature: signatureBytes,
              slot: '123',
              isVote: false,
              index: '0',
              err: undefined,
            },
            createdAt: new Date('2026-06-23T00:00:00.100Z'),
          });
          second.write({
            filters: [],
            slot: { slot: '123', status: 1 },
            createdAt: new Date('2026-06-23T00:00:00.200Z'),
          });
          second.write({
            filters: [],
            slot: { slot: '123', status: 2 },
            createdAt: new Date('2026-06-23T00:00:00.300Z'),
          });
        });
        return second;
      },
    };
    const stream = new YellowstoneTransactionStream();

    await expect(
      stream.waitForLifecycle({
        client,
        signature,
        submittedAt: '2026-06-23T00:00:00.000Z',
        submittedSlot: 122,
        timeoutMs: 2_000,
        commitment: 0,
      }),
    ).resolves.toMatchObject({
      processedSlot: 123,
      confirmedSlot: 123,
      finalizedSlot: 123,
      lifecycleSource: 'yellowstone',
    });
    expect(subscribeCalls).toBe(2);
  });

  it('replays signature tracking from the recorded submission slot', () => {
    const stream = new YellowstoneTransactionStream();

    const request = stream.subscriptionRequestForTest('signature', 0, 123);

    expect(request.fromSlot).toBe('123');
    expect(request.transactionsStatus.tracked_signature.signature).toBe(
      'signature',
    );
  });

  it('maps transaction status and slot commitment updates into lifecycle state', () => {
    const signatureBytes = Uint8Array.from(
      Array.from({ length: 64 }, (_, i) => i + 1),
    );
    const signature = bs58.encode(signatureBytes);
    const stream = new YellowstoneTransactionStream();
    const state = emptyLifecycleState();

    stream.applyUpdateForTest(
      {
        filters: [],
        transactionStatus: {
          signature: signatureBytes,
          slot: '123',
          isVote: false,
          index: '0',
          err: undefined,
        },
        createdAt: new Date('2026-06-23T00:00:00.000Z'),
      },
      signature,
      state,
    );
    stream.applyUpdateForTest(
      {
        filters: [],
        slot: {
          slot: '123',
          status: 1,
        },
        createdAt: new Date('2026-06-23T00:00:01.000Z'),
      },
      signature,
      state,
    );
    stream.applyUpdateForTest(
      {
        filters: [],
        slot: {
          slot: '123',
          status: 2,
        },
        createdAt: new Date('2026-06-23T00:00:02.000Z'),
      },
      signature,
      state,
    );

    expect(state).toMatchObject({
      processedSlot: 123,
      confirmedSlot: 123,
      finalizedSlot: 123,
      targetSlot: 123,
      processedAt: '2026-06-23T00:00:00.000Z',
      confirmedAt: '2026-06-23T00:00:01.000Z',
      finalizedAt: '2026-06-23T00:00:02.000Z',
    });
  });

  it('retroactively finalizes a transaction slot when a descendant finalizes', () => {
    const signatureBytes = Uint8Array.from(
      Array.from({ length: 64 }, (_, i) => i + 1),
    );
    const signature = bs58.encode(signatureBytes);
    const stream = new YellowstoneTransactionStream();
    const state = emptyLifecycleState();

    stream.applyUpdateForTest(
      {
        filters: [],
        transactionStatus: {
          signature: signatureBytes,
          slot: '123',
          isVote: false,
          index: '0',
          err: undefined,
        },
        createdAt: new Date('2026-06-23T00:00:00.000Z'),
      },
      signature,
      state,
    );
    stream.applyUpdateForTest(
      {
        filters: [],
        slot: { slot: '124', parent: '123', status: 1 },
        createdAt: new Date('2026-06-23T00:00:01.000Z'),
      },
      signature,
      state,
    );
    stream.applyUpdateForTest(
      {
        filters: [],
        slot: { slot: '125', parent: '124', status: 2 },
        createdAt: new Date('2026-06-23T00:00:02.000Z'),
      },
      signature,
      state,
    );

    expect(state).toMatchObject({
      confirmedSlot: 123,
      finalizedSlot: 123,
      confirmedAt: '2026-06-23T00:00:01.000Z',
      finalizedAt: '2026-06-23T00:00:02.000Z',
    });
  });
});
