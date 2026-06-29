import { SubmissionPlannerPort, SubmissionWindowPort } from '../core/ports';

export class SubmissionWindowCoordinator implements SubmissionWindowPort {
  constructor(
    private readonly planner: SubmissionPlannerPort,
    private readonly timeoutMs: number,
  ) {}

  async waitForWindow() {
    let plan = await this.planner.plan();
    let waitedSlots = 0;
    const deadline = Date.now() + this.timeoutMs;

    while (!plan.shouldSubmit) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0 || plan.waitSlots <= 0) {
        throw new Error(
          `leader window unavailable before submission timeout; next leader is ${plan.slotsUntilLeader ?? 'unknown'} slots away`,
        );
      }

      const waitMs = Math.min(plan.waitSlots * 400, remainingMs);
      await delay(waitMs);
      waitedSlots += Math.max(1, Math.round(waitMs / 400));
      const nextPlan = await this.planner.plan();
      plan = {
        ...nextPlan,
        reason: `${nextPlan.reason} Waited ${waitedSlots} slot(s) before submission planning continued.`,
      };
    }

    return plan;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
