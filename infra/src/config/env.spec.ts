import { parseEnv } from './env';

describe('parseEnv', () => {
  const liveEnv: NodeJS.ProcessEnv = {
    SLOTPILOT_ADAPTER_MODE: 'live',
    NETWORK: 'mainnet-beta',
    SOLANA_RPC_URL: 'https://rpc.example.com',
    YELLOWSTONE_GRPC_ENDPOINT: 'https://grpc.example.com',
    JITO_BLOCK_ENGINE_URL: 'https://mainnet.block-engine.jito.wtf',
    PAYER_PRIVATE_KEY: 'secret',
    RECIPIENT_PUBLIC_KEY: 'recipient',
  };

  it('rejects an official Jito endpoint paired with devnet', () => {
    expect(() => parseEnv({ ...liveEnv, NETWORK: 'devnet' })).toThrow(
      'Official Jito Block Engine endpoints do not serve Solana devnet',
    );
  });

  it('enforces the documented live minimum tip', () => {
    expect(() =>
      parseEnv({
        ...liveEnv,
        SLOTPILOT_MIN_TIP_LAMPORTS: '999',
      }),
    ).toThrow('must be at least 1000 in live mode');
  });

  it('normalizes common live env values', () => {
    const parsed = parseEnv({
      ...liveEnv,
      NETWORK: 'mainnet',
      SOLANA_WS_URL: '',
      YELLOWSTONE_GRPC_ENDPOINT: 'fra.grpc.solinfra.dev:443',
      OPENAI_BASE_URL: '',
    });

    expect(parsed.NETWORK).toBe('mainnet-beta');
    expect(parsed.SOLANA_WS_URL).toBeUndefined();
    expect(parsed.YELLOWSTONE_GRPC_ENDPOINT).toBe('fra.grpc.solinfra.dev:443');
    expect(parsed.OPENAI_BASE_URL).toBeUndefined();
  });
});
