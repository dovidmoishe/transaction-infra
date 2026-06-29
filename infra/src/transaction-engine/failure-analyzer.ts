import { FailureClassifierPort, SolanaRpcPort } from '../core/ports';
import {
  BlockhashSnapshot,
  BuiltTransaction,
  FailureClass,
} from '../core/types';

export class FailureAnalyzer {
  constructor(
    private readonly solanaRpc: SolanaRpcPort,
    private readonly classifier: FailureClassifierPort,
  ) {}

  async analyze(input: {
    error: unknown;
    transaction: BuiltTransaction | null;
    blockhash: BlockhashSnapshot | null;
  }): Promise<{ failureClass: FailureClass; simulationLogs: string[] | null }> {
    const simulationLogs = input.transaction
      ? await this.simulate(input.transaction)
      : null;
    const currentBlockHeight = await this.solanaRpc.getCurrentBlockHeight();
    return {
      failureClass: this.classifier.classify({
        rawError: input.error,
        simulationLogs: simulationLogs ?? undefined,
        blockhash: input.blockhash,
        currentBlockHeight,
        timedOut: errorMessage(input.error).includes('stream_timeout'),
      }),
      simulationLogs,
    };
  }

  private async simulate(transaction: BuiltTransaction): Promise<string[]> {
    try {
      const simulation = await this.solanaRpc.simulateTransaction(
        transaction.serializedTransaction,
      );
      return simulation.err
        ? [
            `simulation_error: ${JSON.stringify(simulation.err)}`,
            ...simulation.logs,
          ]
        : simulation.logs;
    } catch (error) {
      return [`simulation_error: ${errorMessage(error)}`];
    }
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
