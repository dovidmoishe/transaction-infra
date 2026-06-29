import { Keypair } from '@solana/web3.js';
import { SubmissionPlannerPort } from '../core/ports';
import { SubmissionPlan } from '../core/types';

export class MockSubmissionPlanner implements SubmissionPlannerPort {
  private currentSlot = 344_100_000;

  async plan(): Promise<SubmissionPlan> {
    this.currentSlot += 1;
    return {
      shouldSubmit: true,
      currentSlot: this.currentSlot,
      nextLeaderSlot: this.currentSlot + 1,
      nextLeaderIdentity: 'mock_jito_leader',
      slotsUntilLeader: 1,
      waitSlots: 0,
      reason: 'Mock planner always submits immediately.',
      source: 'mock',
    };
  }
}

export class JitoLeaderSubmissionPlanner implements SubmissionPlannerPort {
  private clientPromise: Promise<{
    getNextScheduledLeader(): Promise<
      | {
          ok: true;
          value: {
            currentSlot: number;
            nextLeaderSlot: number;
            nextLeaderIdentity: string;
          };
        }
      | { ok: false; error: Error }
    >;
  }> | null = null;

  constructor(
    private readonly searcherGrpcUrl: string,
    private readonly maxWaitSlots: number,
    private readonly authKeypair?: Keypair,
  ) {}

  async plan(): Promise<SubmissionPlan> {
    const client = await this.getClient();
    const result = await client.getNextScheduledLeader();

    if (!result.ok) {
      throw new Error(
        `Failed to fetch next Jito scheduled leader: ${result.error.message}`,
      );
    }

    const slotsUntilLeader =
      result.value.nextLeaderSlot - result.value.currentSlot;
    const shouldSubmit = slotsUntilLeader <= 2;
    const waitSlots = shouldSubmit
      ? 0
      : Math.min(Math.max(slotsUntilLeader - 2, 0), this.maxWaitSlots);

    return {
      shouldSubmit,
      currentSlot: result.value.currentSlot,
      nextLeaderSlot: result.value.nextLeaderSlot,
      nextLeaderIdentity: result.value.nextLeaderIdentity,
      slotsUntilLeader,
      waitSlots,
      reason: shouldSubmit
        ? 'Current slot is close enough to the next connected Jito leader.'
        : `Next connected Jito leader is ${slotsUntilLeader} slots away.`,
      source: 'jito_searcher',
    };
  }

  private getClient() {
    this.clientPromise ??= import('jito-ts').then(({ searcher }) =>
      searcher.searcherClient(this.searcherGrpcUrl, this.authKeypair),
    );
    return this.clientPromise;
  }
}
