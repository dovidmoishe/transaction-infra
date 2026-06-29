import { SolanaRpcPort } from '../core/ports';
import { BlockhashSnapshot } from '../core/types';

export class BlockhashManager {
  private current: BlockhashSnapshot | null = null;

  constructor(private readonly solanaRpc: SolanaRpcPort) {}

  async fresh(): Promise<BlockhashSnapshot> {
    this.current = await this.solanaRpc.getLatestBlockhash('confirmed');
    return this.current;
  }

  async refresh(): Promise<BlockhashSnapshot> {
    return this.fresh();
  }

  async staleForFaultInjection(): Promise<BlockhashSnapshot> {
    const latest = await this.fresh();
    return {
      ...latest,
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: Math.max(0, latest.lastValidBlockHeight - 10_000),
    };
  }

  async isExpiryRisk(snapshot: BlockhashSnapshot): Promise<boolean> {
    const currentBlockHeight = await this.solanaRpc.getCurrentBlockHeight();
    return snapshot.lastValidBlockHeight - currentBlockHeight < 20;
  }
}
