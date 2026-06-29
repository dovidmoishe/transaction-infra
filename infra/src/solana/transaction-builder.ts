import {
  Keypair,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { TransactionBuilderPort } from '../core/ports';
import {
  BlockhashSnapshot,
  BuiltTransaction,
  ComputeBudgetSettings,
} from '../core/types';

const MEMO_PROGRAM_ID = new PublicKey(
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
);

export class TransferTransactionBuilder implements TransactionBuilderPort {
  constructor(
    private readonly payer: Keypair,
    private readonly recipient: PublicKey,
  ) {}

  async buildTransfer(input: {
    lamports: number;
    blockhash: BlockhashSnapshot;
    computeBudget?: ComputeBudgetSettings;
    memo?: string;
    tipLamports?: number;
    tipAccount?: string;
    tipMemo?: string;
  }): Promise<BuiltTransaction> {
    const transaction = new Transaction({
      feePayer: this.payer.publicKey,
      recentBlockhash: input.blockhash.blockhash,
    });
    if (input.computeBudget?.computeUnitLimit) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
          units: input.computeBudget.computeUnitLimit,
        }),
      );
    }
    if (input.computeBudget?.computeUnitPriceMicroLamports) {
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: input.computeBudget.computeUnitPriceMicroLamports,
        }),
      );
    }
    if (input.memo) {
      transaction.add(memoInstruction(input.memo));
    }
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: this.payer.publicKey,
        toPubkey: this.recipient,
        lamports: input.lamports || LAMPORTS_PER_SOL / 1_000_000,
      }),
    );
    if (input.tipLamports && input.tipAccount) {
      if (input.tipMemo) {
        transaction.add(memoInstruction(input.tipMemo));
      }
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: this.payer.publicKey,
          toPubkey: new PublicKey(input.tipAccount),
          lamports: input.tipLamports,
        }),
      );
    }

    return this.signTransaction(transaction, input.blockhash);
  }

  async buildTipTransaction(input: {
    tipLamports: number;
    tipAccount: string;
    blockhash: BlockhashSnapshot;
    memo?: string;
  }): Promise<BuiltTransaction> {
    return this.buildSignedSystemTransfer({
      to: new PublicKey(input.tipAccount),
      lamports: input.tipLamports,
      blockhash: input.blockhash,
      transaction: input.memo
        ? new Transaction({
            feePayer: this.payer.publicKey,
            recentBlockhash: input.blockhash.blockhash,
          }).add(memoInstruction(input.memo))
        : undefined,
    });
  }

  private async buildSignedSystemTransfer(input: {
    to: PublicKey;
    lamports: number;
    blockhash: BlockhashSnapshot;
    transaction?: Transaction;
  }): Promise<BuiltTransaction> {
    const transaction =
      input.transaction ??
      new Transaction({
        feePayer: this.payer.publicKey,
        recentBlockhash: input.blockhash.blockhash,
      });
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: this.payer.publicKey,
        toPubkey: input.to,
        lamports: input.lamports || LAMPORTS_PER_SOL / 1_000_000,
      }),
    );

    return this.signTransaction(transaction, input.blockhash);
  }

  private signTransaction(
    transaction: Transaction,
    blockhash: BlockhashSnapshot,
  ): BuiltTransaction {
    transaction.sign(this.payer);

    return {
      signature: transaction.signature
        ? bs58.encode(transaction.signature)
        : '',
      transaction,
      serializedTransaction: transaction.serialize(),
      blockhash: blockhash.blockhash,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
    };
  }
}

function memoInstruction(memo: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, 'utf8'),
  });
}
