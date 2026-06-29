# SlotPilot Infra

SlotPilot is an AI-assisted Solana transaction control tower. It treats a transaction as an operational lifecycle: observe live network state, submit through Jito bundles, track commitment progression, classify failures, and let an agent decide retry behavior.

The current codebase is a modular TypeScript/Nest-compatible backend with CLI demos. It defaults to mock adapters so the full control loop can run locally without secrets, and exposes live adapter boundaries for Solana RPC, Jito Block Engine, Yellowstone gRPC, and OpenAI-compatible retry decisions.

## Architecture

Core flow:

```txt
Blockhash Manager
  -> Transaction Builder
  -> Tip Oracle
  -> Jito Bundle Builder/Submitter
  -> Lifecycle Tracker
  -> Failure Classifier
  -> AI Retry Agent
  -> Retry Executor
```

Important boundaries:

- `src/core`: shared types and provider ports.
- `src/config`: typed environment loader.
- `src/solana`: Solana RPC, blockhash, keypair, and transaction building.
- `src/jito`: tip account lookup, dynamic tip quote, and bundle JSON-RPC submission.
- `src/geyser`: normalized Yellowstone events, reconnecting slot stream, and replaying signature lifecycle stream.
- `src/lifecycle`: append-only JSONL logs and failure classification.
- `src/agent`: rule-based and OpenAI-compatible retry decision agents.
- `src/transaction-engine`: orchestrates attempts, failures, agent decisions, and retries.
- `src/demo`: reproducible CLI demos.

No database is used. Runtime proof is written to JSONL logs.

## Setup

Install dependencies:

```bash
pnpm install
```

Requires Node.js 20.18 or newer. The project is MIT licensed.

Copy env example:

```bash
cp .env.example .env
```

Local mock mode works without secrets:

```bash
pnpm run demo:success
pnpm run demo:expired-blockhash
pnpm run demo:ten-runs
pnpm run demo:verify-logs
pnpm run demo:preflight
```

Live mode requires funded keys and real provider endpoints:

```bash
pnpm run demo:preflight -- --require-live
SLOTPILOT_ADAPTER_MODE=live pnpm run demo:success
```

Official Jito Block Engine endpoints must be paired with
`NETWORK=mainnet-beta`. A custom Jito-compatible provider may support other
clusters.

Note: `@triton-one/yellowstone-grpc` currently publishes native optional packages for Linux and macOS, not Windows. Run live Yellowstone mode from Linux, macOS, or WSL. Mock mode works on Windows because the native client is lazy-loaded only in live mode.

The included Linux container provides another reproducible live runtime:

```bash
docker build -t slotpilot .
docker run --rm --env-file .env -v "$PWD/logs:/app/logs" slotpilot \
  node dist/demo/preflight.js --require-live
```

Live Docker preflight has been verified against configured Solana RPC, Jito
Block Engine, Jito leader planning, OpenAI mode, and Solinfra Yellowstone gRPC.
Use Docker/WSL/Linux for live Yellowstone because the provider-compatible
runtime uses the grpc-js Yellowstone client.

## Environment

Required in live mode:

- `SOLANA_RPC_URL`
- `YELLOWSTONE_GRPC_ENDPOINT`
- `JITO_BLOCK_ENGINE_URL`
- `PAYER_PRIVATE_KEY`
- `RECIPIENT_PUBLIC_KEY`

Optional:

- `YELLOWSTONE_GRPC_TOKEN`
- `JITO_SEARCHER_GRPC_URL`
- `JITO_AUTH_UUID`
- `JITO_AUTH_PRIVATE_KEY`
- `JITO_TIP_FLOOR_URL`
- `JITO_MIN_REQUEST_INTERVAL_MS`
- `JITO_REQUEST_TIMEOUT_MS`
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `AGENT_MODE=rule|openai`
- `NETWORK=devnet|mainnet-beta`
- `LOG_DIR`
- `SLOTPILOT_MIN_TIP_LAMPORTS`
- `SLOTPILOT_MAX_TIP_LAMPORTS`
- `SLOTPILOT_PRIORITY_FEE_PRESSURE_SCALE_MICROLAMPORTS`
- `SLOTPILOT_MAX_LEADER_WAIT_SLOTS`
- `SLOTPILOT_SUBMISSION_WINDOW_TIMEOUT_MS`
- `SLOTPILOT_MIN_RETRY_DELAY_MS`
- `SLOTPILOT_MAX_HOLD_CYCLES`
- `SLOTPILOT_MAX_RETRIES`
- `SLOTPILOT_LIFECYCLE_TIMEOUT_MS`

`getLatestBlockhash` uses `confirmed` by default for time-sensitive transaction construction. Do not use `finalized` for fresh blockhash fetching.

## Demos

```bash
pnpm run demo:success
```

Builds a transfer transaction with an in-transaction Jito tip instruction, calculates a bounded dynamic Jito tip, submits a one-transaction bundle, tracks lifecycle progression, and writes lifecycle logs.

```bash
pnpm run demo:expired-blockhash
```

