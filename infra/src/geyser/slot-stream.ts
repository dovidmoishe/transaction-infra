import { Duplex } from 'node:stream';
import type {
  SubscribeRequest,
  SubscribeUpdate,
} from '@triton-one/yellowstone-grpc';
import { YellowstoneGrpcClient } from './client-types';
import { openYellowstoneSubscription } from './subscription';
import { normalizeYellowstoneUpdate } from './update-normalizer';

export class YellowstoneSlotStream {
  private currentSlot: number | null = null;
  private stream: Duplex | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  setCurrentSlot(slot: number) {
    this.currentSlot = slot;
  }

  getCurrentSlot(): number | null {
    return this.currentSlot;
  }

  async start(
    client: YellowstoneGrpcClient,
    commitment: unknown,
  ): Promise<void> {
    this.stopping = false;
    await this.open(client, commitment);
  }

  stop() {
    this.stopping = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.destroyStream();
  }

  private async open(
    client: YellowstoneGrpcClient,
    commitment: unknown,
  ): Promise<void> {
    if (this.stopping) {
      return;
    }

    this.destroyStream();
    const stream = await openYellowstoneSubscription(
      client,
      slotSubscription(commitment),
    );
    this.stream = stream;
    stream.on('data', (update: SubscribeUpdate) => {
      for (const event of normalizeYellowstoneUpdate(update)) {
        if (event.kind === 'slot') {
          this.currentSlot = event.slot;
        }
      }
    });

    let interrupted = false;
    const reconnect = () => {
      if (interrupted || stream !== this.stream) {
        return;
      }
      interrupted = true;
      this.scheduleReconnect(client, commitment);
    };
    stream.once('error', reconnect);
    stream.once('end', reconnect);
    stream.once('close', reconnect);
  }

  private scheduleReconnect(
    client: YellowstoneGrpcClient,
    commitment: unknown,
  ) {
    if (this.stopping || this.reconnectTimer) {
      return;
    }

    this.destroyStream();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.open(client, commitment).catch(() => {
        this.scheduleReconnect(client, commitment);
      });
    }, 1_000);
  }

  private destroyStream() {
    this.stream?.removeAllListeners();
    this.stream?.destroy();
    this.stream = null;
  }
}

function slotSubscription(commitment: unknown): SubscribeRequest {
  return {
    accounts: {},
    slots: {
      live_slots: {
        filterByCommitment: true,
        interslotUpdates: false,
      },
    },
    transactions: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    commitment: commitment as SubscribeRequest['commitment'],
    accountsDataSlice: [],
    ping: undefined,
    fromSlot: undefined,
  };
}
