# SlotPilot Live Runbook

This runbook produces the real bounty evidence. It does not use a database and does not run migrations.

## 1. Runtime

Run live Yellowstone mode on Linux, macOS, or WSL. The Triton Yellowstone package does not currently publish a Windows native binding.

```bash
cd /path/to/transaction-infra/infra
pnpm install
pnpm run build
pnpm test -- --runInBand
```

## 2. Configure a Clean Live Environment

Use a new log directory so mock records cannot enter the evidence package.

```dotenv
SLOTPILOT_ADAPTER_MODE=live
NETWORK=mainnet-beta
LOG_DIR=logs/live-submission

SOLANA_RPC_URL=https://your-solana-rpc
YELLOWSTONE_GRPC_ENDPOINT=https://your-yellowstone-endpoint
YELLOWSTONE_GRPC_TOKEN=your-token

JITO_BLOCK_ENGINE_URL=https://mainnet.block-engine.jito.wtf
JITO_SEARCHER_GRPC_URL=mainnet.block-engine.jito.wtf:443
JITO_TIP_FLOOR_URL=https://bundles.jito.wtf/api/v1/bundles/tip_floor
JITO_AUTH_UUID=
JITO_AUTH_PRIVATE_KEY=

AGENT_MODE=openai
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1-mini

PAYER_PRIVATE_KEY=your-base58-or-json-secret
RECIPIENT_PUBLIC_KEY=recipient-public-key
```

Do not commit `.env`, payer secrets, provider tokens, or AI credentials.

## 3. Preflight

```bash
pnpm run demo:preflight -- --require-live
```

The command must prove:

- live adapter mode
- OpenAI agent mode
- reachable Solana RPC
- confirmed blockhash fetching
- funded payer
- recent prioritization-fee samples
- Jito tip accounts and landed-tip floor
- Jito searcher leader planning
- a Yellowstone slot stream that advances within five seconds
- enough payer balance for the conservative ten-run budget

Do not continue until every check is `ok: true`.

## 4. Single Success

```bash
pnpm run demo:success
```

Inspect `LOG_DIR/lifecycle.jsonl`. The finalized entry must include:

- real bundle id and transaction signature
- submitted, processed, confirmed, and finalized slots
- timestamps and latency deltas
- `lifecycleSource: "yellowstone"` where available
- Jito leader submission plan
- dynamic tip source and reason

Cross-check the signature and slots in a Solana explorer.

## 5. Autonomous Expired-Blockhash Retry

```bash
pnpm run demo:expired-blockhash
```

Expected sequence:

1. stale transaction attempt
2. `expired_blockhash` classification
3. OpenAI decision with `agentSource: "openai"`
4. refreshed blockhash
5. recalculated tip
6. rebuilt and signed transaction
7. successful Jito resubmission
8. finalized lifecycle proof

Inspect:

- `lifecycle.jsonl`
- `failures.jsonl`
- `agent-decisions.jsonl`

## 6. Ten-Run Evidence

```bash
pnpm run demo:ten-runs
```

The script runs ten scenarios with two expired-blockhash injections. Jito requests are serialized and retries honor the configured minimum delay.

## 7. Verify Evidence

```bash
pnpm run demo:verify-logs -- --require-live
```

The verifier requires:

- 10 unique finalized runs
- a unique transaction signature and bundle id for every finalized run
- at least 2 failures
- failures in at least 2 distinct runs
- an expired-blockhash failure linked to an OpenAI retry, a changed blockhash, and later finalization
- at least 1 OpenAI-owned decision
- no mock bundle ids
- no mock submission plans
- complete signatures, slots, and timestamps
- at least 7 Yellowstone-proven finalized runs

## 8. Publish Architecture

Build the documentation site:

```bash
cd ../site
npm install
npm run build
```

Deploy the site and submit the public `/docs/architecture` URL separately from the GitHub repository URL.

## 9. Final Review

- Confirm the repository contains no secrets.
- Confirm all explorer links resolve.
- Confirm JSONL files contain only the intended live run.
- Record observations from actual `processed -> confirmed` latency in the README.
- Record any skipped-leader or non-landed behavior observed during the run.
- Run both backend and docs builds one final time.
