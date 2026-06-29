import { Duplex } from 'node:stream';
import type { SubscribeRequest } from '@triton-one/yellowstone-grpc';
import { YellowstoneGrpcClient } from './client-types';

export async function openYellowstoneSubscription(
  client: YellowstoneGrpcClient,
  request: SubscribeRequest,
): Promise<Duplex> {
  if (client.connect) {
    return client.subscribe(request);
  }

  const stream = await client.subscribe();
  await writeRequest(stream, request);
  return stream;
}

function writeRequest(stream: Duplex, request: SubscribeRequest) {
  return new Promise<void>((resolve, reject) => {
    stream.write(request, (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
