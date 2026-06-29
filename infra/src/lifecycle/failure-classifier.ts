import { FailureClassifierPort } from '../core/ports';
import { BlockhashSnapshot, FailureClass } from '../core/types';

export class FailureClassifier implements FailureClassifierPort {
  classify(input: {
    rawError?: unknown;
    simulationLogs?: string[];
    timedOut?: boolean;
    blockhash?: BlockhashSnapshot | null;
    currentBlockHeight?: number | null;
  }): FailureClass {
    const rawErrorText =
      input.rawError instanceof Error
        ? `${input.rawError.name} ${input.rawError.message} ${input.rawError.stack ?? ''}`
        : input.rawError
          ? JSON.stringify(input.rawError)
          : '';
    const text = [rawErrorText, ...(input.simulationLogs ?? [])]
      .join(' ')
      .toLowerCase();

    if (
      text.includes('blockhash') ||
      text.includes('block height exceeded') ||
      (input.blockhash &&
        input.currentBlockHeight !== null &&
        input.currentBlockHeight !== undefined &&
        input.currentBlockHeight > input.blockhash.lastValidBlockHeight)
    ) {
      return 'expired_blockhash';
    }

    if (
      text.includes('insufficient funds for fee') ||
      text.includes('tip') ||
      text.includes('auction')
    ) {
      return 'fee_or_tip_too_low';
    }

    if (text.includes('compute') && text.includes('exceed')) {
      return 'compute_exceeded';
    }

    if (text.includes('simulation') || text.includes('simulate')) {
      return 'simulation_failed';
    }

    if (
      text.includes('leader') &&
      (text.includes('skip') ||
        text.includes('unavailable') ||
        text.includes('no upcoming'))
    ) {
      return 'skipped_leader';
    }

    if (input.timedOut) {
      return 'stream_timeout';
    }

    if (text.includes('bundle') && text.includes('not')) {
      return 'bundle_not_landed';
    }

    return 'unknown';
  }
}
