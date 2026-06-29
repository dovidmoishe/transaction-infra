# SlotPilot Submission Brief

## Tagline

SlotPilot is an AI-assisted Solana transaction control tower that submits Jito bundles, watches Yellowstone lifecycle data, classifies failures, and lets an OpenAI retry agent decide recovery actions.

## What Works

- TypeScript/Node modular monolith with no database.
- Dockerized Linux runtime.
- Live preflight passes for Solana RPC, Jito tip accounts, Jito leader planning, OpenAI mode, and Solinfra Yellowstone slot streaming.
- Jito `sendBundle` integration returns real bundle IDs.
- OpenAI retry agent is active in live logs and returns strict JSON decisions.
- JSONL evidence store records lifecycle, failures, and agent decisions.
- Strict verifier exists and rejects incomplete or mock evidence.

## Current Caveat

The code is submission-ready as infrastructure, but the final strict live evidence package is not complete yet. Live attempts produced real bundle IDs and AI retry decisions, but did not produce 10 finalized Jito bundle runs before the deadline.

## Recommended Track

Infrastructure / AI Agents.

## Demo Commands

```bash
cd infra
docker build -t slotpilot .
docker run --rm --env-file .env -v "$PWD/logs:/app/logs" slotpilot \
  node dist/demo/preflight.js --require-live
```

## Project Description

SlotPilot treats Solana transaction delivery as an operational lifecycle instead of a single RPC call. It builds signed transfers, prices Jito tips, submits through Jito bundles, watches live Yellowstone data, classifies failures, and records append-only JSONL evidence for every attempt.

The system is designed for developers and operators who need to understand why a transaction landed, stalled, expired, or failed. The AI agent does not hold keys or submit transactions. It receives bounded failure context and returns a strict retry, hold, or abort decision, including whether to refresh the blockhash, increase tip, or wait.

The implementation uses Solana RPC for blockhashes, simulation, and fallback reconciliation; Jito Block Engine for bundle submission and leader planning; Yellowstone gRPC for live slot and signature lifecycle observation; and OpenAI for retry decisions. The architecture is a modular TypeScript monolith with provider ports, making each external system replaceable without changing the transaction engine.

The project includes Dockerized live preflight, mock demos, real-provider adapters, failure classification, OpenAI decision attribution, and a strict verifier for final live evidence packages.