Injects a stale blockhash failure, classifies it as `expired_blockhash`, asks the agent for a decision, refreshes blockhash, recalculates tip, and retries.

```bash
pnpm run demo:ten-runs
```

Runs ten local demo submissions with two injected blockhash failures. In live mode this is the script that should produce the bounty evidence logs after provider credentials are configured.

```bash
pnpm run demo:verify-logs
pnpm run demo:verify-logs -- --require-live
```

Summarizes lifecycle logs and fails unless the package contains 10 finalized runs, failures in 2 distinct runs, an expired-blockhash case, and an agent decision. `--require-live` also rejects mock artifacts, requires unique signatures and bundle ids, validates monotonic lifecycle proof, checks the separate JSONL files for consistency, and proves an OpenAI-owned blockhash-refresh decision finalized in the same run. Use a clean `LOG_DIR` for final live evidence.

## Logs

Logs are append-only JSONL files under `LOG_DIR`:

- `lifecycle.jsonl`
- `failures.jsonl`
- `agent-decisions.jsonl`

Lifecycle entries include run id, attempt, network, bundle id, signature, submitted/processed/confirmed/finalized timestamps and slots, tip account, tip lamports, blockhash, latency deltas, failure class, agent decision source, and model attribution.

`submittedAt` is captured immediately before the Jito request. Signature tracking replays from `submittedSlot`, reconnects on transient gRPC interruption, and preserves partial commitment state across reconnects.

## Failure Classification

SlotPilot combines provider errors, signed-transaction simulation logs, timeout state, Jito status context, and current block height. It normalizes failures into:

- `expired_blockhash`
- `fee_or_tip_too_low`
- `compute_exceeded`
- `bundle_not_landed`
- `skipped_leader`
- `simulation_failed`
- `stream_timeout`
- `unknown`

Simulation deserializes the original signed wire transaction and disables recent-blockhash replacement. This is required for the expired-blockhash demo; the legacy web3.js simulation overload otherwise replaces the stale blockhash.

## AI Retry

The AI layer never holds private keys, signs transactions, or submits bundles. It receives observed failure context and returns strict JSON:

```json
{
  "decision": "retry",
  "reason": "The blockhash expired before landing.",
  "refreshBlockhash": true,
  "tipMultiplier": 1.2,
  "delaySlots": 0
}
```

The transaction engine executes the decision safely.

## README Questions

### What does the delta between `processed_at` and `confirmed_at` tell you about network health at the time of submission?

It shows how quickly the transaction moved from validator processing to broader cluster vote confirmation. A small delta suggests healthy propagation and voting. A large delta can indicate congestion, propagation delay, fork uncertainty, skipped slots, or validator voting delays.

### Why should you never use finalized commitment when fetching a blockhash for a time-sensitive transaction?

Finalized commitment returns an older blockhash because it waits for the block to become rooted. For time-sensitive transactions, this reduces the remaining lifetime before blockhash expiry. Processed or confirmed commitment gives a fresher blockhash and more time for the transaction to land.

### What happens to your bundle if the Jito leader skips their slot?

If the Jito leader skips their slot, the bundle may not land in that slot. SlotPilot should detect lack of lifecycle progression, classify it as `skipped_leader` or `bundle_not_landed`, refresh the blockhash if expiry risk increased, recalculate the tip, and resubmit during another valid leader window.

## Current Status

Implemented:

- Typed env loader.
- Core transaction/lifecycle/agent types and ports.
- JSONL lifecycle/failure/agent logs.
- Solana blockhash and transaction builder.
- Jito bundle JSON-RPC submission with documented base64 encoding and optional auth.
- Jito leader-window planner through `getNextScheduledLeader`.
- Dynamic bounded tip oracle using recent Solana prioritization-fee pressure.
- Yellowstone signature and slot-commitment subscriptions with reconnect support.
- Yellowstone replay from the recorded submission slot to avoid missing fast landings.
- RPC status reconciliation only after Yellowstone timeout.
- Rule-based and OpenAI-compatible retry agents.
- CLI demos for success, expired-blockhash retry, and ten runs.
- Live evidence verifier for proof fields, OpenAI decisions, and Yellowstone coverage.
- Dockerized Linux runtime verified for live preflight.
- Live preflight verified for Solana RPC, Jito tip accounts, Jito leader planning, OpenAI mode, and Yellowstone slot streaming.
- OpenAI retry decisions observed in live logs with model attribution.

Known live evidence gap at submission time:

- Produce 10 finalized real Jito bundle lifecycle records.
- Current live attempts reached Jito submission and AI retry decisions, but Jito returned non-landed/invalid bundle outcomes before finalization.
- Publish the architecture document at a public URL.

## Limitations

- Live Yellowstone execution requires Linux, macOS, or WSL with provider credentials.
- Public Jito endpoints are rate limited and do not guarantee bundle landing.
- RPC reconciliation can prove finalization after a stream gap, but the final evidence gate still requires at least 7 Yellowstone-proven runs.
- Network observations in the README must come from the final live JSONL package; mock timings are not presented as real measurements.

Use [docs/live-runbook.md](docs/live-runbook.md) for the credentialed evidence run and publication sequence.
