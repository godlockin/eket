/**
 * SagaExecutor — compensating transaction pattern for Slaver multi-step execution.
 * Failed steps trigger reverse-order compensation of all previously completed steps.
 * Compensation failures are recorded but never re-thrown.
 */

export interface SagaStep<T> {
  name: string;
  forward: (state: T) => Promise<T>;
  compensate: (state: T) => Promise<void>;
}

export interface SagaResult<T> {
  success: boolean;
  state: T;
  completedSteps: string[];
  failedStep?: string;
  error?: Error;
  compensationErrors: Array<{ step: string; error: Error }>;
}

export class SagaExecutor<T> {
  private steps: SagaStep<T>[] = [];

  addStep(step: SagaStep<T>): this {
    this.steps.push(step);
    return this;
  }

  async execute(initialState: T): Promise<SagaResult<T>> {
    let state = initialState;
    const completed: SagaStep<T>[] = [];
    const compensationErrors: Array<{ step: string; error: Error }> = [];

    for (const step of this.steps) {
      try {
        state = await step.forward(state);
        completed.push(step);
      } catch (err) {
        // Rollback completed steps in reverse order
        for (const done of [...completed].reverse()) {
          try {
            await done.compensate(state);
          } catch (compErr) {
            compensationErrors.push({ step: done.name, error: compErr as Error });
          }
        }
        return {
          success: false,
          state,
          completedSteps: completed.map((s) => s.name),
          failedStep: step.name,
          error: err as Error,
          compensationErrors,
        };
      }
    }

    return {
      success: true,
      state,
      completedSteps: completed.map((s) => s.name),
      compensationErrors: [],
    };
  }
}
