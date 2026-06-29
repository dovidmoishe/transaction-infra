import {
  AgentDecisionPort,
  RetryDecisionExecutorPort,
  SolanaRpcPort,
  StreamPort,
} from '../core/ports';
import { AgentDecision, FailureContext } from '../core/types';

export class RetryDecisionExecutor implements RetryDecisionExecutorPort {
  readonly source: 'rule' | 'openai';
  readonly model?: string;

  constructor(
    private readonly agent: AgentDecisionPort,
    private readonly solanaRpc: SolanaRpcPort,
    private readonly stream: StreamPort,
    private readonly minimumDelayMs: number,
    private readonly maxHoldCycles: number,
  ) {
    this.source = agent.source;
    this.model = agent.model;
  }

  async resolve(
    context: FailureContext,
    onDecision: (decision: AgentDecision) => Promise<void>,
  ) {
    let decision = await this.agent.decide(context);
    await onDecision(decision);

    let holdCycles = 0;
    while (decision.decision === 'hold' && holdCycles < this.maxHoldCycles) {
      const holdDelayMs = Math.max(
        decision.delaySlots * 400,
        this.minimumDelayMs,
      );
      if (holdDelayMs > 0) {
        await delay(holdDelayMs);
      }
      holdCycles += 1;
      decision = await this.agent.decide({
        ...context,
        currentSlot:
          this.stream.getCurrentSlot() ??
          (await this.solanaRpc.getCurrentSlot()),
        rawError: `${String(
          context.rawError,
        )}; re-evaluation after hold cycle ${holdCycles}`,
      });
      await onDecision(decision);
    }

    return {
      decision,
      holdCycles,
      holdLimitReached: decision.decision === 'hold',
      retryDelayMs:
        decision.decision === 'retry'
          ? Math.max(decision.delaySlots * 400, this.minimumDelayMs)
          : 0,
    };
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
