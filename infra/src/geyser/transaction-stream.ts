import { Duplex } from 'node:stream';
import type {
  SubscribeRequest,
  SubscribeUpdate,
} from '@triton-one/yellowstone-grpc';
import { LifecycleLogEntry } from '../core/types';
import { YellowstoneGrpcClient } from './client-types';
import {
  applyLifecycleUpdate,
  emptyLifecycleState,
  isLifecycleComplete,
  lifecycleResult,
  YellowstoneLifecycleState,
} from './lifecycle-state';
import { openYellowstoneSubscription } from './subscription';

export { emptyLifecycleState } from './lifecycle-state';
export type { YellowstoneLifecycleState } from './lifecycle-state';

export class YellowstoneTransactionStream {
  async waitForLifecycle(input: {
    client: YellowstoneGrpcClient;
    signature: string;
    submittedAt: string;
    submittedSlot: number;
    timeoutMs: number;
    commitment: unknown;
  }): Promise<Partial<LifecycleLogEntry>> {
    const state = emptyLifecycleState();
    const request = this.subscriptionRequest(
      input.signature,
      input.commitment,
      input.submittedSlot,
    );

    return new Promise<Partial<LifecycleLogEntry>>((resolve, reject) => {
      let stream: Duplex | null = null;
      let reconnectTimer: NodeJS.Timeout | null = null;
      let reconnectAttempts = 0;
      let settled = false;

      const destroyStream = () => {
        stream?.removeAllListeners();
        stream?.destroy();
        stream = null;
      };
      const cleanup = () => {
        settled = true;
        clearTimeout(timeout);
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        destroyStream();
      };
      const fail = (error: unknown) => {
        if (settled) {
          return;
        }
        cleanup();
        reject(asError(error));
      };
      const reconnect = () => {
        if (settled || reconnectTimer) {
          return;
        }
        destroyStream();
        const backoffMs = Math.min(250 * 2 ** reconnectAttempts, 2_000);
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          void openStream();
        }, backoffMs);
      };
      const timeout = setTimeout(() => {
        fail(
          new Error(
            `stream_timeout waiting for ${input.signature} lifecycle progression`,
          ),
        );
      }, input.timeoutMs);

      const openStream = async () => {
        if (settled) {
          return;
        }
        try {
          const openedStream = await openYellowstoneSubscription(
            input.client,
            request,
          );
          if (settled) {
            openedStream.destroy();
            return;
          }
          stream = openedStream;
          reconnectAttempts = 0;
          let interrupted = false;
          const handleInterruption = () => {
            if (interrupted || stream !== openedStream) {
              return;
            }
            interrupted = true;
            reconnect();
          };

          openedStream.on('error', handleInterruption);
          openedStream.on('end', handleInterruption);
          openedStream.on('close', handleInterruption);
          openedStream.on('data', (update: SubscribeUpdate) => {
            try {
              applyLifecycleUpdate(update, input.signature, state);
              if (isLifecycleComplete(state)) {
                const result = lifecycleResult(state, input.submittedAt);
                cleanup();
                resolve(result);
              }
            } catch (error) {
              fail(error);
            }
          });
        } catch {
          reconnect();
        }
      };

      void openStream();
    });
  }

  subscriptionRequestForTest(
    signature: string,
    commitment: unknown,
    fromSlot?: number,
  ): SubscribeRequest {
    return this.subscriptionRequest(signature, commitment, fromSlot);
  }

  applyUpdateForTest(
    update: SubscribeUpdate,
    signature: string,
    state: YellowstoneLifecycleState,
  ) {
    applyLifecycleUpdate(update, signature, state);
  }

  private subscriptionRequest(
    signature: string,
    commitment: unknown,
    fromSlot?: number,
  ): SubscribeRequest {
    return {
      accounts: {},
      slots: {
        lifecycle_slots: {
          filterByCommitment: true,
          interslotUpdates: false,
        },
      },
      transactions: {},
      transactionsStatus: {
        tracked_signature: {
          vote: false,
          failed: undefined,
          signature,
          accountInclude: [],
          accountExclude: [],
          accountRequired: [],
        },
      },
      blocks: {},
      blocksMeta: {},
      entry: {},
      commitment: commitment as SubscribeRequest['commitment'],
      accountsDataSlice: [],
      ping: undefined,
      fromSlot: fromSlot?.toString(),
    };
  }
}

function asError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Yellowstone lifecycle stream failed', { cause: error });
}
