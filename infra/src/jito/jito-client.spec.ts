import { JitoJsonRpcClient } from './jito-client';

describe('JitoJsonRpcClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses the method-specific endpoint when configured with a full bundle URL', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: ['11111111111111111111111111111111'],
        }),
        { status: 200 },
      ),
    );
    const client = new JitoJsonRpcClient(
      'https://mainnet.block-engine.jito.wtf/api/v1/bundles',
      undefined,
      undefined,
      0,
    );

    await client.getTipAccounts();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mainnet.block-engine.jito.wtf/api/v1/getTipAccounts',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('converts the Jito median tip floor from SOL to lamports', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            landed_tips_50th_percentile: 0.00001,
            ema_landed_tips_50th_percentile: 0.000012,
          },
        ]),
        { status: 200 },
      ),
    );
    const client = new JitoJsonRpcClient(
      'https://mainnet.block-engine.jito.wtf',
      undefined,
      'https://bundles.jito.wtf/api/v1/bundles/tip_floor',
      0,
    );

    await expect(client.getTipFloorLamports()).resolves.toBe(12_000);
  });
});
