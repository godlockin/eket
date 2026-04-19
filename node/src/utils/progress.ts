/**
 * EKET Framework - Progress Bar Utilities
 *
 * Provides progress bar support for long-running operations using cli-progress.
 *
 * Features:
 * - Single bar for simple operations
 * - Multi bar for complex operations with multiple stages
 * - Consistent styling across the CLI
 */

import cliProgress, { MultiBar, Presets, SingleBar } from 'cli-progress';

/**
 * Progress bar configuration
 */
export interface ProgressBarConfig {
  /** Total steps */
  total: number;
  /** Progress bar name/label */
  name?: string;
  /** Show percentage */
  showPercentage?: boolean;
  /** Custom format */
  format?: string;
}

/**
 * Progress step for multi-step operations
 */
export interface ProgressStep {
  /** Step name */
  name: string;
  /** Steps weight (for proportional progress) */
  weight: number;
  /** Current step progress (0-1) */
  progress: number;
}

/**
 * Create a single progress bar
 *
 * @example
 * const bar = createProgressBar({ total: 100, name: 'Building' });
 * for (let i = 0; i < 100; i++) {
 *   // do work
 *   bar.increment();
 * }
 * bar.stop();
 */
export function createProgressBar(config: ProgressBarConfig): SingleBar {
  const {
    total,
    name = 'Progress',
    showPercentage = true,
    format = '{bar} {percentage}% | {value}/{total} | {name}',
  } = config;

  const bar = new cliProgress.SingleBar(
    {
      format: format.replace('{name}', name),
      hideCursor: true,
      clearOnComplete: false,
      stopOnComplete: true,
      forceRedraw: true,
      synchronousUpdate: false,
      noTTYOutput: true,
    },
    Presets.shades_classic
  );

  bar.start(total, 0, { name });

  if (showPercentage) {
    // Percentage is already included in format
  }

  return bar;
}

/**
 * Create a multi progress bar for multiple concurrent operations
 *
 * @example
 * const multi = createMultiProgressBar();
 * const bar1 = multi.createBar(100, 'Building');
 * const bar2 = multi.createBar(50, 'Testing');
 *
 * // Update bars independently
 * bar1.increment();
 * bar2.increment();
 *
 * multi.stop();
 */
export function createMultiProgressBar(): MultiBar {
  return new cliProgress.MultiBar(
    {
      format: '{bar} {percentage}% | {value}/{total} | {name}',
      clearOnComplete: false,
      stopOnComplete: true,
      hideCursor: true,
    },
    Presets.shades_classic
  );
}

/**
 * Execute an async operation with progress tracking
 *
 * @example
 * await withProgress(
 *   async (bar) => {
 *     for (const item of items) {
 *       await processItem(item);
 *       bar.increment();
 *     }
 *   },
 *   { total: items.length, name: 'Processing' }
 * );
 */
export async function withProgress<T>(
  operation: (bar: SingleBar) => Promise<T>,
  config: ProgressBarConfig
): Promise<T> {
  const bar = createProgressBar(config);

  try {
    const result = await operation(bar);
    bar.update(bar.getTotal());
    return result;
  } finally {
    bar.stop();
  }
}

/**
 * Multi-step progress tracker
 *
 * @example
 * const tracker = new MultiStepProgress([
 *   { name: 'Initializing', weight: 1, progress: 0 },
 *   { name: 'Processing', weight: 3, progress: 0 },
 *   { name: 'Finalizing', weight: 1, progress: 0 },
 * ]);
 *
 * tracker.start();
 * await tracker.runStep('Initializing', async () => { ... });
 * await tracker.runStep('Processing', async () => { ... });
 * await tracker.runStep('Finalizing', async () => { ... });
 * tracker.complete();
 */
export class MultiStepProgress {
  private steps: ProgressStep[];
  private bar: SingleBar | null = null;
  private currentStepIndex = 0;
  private totalWeight: number;

  constructor(steps: ProgressStep[]) {
    this.steps = steps;
    this.totalWeight = steps.reduce((sum, step) => sum + step.weight, 0);
  }

  /**
   * Start the progress tracker
   */
  start(): void {
    this.bar = createProgressBar({
      total: 100,
      name: this.steps[0]?.name || 'Processing',
    });
    this.currentStepIndex = 0;
  }

  /**
   * Move to next step
   */
  nextStep(): void {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      if (this.bar) {
        this.bar.update({
          name: this.steps[this.currentStepIndex].name,
        });
      }
    }
  }

  /**
   * Update current step progress
   */
  updateStepProgress(progress: number): void {
    const currentStep = this.steps[this.currentStepIndex];
    if (!currentStep || !this.bar) {return;}

    currentStep.progress = progress;

    // Calculate overall progress
    let completedWeight = 0;
    for (let i = 0; i < this.currentStepIndex; i++) {
      completedWeight += this.steps[i].weight;
    }
    completedWeight += currentStep.weight * progress;

    const overallProgress = Math.round((completedWeight / this.totalWeight) * 100);
    this.bar.update(overallProgress);
  }

  /**
   * Run a step with progress tracking
   */
  async runStep<T>(
    stepName: string,
    operation: () => Promise<T>,
    totalSteps?: number
  ): Promise<T> {
    const stepIndex = this.steps.findIndex((s) => s.name === stepName);
    if (stepIndex !== -1) {
      this.currentStepIndex = stepIndex;
      if (this.bar) {
        this.bar.update({ name: stepName });
      }
    }

    if (totalSteps) {
      const stepBar = createProgressBar({
        total: totalSteps,
        name: stepName,
      });

      try {
        const result = await operation();
        stepBar.update(totalSteps);
        this.updateStepProgress(1);
        return result;
      } finally {
        stepBar.stop();
      }
    } else {
      const result = await operation();
      this.updateStepProgress(1);
      return result;
    }
  }

  /**
   * Mark progress as complete
   */
  complete(): void {
    if (this.bar) {
      this.bar.update(100);
      this.bar.stop();
    }
  }

  /**
   * Stop without completing
   */
  stop(): void {
    if (this.bar) {
      this.bar.stop();
    }
  }
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
