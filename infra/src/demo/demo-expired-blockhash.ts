import { createSlotPilotRuntime } from '../runtime';

async function main() {
  const { env, engine } = createSlotPilotRuntime();
  const result = await engine.run({
    lamports: 1,
    faultInjection: 'expired_blockhash',
    maxAttempts: env.SLOTPILOT_MAX_RETRIES + 1,
  });

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
