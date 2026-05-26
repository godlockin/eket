/**
 * Token Budget Meter
 * TASK-E16-03: Token 预算仪表盘
 *
 * Inspired by ECC TokenMeter + BudgetState mechanism.
 * Provides real-time token usage visualization with 5-level color-coded states.
 */

/**
 * Budget state levels with thresholds
 */
export enum BudgetState {
  /** < 50%: Normal operation */
  Normal = 'Normal',
  /** 50-75%: Usage alert */
  Alert50 = 'Alert50',
  /** 75-90%: Warning level */
  Alert75 = 'Alert75',
  /** 90-100%: Critical, suggest compact */
  Alert90 = 'Alert90',
  /** > 100%: Over budget, force compact */
  OverBudget = 'OverBudget',
}

/**
 * ANSI color codes for terminal output
 */
export const BudgetColors = {
  [BudgetState.Normal]: '\x1b[32m',      // Green
  [BudgetState.Alert50]: '\x1b[33m',     // Yellow
  [BudgetState.Alert75]: '\x1b[38;5;208m', // Orange (256-color)
  [BudgetState.Alert90]: '\x1b[31m',     // Red
  [BudgetState.OverBudget]: '\x1b[38;5;124m', // Dark Red (256-color)
  reset: '\x1b[0m',
} as const;

/**
 * Token usage data
 */
export interface TokenUsage {
  /** Current token count */
  current: number;
  /** Token limit */
  limit: number;
  /** Estimated cost in USD */
  estimatedCost: number;
  /** Current budget state */
  state: BudgetState;
  /** Usage percentage (0-100+) */
  percentage: number;
}

/**
 * Cost rates per 1K tokens (approximation)
 */
export interface CostRates {
  inputRate: number;
  outputRate: number;
}

/**
 * Default cost rates for Claude (approximate)
 */
const DEFAULT_COST_RATES: CostRates = {
  inputRate: 0.003,  // $3 per 1M input tokens
  outputRate: 0.015, // $15 per 1M output tokens
};

/**
 * TokenMeter class for tracking and visualizing token budget
 */
export class TokenMeter {
  private current: number = 0;
  private readonly limit: number;
  private readonly costRates: CostRates;
  private inputTokens: number = 0;
  private outputTokens: number = 0;

  constructor(limit: number = 200000, costRates: CostRates = DEFAULT_COST_RATES) {
    this.limit = limit;
    this.costRates = costRates;
  }

  /**
   * Add input tokens
   */
  addInput(tokens: number): void {
    this.inputTokens += tokens;
    this.current += tokens;
  }

  /**
   * Add output tokens
   */
  addOutput(tokens: number): void {
    this.outputTokens += tokens;
    this.current += tokens;
  }

  /**
   * Add tokens (generic, treated as input for cost calculation)
   */
  add(tokens: number): void {
    this.addInput(tokens);
  }

  /**
   * Set current token count directly
   */
  set(tokens: number): void {
    this.current = tokens;
    // Reset input/output tracking when set directly
    this.inputTokens = tokens;
    this.outputTokens = 0;
  }

  /**
   * Reset token count (e.g., after compact)
   */
  reset(toValue: number = 0): void {
    this.current = toValue;
    this.inputTokens = toValue;
    this.outputTokens = 0;
  }

  /**
   * Get current budget state based on usage percentage
   */
  getState(): BudgetState {
    const percentage = this.getPercentage();

    if (percentage > 100) return BudgetState.OverBudget;
    if (percentage >= 90) return BudgetState.Alert90;
    if (percentage >= 75) return BudgetState.Alert75;
    if (percentage >= 50) return BudgetState.Alert50;
    return BudgetState.Normal;
  }

  /**
   * Get usage percentage
   */
  getPercentage(): number {
    return (this.current / this.limit) * 100;
  }

  /**
   * Estimate cost based on input/output tokens
   */
  getEstimatedCost(): number {
    const inputCost = (this.inputTokens / 1000) * this.costRates.inputRate;
    const outputCost = (this.outputTokens / 1000) * this.costRates.outputRate;
    return inputCost + outputCost;
  }

  /**
   * Get full token usage data
   */
  getUsage(): TokenUsage {
    return {
      current: this.current,
      limit: this.limit,
      estimatedCost: this.getEstimatedCost(),
      state: this.getState(),
      percentage: this.getPercentage(),
    };
  }

  /**
   * Get current token count
   */
  getCurrent(): number {
    return this.current;
  }

  /**
   * Get token limit
   */
  getLimit(): number {
    return this.limit;
  }
}

/**
 * Format number with thousand separators
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Format cost as currency
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Render progress bar for CLI output
 * @param percentage - Usage percentage (0-100+)
 * @param width - Bar width in characters (default 20)
 * @param state - Budget state for coloring
 */
export function renderProgressBar(
  percentage: number,
  width: number = 20,
  state: BudgetState = BudgetState.Normal
): string {
  const fillWidth = Math.min(Math.round((percentage / 100) * width), width);
  const emptyWidth = width - fillWidth;

  const fillChar = '█'; // Full block
  const emptyChar = '░'; // Light shade

  const color = BudgetColors[state];
  const reset = BudgetColors.reset;

  return `${color}${fillChar.repeat(fillWidth)}${reset}${emptyChar.repeat(emptyWidth)}`;
}

/**
 * Render full token budget widget for CLI
 */
export function renderTokenBudgetWidget(usage: TokenUsage, showCost: boolean = true): string {
  const { current, limit, estimatedCost, state, percentage } = usage;

  const progressBar = renderProgressBar(percentage, 20, state);
  const color = BudgetColors[state];
  const reset = BudgetColors.reset;

  const lines: string[] = [
    '┌─ Token Budget ──────────────────┐',
    `│ ${progressBar} ${color}${percentage.toFixed(0)}% ${state}${reset}`,
    `│ ${formatNumber(current)} / ${formatNumber(limit)} tokens`,
  ];

  if (showCost) {
    lines.push(`│ Est. cost: ${formatCost(estimatedCost)}`);
  }

  lines.push('└─────────────────────────────────┘');

  return lines.join('\n');
}

/**
 * Get recommendation message based on budget state
 */
export function getRecommendation(state: BudgetState): string | null {
  switch (state) {
    case BudgetState.Alert75:
      return '⚡ Approaching limit, consider running /compact';
    case BudgetState.Alert90:
      return '⚠️  WARNING: Near limit! Run /compact soon';
    case BudgetState.OverBudget:
      return '🚨 OVER BUDGET: Run /compact immediately!';
    default:
      return null;
  }
}

/**
 * Render compact status line for inline display
 */
export function renderCompactStatus(usage: TokenUsage): string {
  const { current, limit, state, percentage } = usage;
  const color = BudgetColors[state];
  const reset = BudgetColors.reset;

  return `${color}[${formatNumber(current)}/${formatNumber(limit)} ${percentage.toFixed(0)}%]${reset}`;
}

/**
 * Global singleton instance
 */
export const tokenMeter = new TokenMeter();
