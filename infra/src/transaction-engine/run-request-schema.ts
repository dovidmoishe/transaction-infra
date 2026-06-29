import { z } from 'zod';

export const runRequestSchema = z.object({
  lamports: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  faultInjection: z.enum(['expired_blockhash']).optional(),
  maxAttempts: z.number().int().min(1).max(20).optional(),
  computeBudget: z
    .object({
      computeUnitLimit: z.number().int().min(1).max(1_400_000).optional(),
      computeUnitPriceMicroLamports: z
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .optional(),
    })
    .optional(),
});
