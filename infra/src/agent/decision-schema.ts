import { z } from 'zod';

export const agentDecisionSchema = z.object({
  decision: z.enum(['retry', 'hold', 'abort']),
  reason: z.string().min(1),
  refreshBlockhash: z.boolean(),
  tipMultiplier: z.number().min(0.1).max(10),
  delaySlots: z.number().int().min(0).max(64),
});
