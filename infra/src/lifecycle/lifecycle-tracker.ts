import {
  BundleBuilderPort,
  LifecycleTrackerPort,
  SolanaRpcPort,
  StreamPort,
} from '../core/ports';
import { LifecycleLogEntry, nowIso } from '../core/types';

export class LifecycleTracker implements LifecycleTrackerPort {
  constructor(
    private readonly stream: StreamPort,
    private readonly solanaRpc: SolanaRpcPort,
    private readonly bundleBuilder: BundleBuilderPort,
    private readonly timeoutMs: number,
  ) {}

  async track(input: {
    signature: string;
    bundleId: string;
    submittedAt: string;
    submittedSlot: number;
  }): Promise<Partial<LifecycleLogEntry>> {
    try {
      return await this.stream.waitForSignatureLifecycle({
        signature: input.signature,
        submittedAt: input.submittedAt,
        submittedSlot: input.submittedSlot,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (!(error as Error).message.includes('stream_timeout')) {
        throw error;
      }

      const fallback = await this.waitForRpcLifecycle(
        input.signature,
        input.submittedAt,
      );
      if (fallback) {
        return fallback;
      }

      const bundleStatus = await this.bundleBuilder
        .getBundleStatus(input.bundleId)
        .catch((statusError) => ({
          statusLookupError:
            statusError instanceof Error
              ? statusError.message
              : String(statusError),
        }));
      throw new Error(
        `bundle_not_landed after stream and RPC timeout; bundle ${input.bundleId} status: ${JSON.stringify(bundleStatus)}`,
      );
    }
  }

  private async waitForRpcLifecycle(
    signature: string,
    submittedAt: string,
  ): Promise<Partial<LifecycleLogEntry> | null> {
    const startedAt = Date.now();
    let processedAt: string | null = null;
    let confirmedAt: string | null = null;
    let finalizedAt: string | null = null;
    let processedSlot: number | null = null;
    let confirmedSlot: number | null = null;
    let finalizedSlot: number | null = null;

    while (Date.now() - startedAt < this.timeoutMs) {
      const status = await this.solanaRpc.getSignatureStatus(signature);
      if (status?.err) {
        throw new Error(
          `transaction_failed ${signature}: ${JSON.stringify(status.err)}`,
        );
      }

      if (status?.confirmationStatus) {
        const observedAt = nowIso();
        if (!processedAt) {
          processedAt = observedAt;
          processedSlot = status.slot;
        }
        if (
          (status.confirmationStatus === 'confirmed' ||
            status.confirmationStatus === 'finalized') &&
          !confirmedAt
        ) {
          confirmedAt = observedAt;
          confirmedSlot = status.slot;
        }
        if (status.confirmationStatus === 'finalized') {
          finalizedAt = observedAt;
          finalizedSlot = status.slot;
          break;
        }
      }

      await delay(500);
    }

    if (!processedAt || !confirmedAt || !finalizedAt) {
      return null;
    }

    const submittedAtMs = Date.parse(submittedAt);
    return {
      processedAt,
      processedSlot,
      confirmedAt,
      confirmedSlot,
      finalizedAt,
      finalizedSlot,
      submittedToProcessedMs: Date.parse(processedAt) - submittedAtMs,
      processedToConfirmedMs: Date.parse(confirmedAt) - Date.parse(processedAt),
      confirmedToFinalizedMs: Date.parse(finalizedAt) - Date.parse(confirmedAt),
      totalLifecycleMs: Date.parse(finalizedAt) - submittedAtMs,
      lifecycleSource: 'rpc_fallback',
    };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
