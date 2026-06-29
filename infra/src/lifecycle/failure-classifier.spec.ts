import { FailureClassifier } from './failure-classifier';

describe('FailureClassifier', () => {
  it('classifies expired blockhash errors', () => {
    const classifier = new FailureClassifier();

    expect(
      classifier.classify({
        rawError: new Error('Blockhash not found: simulated expired blockhash'),
      }),
    ).toBe('expired_blockhash');
  });

  it('classifies stream timeouts', () => {
    const classifier = new FailureClassifier();

    expect(classifier.classify({ timedOut: true })).toBe('stream_timeout');
  });

  it('uses block height context when the provider error is ambiguous', () => {
    const classifier = new FailureClassifier();

    expect(
      classifier.classify({
        rawError: new Error('bundle rejected'),
        blockhash: {
          blockhash: '11111111111111111111111111111111',
          lastValidBlockHeight: 100,
          fetchedSlot: 1,
          fetchedAt: '2026-06-23T00:00:00.000Z',
          commitment: 'confirmed',
        },
        currentBlockHeight: 101,
      }),
    ).toBe('expired_blockhash');
  });
});
