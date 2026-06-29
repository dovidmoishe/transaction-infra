import { createSlotPilotRuntime } from '../runtime';
import { RunResult } from '../core/types';

async function main() {
  const { env, engine } = createSlotPilotRuntime();
  const results: RunResult[] = [];

  for (let index = 0; index < 10; index += 1) {
    const injectFailure = index === 1 || index === 6;
    results.push(
      await engine.run({
        lamports: 1,
        faultInjection: injectFailure ? 'expired_blockhash' : undefined,
        maxAttempts: env.SLOTPILOT_MAX_RETRIES + 1,
      }),
    );
  }

  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
