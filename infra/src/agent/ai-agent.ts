import OpenAI from 'openai';
import { AgentDecisionPort } from '../core/ports';
import { AgentDecision, FailureContext } from '../core/types';
import { agentDecisionSchema } from './decision-schema';
import { buildRetryPrompt } from './prompts';

export class RuleBasedAgent implements AgentDecisionPort {
  readonly source = 'rule' as const;

  async decide(context: FailureContext): Promise<AgentDecision> {
    if (context.failureClass === 'expired_blockhash') {
      return {
        decision: 'retry',
        reason:
          'The failure indicates the blockhash expired before landing. Refresh blockhash, recalculate tip, and resubmit.',
        refreshBlockhash: true,
        tipMultiplier: 1.2,
        delaySlots: 0,
      };
    }

    if (
      context.failureClass === 'fee_or_tip_too_low' ||
      context.failureClass === 'bundle_not_landed'
    ) {
      return {
        decision: 'retry',
        reason:
          'Landing probability appears weak. Increase the bundle tip and retry with fresh context.',
        refreshBlockhash: true,
        tipMultiplier: 1.5,
        delaySlots: 1,
      };
    }

    if (context.failureClass === 'compute_exceeded') {
      return {
        decision: 'abort',
        reason:
          'Compute exhaustion is not safely recoverable by resubmitting the same transaction.',
        refreshBlockhash: false,
        tipMultiplier: 1,
        delaySlots: 0,
      };
    }

    return {
      decision: 'hold',
      reason:
        'The failure is ambiguous. Hold briefly so the stack can collect fresher slot and status context.',
      refreshBlockhash: true,
      tipMultiplier: 1.1,
      delaySlots: 2,
    };
  }
}

export class OpenAiRetryAgent implements AgentDecisionPort {
  readonly source = 'openai' as const;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    baseURL?: string,
  ) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  async decide(context: FailureContext): Promise<AgentDecision> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a Solana transaction operations agent. Return strict JSON only.',
        },
        { role: 'user', content: buildRetryPrompt(context) },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI agent returned an empty decision');
    }

    const parsedJson = JSON.parse(content) as unknown;
    return agentDecisionSchema.parse(parsedJson);
  }
}
