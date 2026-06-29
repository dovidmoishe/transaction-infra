import bs58 from 'bs58';
import { Keypair, PublicKey } from '@solana/web3.js';

export function parseKeypair(secret: string | undefined): Keypair {
  if (!secret) {
    return Keypair.generate();
  }

  const trimmed = secret.trim();
  if (trimmed.startsWith('[')) {
    return Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(trimmed) as number[]),
    );
  }

  return Keypair.fromSecretKey(bs58.decode(trimmed));
}

export function parsePublicKey(value: string | undefined): PublicKey {
  if (!value) {
    return Keypair.generate().publicKey;
  }

  return new PublicKey(value);
}
