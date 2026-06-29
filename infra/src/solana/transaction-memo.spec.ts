import { transactionMemo } from './transaction-memo';

describe('transactionMemo', () => {
  it('is unique across runs, transaction kinds, and attempts', () => {
    const memos = [
      transactionMemo('run-one', 'user', 1),
      transactionMemo('run-two', 'user', 1),
      transactionMemo('run-one', 'tip', 1),
      transactionMemo('run-one', 'user', 2),
    ];

    expect(new Set(memos).size).toBe(memos.length);
  });
});
