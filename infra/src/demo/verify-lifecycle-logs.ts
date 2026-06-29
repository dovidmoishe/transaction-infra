import { auditEvidence } from '../evidence/evidence-verifier';
import { createSlotPilotRuntime } from '../runtime';

async function main() {
  const requireLive = process.argv.includes('--require-live');
  const { logs } = createSlotPilotRuntime();
  const [lifecycle, failures, agentDecisions] = await Promise.all([
    logs.readLifecycle(),
    logs.readFailures(),
    logs.readAgentDecisions(),
  ]);
  const audit = auditEvidence({
    lifecycle,
    failures,
    agentDecisions,
    requireLive,
  });

  console.log(JSON.stringify(audit.summary, null, 2));
  if (audit.problems.length > 0) {
    throw new Error(audit.problems.join(' '));
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
