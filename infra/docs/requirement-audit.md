# SlotPilot Bounty Requirement Audit

This audit distinguishes implementation evidence from external live evidence.
Passing mock tests does not prove a real Jito or Yellowstone run.

## Architecture And Repository

| Requirement | Status | Evidence |
| --- | --- | --- |
| Modular monolith | Proven | `src/runtime.ts` composes provider ports and focused modules in one process. |
| TypeScript/Node.js | Proven | `package.json`, `tsconfig.json`, and passing build. |
| Open source | Code-ready | MIT `LICENSE` exists; publishing the repository is external. |
| Public architecture URL separate from GitHub | Missing external evidence | Architecture source exists in `docs/architecture.md` and the documentation site, but no public URL is configured. |
| No database | Proven | JSONL store is the only persistence layer; there are no database dependencies or migrations. |

## Solana And Jito Stack

| Requirement | Status | Evidence |
| --- | --- | --- |
| Confirmed/processed blockhash, never finalized | Proven | `src/solana/blockhash-manager.ts` and `src/solana/connection.ts`. |
| Signed SOL transfer with optional compute budget | Proven | `src/solana/transaction-builder.ts`. |
| Intentional expired-blockhash transaction | Proven locally and attempted live | Stale blockhash construction and wire-preserving simulation are implemented; live logs include OpenAI decisions for expired-blockhash attempts. |
| Dynamic Jito tip accounts and amount | Proven by tests and live preflight | Jito median floor, priority-fee pressure, failure multiplier, agent multiplier, rotation, and bounds. |
| Real base64 `sendBundle` request | Proven by code and live attempts | `src/jito/jito-client.ts`, `src/jito/bundle-builder.ts`, and live bundle IDs in evidence logs. |
| Leader-window planning | Proven live | Live preflight returned `submissionPlanSource: jito_searcher`. |
| Jito request rate limit and timeout | Proven | Serialized requests, configurable minimum interval, and abort timeout. |

## Yellowstone Lifecycle

| Requirement | Status | Evidence |
| --- | --- | --- |
| Live slot stream | Proven live | Docker preflight captured Yellowstone initial and advanced slots from Solinfra. |
| Signature transaction stream | Proven by code/tests | Signature filter, normalized updates, and lifecycle state tests. |
| Reconnect and replay | Proven by unit test | Reconnect preserves state and resubscribes from `submittedSlot`. |
| Processed, confirmed, finalized | Proven by unit test | Transaction status plus ancestor slot commitment handling. |
| RPC only as fallback | Proven by engine test | Lifecycle tracker attempts Yellowstone first and reconciles through RPC only after timeout. |
| Bounded stream state | Proven | Parent-slot map is capped at 2,048 entries. |

## Failure And AI Recovery

| Requirement | Status | Evidence |
| --- | --- | --- |
| Required failure classes | Proven by code | `src/lifecycle/failure-classifier.ts`. |
| Blockheight-based expiry context | Proven by unit test | Ambiguous provider errors classify as expiry after last valid block height. |
| Strict AI decision JSON | Proven by schema/tests | Zod validates retry/hold/abort, multiplier, refresh, and delay. |
| AI isolated from keys/signing | Proven by architecture | Agent receives only `FailureContext`; executor owns operational effects. |
| AI decision changes retry | Proven by engine tests | Refresh choice, multiplier, delay, hold re-evaluation, and abort are executed. |
| Real OpenAI expired-blockhash recovery | Partially proven live | Live logs show `agentSource: openai`, `agentModel: gpt-4.1-mini`, and retry/refresh decisions. Finalization after recovery is still missing. |

## Evidence And Demos

| Requirement | Status | Evidence |
| --- | --- | --- |
| Success CLI | Proven locally | `demo:success`. |
| Expired-blockhash CLI | Proven locally | `demo:expired-blockhash`. |
| Ten-run CLI | Proven locally | Fresh run produced 10 unique finalized mock runs and 2 distinct failure runs. |
| Separate append-only JSONL files | Proven locally | Lifecycle, failures, and agent decisions are serialized and cross-checked. |
| 10 real bundle submissions | Attempted live, not verifier-passing | Live attempts produced real Jito bundle IDs, but not 10 finalized runs. |
| At least 2 real failure cases | Proven live | Live logs include multiple real failure entries and OpenAI retry decisions. |
| Explorer-verifiable slots/signatures | Missing external evidence | Requires live JSONL package. |
| Public architecture document | Missing external evidence | Requires deployment. |

## Quality Gates

- `pnpm run check`: lint, build, 25 unit tests, and 1 e2e test.
- Compiled ten-run demo: 10 finalized runs, 10 unique signatures, 10 unique bundle IDs, 2 distinct failure runs.
- Strict verifier rejects mock evidence in `--require-live` mode.
- Documentation TypeScript check passes.
- Docker image build passes.
- Live Docker preflight passes for configuration, Solana RPC, Jito, and Yellowstone.
- Strict live verifier still fails because finalized live bundle evidence is not complete.

## Remaining Completion Sequence

1. Resolve Jito bundle landing/non-landed outcome for finalized evidence.
2. Run `demo:ten-runs` in Docker with a clean `LOG_DIR`.
3. Run `demo:verify-logs -- --require-live`.
4. Cross-check every finalized signature and slot in an explorer.
5. Deploy the docs site and record its public `/docs/architecture` URL.
