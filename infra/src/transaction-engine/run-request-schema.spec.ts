import { runRequestSchema } from './run-request-schema';

describe('runRequestSchema', () => {
  it('rejects unsafe transfer and compute values', () => {
    expect(() => runRequestSchema.parse({ lamports: 0 })).toThrow();
    expect(() =>
      runRequestSchema.parse({
        lamports: 1,
        computeBudget: { computeUnitLimit: 1_400_001 },
      }),
    ).toThrow();
  });
});
