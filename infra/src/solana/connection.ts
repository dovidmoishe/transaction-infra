import { Commitment, Connection, VersionedTransaction } from '@solana/web3.js';
import { SolanaRpcPort } from '../core/ports';
import { BlockhashSnapshot, CommitmentLevel, nowIso } from '../core/types';

export class MockSolanaRpc implements SolanaRpcPort {
  private slot = 344_100_000;
  private blockHeight = 300_000_000;

  async getLatestBlockhash(
    commitment: Exclude<CommitmentLevel, 'finalized'>,
  ): Promise<BlockhashSnapshot> {
    this.slot += 1;
    this.blockHeight += 1;
    return {
      blockhash: '11111111111111111111111111111111',
      lastValidBlockHeight: this.blockHeight + 150,
      fetchedSlot: this.slot,
      fetchedAt: nowIso(),
      commitment,
    };
  }

  async getCurrentSlot(): Promise<number> {
    this.slot += 1;
    return this.slot;
  }

  async getCurrentBlockHeight(): Promise<number> {
    this.blockHeight += 1;
    return this.blockHeight;
  }

  async getBalance(): Promise<number> {
    return 10_000_000;
  }

  async getSignatureStatus(): Promise<{
    slot: number;
    confirmationStatus: CommitmentLevel;
    err: null;
  }> {
    this.slot += 1;
    return {
      slot: this.slot,
      confirmationStatus: 'finalized',
      err: null,
    };
  }

  async getRecentPrioritizationFees(): Promise<number[]> {
    return [0, 1_000, 2_000, 5_000];
  }

  async simulateTransaction(): Promise<{ err: null; logs: string[] }> {
    return { err: null, logs: [] };
  }
}

export class Web3SolanaRpc implements SolanaRpcPort {
  private readonly connection: Connection;

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async getLatestBlockhash(
    commitment: Exclude<CommitmentLevel, 'finalized'>,
  ): Promise<BlockhashSnapshot> {
    const [slot, latest] = await Promise.all([
      this.connection.getSlot(commitment as Commitment),
      this.connection.getLatestBlockhash(commitment as Commitment),
    ]);

    return {
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
      fetchedSlot: slot,
      fetchedAt: nowIso(),
      commitment,
    };
  }

  async getCurrentSlot(): Promise<number> {
    return this.connection.getSlot('processed');
  }

  async getCurrentBlockHeight(): Promise<number> {
    return this.connection.getBlockHeight('processed');
  }

  async getBalance(address: string): Promise<number> {
    const { PublicKey } = await import('@solana/web3.js');
    return this.connection.getBalance(new PublicKey(address), 'confirmed');
  }

  async getSignatureStatus(signature: string) {
    const response = await this.connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = response.value[0];
    if (!status) {
      return null;
    }

    return {
      slot: status.slot,
      confirmationStatus: status.confirmationStatus as CommitmentLevel | null,
      err: status.err,
    };
  }

  async getRecentPrioritizationFees(): Promise<number[]> {
    const fees = await this.connection.getRecentPrioritizationFees();
    return fees
      .map((fee) => fee.prioritizationFee)
      .filter((fee) => Number.isFinite(fee));
  }

  async simulateTransaction(serializedTransaction: Buffer) {
    const transaction = VersionedTransaction.deserialize(serializedTransaction);
    const response = await this.connection.simulateTransaction(transaction, {
      commitment: 'processed',
      sigVerify: false,
      replaceRecentBlockhash: false,
    });
    return {
      err: response.value.err,
      logs: response.value.logs ?? [],
    };
  }
}
