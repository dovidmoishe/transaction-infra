export type TransactionMemoKind = 'user' | 'tip';

export function transactionMemo(
  runId: string,
  kind: TransactionMemoKind,
  attempt: number,
): string {
  return `${runId}:${kind}:${attempt}`;
}
