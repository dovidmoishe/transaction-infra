import { BundleBuilderPort, JitoBundlePort } from '../core/ports';
import {
  BundleSubmission,
  BuiltTransaction,
  TipQuote,
  nowIso,
} from '../core/types';

export class JitoBundleBuilder implements BundleBuilderPort {
  constructor(private readonly jitoClient: JitoBundlePort) {}

  async submitUserTransaction(input: {
    userTransaction: BuiltTransaction;
    tipTransaction: BuiltTransaction;
    tipQuote: TipQuote;
    submittedSlot: number;
  }): Promise<BundleSubmission> {
    const encodedTransactions = [
      ...new Set([
        input.userTransaction.serializedTransaction.toString('base64'),
        input.tipTransaction.serializedTransaction.toString('base64'),
      ]),
    ];
    const submittedAt = nowIso();
    const response = await this.jitoClient.submitBundle(encodedTransactions);

    return {
      bundleId: response.bundleId,
      signature: input.userTransaction.signature,
      submittedAt,
      submittedSlot: input.submittedSlot,
      tipLamports: input.tipQuote.tipLamports,
      tipAccount: input.tipQuote.tipAccount,
      rawResponse: response.rawResponse,
    };
  }

  async getBundleStatus(bundleId: string): Promise<unknown> {
    return this.jitoClient.getBundleStatus(bundleId);
  }
}
