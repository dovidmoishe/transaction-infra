import { RuleBasedAgent } from './ai-agent';

describe('RuleBasedAgent', () => {
  it('returns a retry decision for expired blockhash failures', async () => {
    const agent = new RuleBasedAgent();

    await expect(
      agent.decide({
        runId: 'run_test',
        attempt: 1,
        network: 'devnet',
        failureClass: 'expired_blockhash',
      }),
    ).resolves.toMatchObject({
      decision: 'retry',
      refreshBlockhash: true,
      tipMultiplier: 1.2,
    });
  });
});
