import { SagaExecutor, type SagaStep } from '../../src/core/saga-executor.js';

describe('SagaExecutor', () => {
  // Helper: build a simple step
  function makeStep<T>(
    name: string,
    forward: (state: T) => Promise<T>,
    compensate: (state: T) => Promise<void> = async () => {}
  ): SagaStep<T> {
    return { name, forward, compensate };
  }

  test('empty executor succeeds immediately', async () => {
    const executor = new SagaExecutor<number>();
    const result = await executor.execute(0);
    expect(result.success).toBe(true);
    expect(result.completedSteps).toHaveLength(0);
    expect(result.compensationErrors).toHaveLength(0);
    expect(result.state).toBe(0);
  });

  test('all steps succeed → result.success = true, completedSteps = all', async () => {
    const executor = new SagaExecutor<number>();
    executor
      .addStep(makeStep('step1', async (n) => n + 1))
      .addStep(makeStep('step2', async (n) => n + 10))
      .addStep(makeStep('step3', async (n) => n + 100));

    const result = await executor.execute(0);
    expect(result.success).toBe(true);
    expect(result.completedSteps).toEqual(['step1', 'step2', 'step3']);
    expect(result.state).toBe(111);
    expect(result.failedStep).toBeUndefined();
    expect(result.compensationErrors).toHaveLength(0);
  });

  test('step2 fails → compensate step1 called, result.success = false, failedStep = step2', async () => {
    const compensated: string[] = [];

    const executor = new SagaExecutor<number>();
    executor
      .addStep(
        makeStep(
          'step1',
          async (n) => n + 1,
          async () => { compensated.push('step1'); }
        )
      )
      .addStep(
        makeStep('step2', async () => { throw new Error('step2 failed'); })
      );

    const result = await executor.execute(0);
    expect(result.success).toBe(false);
    expect(result.failedStep).toBe('step2');
    expect(result.completedSteps).toEqual(['step1']);
    expect(compensated).toEqual(['step1']);
    expect(result.error?.message).toBe('step2 failed');
  });

  test('step3 fails → compensate step2+step1 called in reverse order', async () => {
    const compensated: string[] = [];

    const executor = new SagaExecutor<number>();
    executor
      .addStep(
        makeStep(
          'step1',
          async (n) => n + 1,
          async () => { compensated.push('step1'); }
        )
      )
      .addStep(
        makeStep(
          'step2',
          async (n) => n + 10,
          async () => { compensated.push('step2'); }
        )
      )
      .addStep(
        makeStep('step3', async () => { throw new Error('step3 failed'); })
      );

    const result = await executor.execute(0);
    expect(result.success).toBe(false);
    expect(result.failedStep).toBe('step3');
    expect(result.completedSteps).toEqual(['step1', 'step2']);
    // Reverse order: step2 compensated before step1
    expect(compensated).toEqual(['step2', 'step1']);
  });

  test('compensate failure is recorded in compensationErrors but does not throw', async () => {
    const executor = new SagaExecutor<number>();
    executor
      .addStep(
        makeStep(
          'step1',
          async (n) => n + 1,
          async () => { throw new Error('compensate step1 failed'); }
        )
      )
      .addStep(
        makeStep('step2', async () => { throw new Error('step2 failed'); })
      );

    const result = await executor.execute(0);
    expect(result.success).toBe(false);
    expect(result.compensationErrors).toHaveLength(1);
    expect(result.compensationErrors[0].step).toBe('step1');
    expect(result.compensationErrors[0].error.message).toBe('compensate step1 failed');
  });

  test('state is passed through correctly between steps', async () => {
    interface State { log: string[] }
    const executor = new SagaExecutor<State>();
    executor
      .addStep(makeStep('a', async (s) => ({ log: [...s.log, 'a'] })))
      .addStep(makeStep('b', async (s) => ({ log: [...s.log, 'b'] })))
      .addStep(makeStep('c', async (s) => ({ log: [...s.log, 'c'] })));

    const result = await executor.execute({ log: [] });
    expect(result.state.log).toEqual(['a', 'b', 'c']);
  });

  test('addStep returns this for chaining', () => {
    const executor = new SagaExecutor<number>();
    const returned = executor.addStep(makeStep('s', async (n) => n));
    expect(returned).toBe(executor);
  });
});
