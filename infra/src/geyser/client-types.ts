import { Duplex } from 'node:stream';
import type { SubscribeRequest } from '@triton-one/yellowstone-grpc';

export interface YellowstoneGrpcClient {
  connect?: () => Promise<void>;
  getSlot(
    commitment?: unknown,
  ): Promise<{ slot: bigint | number | string } | bigint | number | string>;
  subscribe(request?: SubscribeRequest): Promise<Duplex>;
}
