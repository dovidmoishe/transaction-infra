# Build Context

```yaml
project:
  name: SlotPilot
  type: TypeScript Solana transaction infrastructure
  architecture: modular monolith
  persistence: append-only JSONL
review:
  security_score: B
  quality_score: A
  ready_for_mainnet: false
  findings:
    - severity: high
      category: production-readiness
      description: Live Jito, Yellowstone, OpenAI, and explorer-verifiable evidence has not been produced in this workspace.
      fix: Run the credentialed live runbook and pass the strict live evidence verifier.
    - severity: medium
      category: deployment
      description: The architecture document source exists but has no public deployment URL.
      fix: Deploy the documentation site and publish the /docs/architecture URL.
    - severity: low
      category: documentation
      description: README network observations are intentionally generic until real lifecycle data exists.
      fix: Add measured processed-to-confirmed observations from the final live JSONL package.
```
