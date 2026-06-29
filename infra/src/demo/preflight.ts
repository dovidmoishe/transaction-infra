import { createSlotPilotRuntime } from '../runtime';

interface Check {
  name: string;
  ok: boolean;
  details?: unknown;
  error?: string;
}

async function main() {
  const requireLive = process.argv.includes('--require-live');
  const runtime = createSlotPilotRuntime();
  const checks: Check[] = [];

  checks.push({
    name: 'configuration',
    ok:
      !requireLive ||
      (runtime.env.SLOTPILOT_ADAPTER_MODE === 'live' &&
        runtime.agent.source === 'openai'),
    details: {
      adapterMode: runtime.env.SLOTPILOT_ADAPTER_MODE,
      network: runtime.env.NETWORK,
      agentSource: runtime.agent.source,
    },
  });

  await capture(checks, 'solana_rpc', async () => {
    const [slot, blockHeight, blockhash, balanceLamports, fees] =
      await Promise.all([
        runtime.solanaRpc.getCurrentSlot(),
        runtime.solanaRpc.getCurrentBlockHeight(),
        runtime.solanaRpc.getLatestBlockhash('confirmed'),
        runtime.solanaRpc.getBalance(runtime.payerPublicKey),
        runtime.solanaRpc.getRecentPrioritizationFees(),
      ]);
    if (requireLive && balanceLamports <= 0) {
      throw new Error('Payer has no SOL balance.');
    }
    const estimatedRequiredLamports =
      12 * (1 + runtime.env.SLOTPILOT_MAX_TIP_LAMPORTS + 10_000);
    if (requireLive && balanceLamports < estimatedRequiredLamports) {
      throw new Error(
        `Payer balance is below the conservative ten-run budget of ${estimatedRequiredLamports} lamports.`,
      );
    }
    return {
      slot,
      blockHeight,
      blockhashCommitment: blockhash.commitment,
      lastValidBlockHeight: blockhash.lastValidBlockHeight,
      payerPublicKey: runtime.payerPublicKey,
      balanceLamports,
      estimatedRequiredLamports,
      prioritizationFeeSamples: fees.length,
    };
  });

  await capture(checks, 'jito', async () => {
    const [tipAccounts, tipFloorLamports, plan] = await Promise.all([
      runtime.jitoClient.getTipAccounts(),
      runtime.jitoClient.getTipFloorLamports(),
      runtime.submissionPlanner.plan(),
    ]);
    if (tipAccounts.length === 0) {
      throw new Error('Jito returned no tip accounts.');
    }
    if (requireLive && plan.source !== 'jito_searcher') {
      throw new Error('Live preflight requires Jito searcher leader planning.');
    }
    return {
      tipAccountCount: tipAccounts.length,
      tipFloorLamports,
      submissionPlanSource: plan.source,
      slotsUntilLeader: plan.slotsUntilLeader,
    };
  });

  await capture(checks, 'yellowstone', async () => {
    await runtime.stream.start();
    try {
      const initialSlot = runtime.stream.getCurrentSlot();
      if (initialSlot === null) {
        throw new Error('Yellowstone did not return a current slot.');
      }
      const advancedSlot = requireLive
        ? await waitForSlotAdvance(runtime.stream, initialSlot, 5_000)
        : initialSlot;
      if (requireLive && advancedSlot === null) {
        throw new Error(
          `Yellowstone slot stream did not advance from slot ${initialSlot} within 5000ms.`,
        );
      }
      return { initialSlot, advancedSlot };
    } finally {
      await runtime.stream.stop();
    }
  });

  console.log(JSON.stringify({ checks }, null, 2));
  if (checks.some((check) => !check.ok)) {
    process.exit(1);
  }
  process.exit(0);
}

async function capture(
  checks: Check[],
  name: string,
  operation: () => Promise<unknown>,
) {
  try {
    checks.push({ name, ok: true, details: await operation() });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function waitForSlotAdvance(
  stream: { getCurrentSlot(): number | null },
  initialSlot: number,
  timeoutMs: number,
): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const slot = stream.getCurrentSlot();
    if (slot !== null && slot > initialSlot) {
      return slot;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
