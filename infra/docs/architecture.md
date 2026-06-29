# SlotPilot Architecture Draft

SlotPilot is a modular monolith for Solana transaction operations. The core stack observes live Solana state through Yellowstone/Geyser, submits Jito bundles, tracks lifecycle stages, classifies failures, and delegates retry decisions to an AI agent.

## Components

- Solana RPC adapter: blockhash, slot, block height, simulation, and signature-status fallback.
- Yellowstone stream adapter: normalized events, reconnecting slot stream, signature replay from the submission slot, and bounded parent-slot state.
- Submission planner: records current slot and provides submission context.
- Jito leader planner: uses `getNextScheduledLeader` when `JITO_SEARCHER_GRPC_URL` is configured.
- Blockhash manager: fetches `confirmed` blockhashes and detects expiry risk.
- Transaction builder: builds signed SOL transfer and tip transactions.
- Tip oracle: fetches Jito tip accounts and applies bounded dynamic tip logic.
- Jito bundle submitter: submits base64-encoded user transaction plus tip transaction.
- Lifecycle tracker: records submitted, processed, confirmed, and finalized stages.
- Failure classifier: normalizes raw errors into operational classes.
- AI retry agent: receives context and returns retry/hold/abort JSON.
- Retry executor: refreshes blockhash, recalculates tip, delays, and resubmits.
- JSONL store: append-only proof logs.

## Data Flow

```txt
Yellowstone Stream -> Slot Context
Solana RPC -> Blockhash Manager -> Transaction Builder
Jito Tip Accounts -> Tip Oracle -> Tip Transaction
User Tx + Tip Tx -> Jito Bundle Submitter -> Bundle Id
Stream Updates + Replay -> Lifecycle Tracker -> JSONL Logs
Failure -> Classifier -> AI Agent -> Retry Executor
```

## Infrastructure Decisions

- Modular monolith instead of microservices to keep latency and demo complexity low.
- JSONL instead of a database for simple, auditable proof artifacts.
- Yellowstone primary lifecycle source, with RPC only as fallback/reconciliation.
- Submission timestamps are captured before the Jito request, and lifecycle subscriptions replay from the recorded slot.
- AI separated from signing/submission. It only returns operational decisions.
- CLI demos are first-class because the bounty requires reproducible evidence.

## Failure Handling

The classifier supports:

- `expired_blockhash`
- `fee_or_tip_too_low`
- `compute_exceeded`
- `bundle_not_landed`
- `skipped_leader`
- `simulation_failed`
- `stream_timeout`
- `unknown`

For the required autonomous retry demo, SlotPilot intentionally injects an expired blockhash, classifies the failure, asks the agent for a decision, refreshes the blockhash, recalculates the tip, rebuilds, signs, and resubmits.
