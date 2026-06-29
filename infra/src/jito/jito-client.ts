import { JitoBundlePort } from '../core/ports';

interface JsonRpcResponse<T> {
  result?: T;
  error?: unknown;
}

interface JitoTipFloor {
  landed_tips_50th_percentile?: number;
  ema_landed_tips_50th_percentile?: number;
}

export class MockJitoClient implements JitoBundlePort {
  async getTipAccounts(): Promise<string[]> {
    return [
      '11111111111111111111111111111111',
      'ComputeBudget111111111111111111111111111111',
    ];
  }

  async getTipFloorLamports(): Promise<number> {
    return 4_000;
  }

  async submitBundle(): Promise<{ bundleId: string; rawResponse: unknown }> {
    return {
      bundleId: `mock_bundle_${Date.now()}`,
      rawResponse: { mock: true },
    };
  }

  async getBundleStatus(bundleId: string): Promise<unknown> {
    return { bundleId, status: 'mock_finalized' };
  }
}

export class JitoJsonRpcClient implements JitoBundlePort {
  private requestChain: Promise<void> = Promise.resolve();
  private lastRpcAt = 0;

  constructor(
    private readonly blockEngineUrl: string,
    private readonly authUuid?: string,
    private readonly tipFloorUrl = 'https://bundles.jito.wtf/api/v1/bundles/tip_floor',
    private readonly minimumRequestIntervalMs = 1_000,
    private readonly requestTimeoutMs = 10_000,
  ) {}

  async getTipAccounts(): Promise<string[]> {
    return this.rpc<string[]>('getTipAccounts', [], '/api/v1/getTipAccounts');
  }

  async getTipFloorLamports(): Promise<number | null> {
    const response = await fetch(this.tipFloorUrl, {
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Jito tip floor failed with HTTP ${response.status}`);
    }

    const floors = (await response.json()) as JitoTipFloor[];
    const latest = floors[0];
    if (!latest) {
      return null;
    }

    const sol =
      latest.ema_landed_tips_50th_percentile ??
      latest.landed_tips_50th_percentile;
    return sol === undefined ? null : Math.ceil(sol * 1_000_000_000);
  }

  async submitBundle(
    encodedTransactions: string[],
  ): Promise<{ bundleId: string; rawResponse: unknown }> {
    const result = await this.rpc<string>(
      'sendBundle',
      [encodedTransactions, { encoding: 'base64' }],
      '/api/v1/bundles',
    );
    return {
      bundleId: result,
      rawResponse: result,
    };
  }

  async getBundleStatus(bundleId: string): Promise<unknown> {
    const inflight = await this.rpc(
      'getInflightBundleStatuses',
      [[bundleId]],
      '/api/v1/getInflightBundleStatuses',
    );
    const landed = await this.rpc(
      'getBundleStatuses',
      [[bundleId]],
      '/api/v1/getBundleStatuses',
    );
    return { inflight, landed };
  }

  private async rpc<T>(
    method: string,
    params: unknown[],
    defaultPath: string,
  ): Promise<T> {
    let release!: () => void;
    const previous = this.requestChain;
    this.requestChain = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const waitMs =
      this.minimumRequestIntervalMs - (Date.now() - this.lastRpcAt);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    try {
      return await this.performRpc<T>(method, params, defaultPath);
    } finally {
      this.lastRpcAt = Date.now();
      release();
    }
  }

  private async performRpc<T>(
    method: string,
    params: unknown[],
    defaultPath: string,
  ): Promise<T> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (this.authUuid) {
      headers['x-jito-auth'] = this.authUuid;
    }

    const response = await fetch(this.endpoint(defaultPath), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method,
        params,
      }),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Jito RPC ${method} failed with HTTP ${response.status}`);
    }

    const json = (await response.json()) as JsonRpcResponse<T>;
    if (json.error) {
      throw new Error(
        `Jito RPC ${method} failed: ${JSON.stringify(json.error)}`,
      );
    }
    if (json.result === undefined) {
      throw new Error(`Jito RPC ${method} returned no result`);
    }

    return json.result;
  }

  private endpoint(defaultPath: string): string {
    const url = new URL(this.blockEngineUrl);
    if (
      url.pathname === '/' ||
      url.pathname === '' ||
      url.pathname === '/api/v1' ||
      url.pathname.startsWith('/api/v1/')
    ) {
      url.pathname = defaultPath;
    }
    return url.toString();
  }
}
