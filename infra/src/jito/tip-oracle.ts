import { JitoBundlePort, TipOraclePort } from '../core/ports';
import { FailureClass, TipQuote } from '../core/types';

export class DynamicTipOracle implements TipOraclePort {
  private rotationIndex = 0;

  constructor(
    private readonly jitoClient: JitoBundlePort,
    private readonly minTipLamports: number,
    private readonly maxTipLamports: number,
    private readonly priorityFeePressureScaleMicroLamports = 1_000_000,
  ) {}

  async quoteTip(input: {
    failureClass?: FailureClass | null;
    tipMultiplier?: number;
    priorityFeeMicroLamports?: number | null;
  }): Promise<TipQuote> {
    const [accounts, jitoTipFloor] = await Promise.all([
      this.jitoClient.getTipAccounts(),
      this.jitoClient.getTipFloorLamports().catch(() => null),
    ]);
    if (accounts.length === 0) {
      throw new Error('Jito returned no tip accounts');
    }

    const tipAccount = accounts[this.rotationIndex % accounts.length];
    this.rotationIndex += 1;

    const pressureMultiplier =
      input.failureClass === 'fee_or_tip_too_low' ||
      input.failureClass === 'bundle_not_landed'
        ? 1.5
        : 1;
    const agentMultiplier = input.tipMultiplier ?? 1;
    const landedTipBaseline = Math.min(
      Math.max(jitoTipFloor ?? 0, this.minTipLamports),
      this.maxTipLamports,
    );
    const networkPressureMultiplier =
      1 +
      Math.min(
        (input.priorityFeeMicroLamports ?? 0) /
          this.priorityFeePressureScaleMicroLamports,
        1,
      );
    const rawTip = Math.ceil(
      landedTipBaseline *
        networkPressureMultiplier *
        pressureMultiplier *
        agentMultiplier,
    );
    const tipLamports = Math.min(rawTip, this.maxTipLamports);

    return {
      tipLamports,
      tipAccount,
      source: 'jito_tip_accounts_with_fee_pressure_and_local_bounds',
      reason: `Rotated through Jito tip accounts and applied Jito median tip floor (${jitoTipFloor ?? 'unavailable'} lamports), Solana priority-fee pressure (${input.priorityFeeMicroLamports ?? 'unavailable'} micro-lamports/CU), configured bounds, failure multiplier, and agent multiplier.`,
    };
  }
}
