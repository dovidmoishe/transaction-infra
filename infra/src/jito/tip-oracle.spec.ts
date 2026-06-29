import { DynamicTipOracle } from './tip-oracle';
import { JitoBundlePort } from '../core/ports';

class FakeJitoClient implements JitoBundlePort {
  async getTipAccounts(): Promise<string[]> {
    return ['11111111111111111111111111111111'];
  }

  async getTipFloorLamports(): Promise<number> {
    return 1_500;
  }

  async submitBundle(): Promise<{ bundleId: string; rawResponse: unknown }> {
    return { bundleId: 'bundle', rawResponse: null };
  }

  async getBundleStatus(): Promise<unknown> {
    return null;
  }
}

describe('DynamicTipOracle', () => {
  it('uses fee pressure and agent multiplier inside configured bounds', async () => {
    const oracle = new DynamicTipOracle(
      new FakeJitoClient(),
      1_000,
      10_000,
      2_000,
    );

    await expect(
      oracle.quoteTip({
        priorityFeeMicroLamports: 1_000,
        tipMultiplier: 1.5,
      }),
    ).resolves.toMatchObject({
      tipLamports: 3_375,
      source: 'jito_tip_accounts_with_fee_pressure_and_local_bounds',
    });
  });

  it('caps calculated tips at the configured max', async () => {
    const oracle = new DynamicTipOracle(new FakeJitoClient(), 1_000, 2_500);

    await expect(
      oracle.quoteTip({
        failureClass: 'bundle_not_landed',
        priorityFeeMicroLamports: 2_000,
        tipMultiplier: 2,
      }),
    ).resolves.toMatchObject({
      tipLamports: 2_500,
    });
  });

  it('uses the Jito landed-tip floor when it exceeds Solana fee pressure', async () => {
    const oracle = new DynamicTipOracle(new FakeJitoClient(), 1_000, 10_000);

    await expect(
      oracle.quoteTip({
        priorityFeeMicroLamports: 0,
      }),
    ).resolves.toMatchObject({
      tipLamports: 1_500,
    });
  });
});
