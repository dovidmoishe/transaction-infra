import { StreamPort } from '../core/ports';
import { LifecycleLogEntry } from '../core/types';
import { YellowstoneGrpcClient } from './client-types';
import { YellowstoneSlotStream } from './slot-stream';
import { YellowstoneTransactionStream } from './transaction-stream';

export class MockStreamClient implements StreamPort {
  private currentSlot = 344_100_000;

  async start(): Promise<void> {
    this.currentSlot += 1;
  }

  async stop(): Promise<void> {
    return;
  }

  getCurrentSlot(): number {
    return this.currentSlot;
  }

  async waitForSignatureLifecycle(input: {
    submittedAt: string;
    timeoutMs: number;
  }): Promise<Partial<LifecycleLogEntry>> {
    await delay(Math.min(25, input.timeoutMs));
    const submittedAtMs = Date.parse(input.submittedAt);
    this.currentSlot += 3;
    const processedAt = new Date(submittedAtMs + 350).toISOString();
    const confirmedAt = new Date(submittedAtMs + 1_050).toISOString();
    const finalizedAt = new Date(submittedAtMs + 12_500).toISOString();

    return {
      processedAt,
      processedSlot: this.currentSlot - 2,
      confirmedAt,
      confirmedSlot: this.currentSlot - 1,
      finalizedAt,
      finalizedSlot: this.currentSlot,
      submittedToProcessedMs: 350,
      processedToConfirmedMs: 700,
      confirmedToFinalizedMs: 11_450,
      totalLifecycleMs: 12_500,
      lifecycleSource: 'mock',
    };
  }
}

export class YellowstoneStreamClient implements StreamPort {
  private client: YellowstoneGrpcClient | null = null;
  private readonly slots = new YellowstoneSlotStream();
  private readonly transactions = new YellowstoneTransactionStream();
  private processedCommitment: unknown;

  constructor(
    private readonly endpoint: string,
    private readonly token?: string,
  ) {}

  async start(): Promise<void> {
    const yellowstone = await import('@triton-one/yellowstone-grpc');
    const Client = yellowstone.default as unknown as new (
      endpoint: string,
      token: string | undefined,
      channelOptions: unknown,
      reconnectOptions: unknown,
    ) => YellowstoneGrpcClient;
    this.processedCommitment = yellowstone.CommitmentLevel.PROCESSED;
    this.client = new Client(this.endpoint, this.token, undefined, {
      enabled: true,
    });
    if (this.client.connect) {
      await this.client.connect();
    }
    const slot = await this.client.getSlot(this.processedCommitment);
    this.slots.setCurrentSlot(
      Number(typeof slot === 'object' ? slot.slot : slot),
    );
    await this.slots.start(this.client, this.processedCommitment);
  }

  async stop(): Promise<void> {
    this.slots.stop();
    closeYellowstoneClient(this.client);
    this.client = null;
  }

  getCurrentSlot(): number | null {
    return this.slots.getCurrentSlot();
  }

  async waitForSignatureLifecycle(input: {
    signature: string;
    submittedAt: string;
    submittedSlot: number;
    timeoutMs: number;
  }): Promise<Partial<LifecycleLogEntry>> {
    if (!this.client) {
      throw new Error('Yellowstone stream client is not started');
    }
    return this.transactions.waitForLifecycle({
      client: this.client,
      commitment: this.processedCommitment,
      ...input,
    });
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeYellowstoneClient(client: YellowstoneGrpcClient | null) {
  if (!client) {
    return;
  }

  const closeable = client as unknown as {
    close?: () => void;
    _client?: { close?: () => void };
    _grpcClient?: { close?: () => void };
  };

  closeable.close?.();
  closeable._client?.close?.();
  closeable._grpcClient?.close?.();
}
