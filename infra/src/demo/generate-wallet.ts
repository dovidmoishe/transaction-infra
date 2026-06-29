import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

type WalletRole = 'payer' | 'recipient';

const roleArg = process.argv.find((arg) => arg.startsWith('--role='));
const role = (roleArg?.split('=')[1] ?? 'payer') as WalletRole;

if (role !== 'payer' && role !== 'recipient') {
  throw new Error('Invalid role. Use --role=payer or --role=recipient.');
}

const keypair = Keypair.generate();
const secretKey = Array.from(keypair.secretKey);
const publicKey = keypair.publicKey.toBase58();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDirectory = join(process.cwd(), 'generated-wallets');
const outputPath = join(outputDirectory, `slotpilot-${role}-${timestamp}.json`);

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(secretKey)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });

  const envLine =
    role === 'payer'
      ? `PAYER_PRIVATE_KEY=${JSON.stringify(secretKey)}`
      : `RECIPIENT_PUBLIC_KEY=${publicKey}`;

  console.log(`Generated ${role} wallet`);
  console.log(`Public key: ${publicKey}`);
  console.log(`Secret key file: ${outputPath}`);
  console.log(`Secret key base58: ${bs58.encode(keypair.secretKey)}`);
  console.log('');
  console.log('Paste this into .env:');
  console.log(envLine);
}

void main();
