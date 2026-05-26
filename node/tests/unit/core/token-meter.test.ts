/**
 * TokenMeter Unit Tests
 * TASK-E16-03: Token 预算仪表盘
 *
 * Covers:
 * - BudgetState transitions
 * - Token tracking (input/output)
 * - Cost estimation
 * - Progress bar rendering
 * - Widget output formatting
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  TokenMeter,
  BudgetState,
  BudgetColors,
  formatNumber,
  formatCost,
  renderProgressBar,
  renderTokenBudgetWidget,
  getRecommendation,
  renderCompactStatus,
  type TokenUsage,
} from '../../../src/core/token-meter.js';

describe('TokenMeter', () => {
  let meter: TokenMeter;

  beforeEach(() => {
    meter = new TokenMeter(200000);
  });

  describe('constructor', () => {
    it('should initialize with default limit of 200000', () => {
      const defaultMeter = new TokenMeter();
      expect(defaultMeter.getLimit()).toBe(200000);
    });

    it('should accept custom limit', () => {
      const customMeter = new TokenMeter(100000);
      expect(customMeter.getLimit()).toBe(100000);
    });

    it('should start at 0 tokens', () => {
      expect(meter.getCurrent()).toBe(0);
    });
  });

  describe('token tracking', () => {
    it('should add input tokens', () => {
      meter.addInput(5000);
      expect(meter.getCurrent()).toBe(5000);
    });

    it('should add output tokens', () => {
      meter.addOutput(3000);
      expect(meter.getCurrent()).toBe(3000);
    });

    it('should accumulate multiple adds', () => {
      meter.addInput(5000);
      meter.addOutput(3000);
      meter.add(2000);
      expect(meter.getCurrent()).toBe(10000);
    });

    it('should set tokens directly', () => {
      meter.addInput(5000);
      meter.set(10000);
      expect(meter.getCurrent()).toBe(10000);
    });

    it('should reset tokens', () => {
      meter.addInput(50000);
      meter.reset(20000);
      expect(meter.getCurrent()).toBe(20000);
    });

    it('should reset to 0 by default', () => {
      meter.addInput(50000);
      meter.reset();
      expect(meter.getCurrent()).toBe(0);
    });
  });

  describe('BudgetState transitions', () => {
    it('should return Normal for < 50%', () => {
      meter.set(99999); // 49.9995%
      expect(meter.getState()).toBe(BudgetState.Normal);
    });

    it('should return Alert50 for 50-74%', () => {
      meter.set(100000); // 50%
      expect(meter.getState()).toBe(BudgetState.Alert50);

      meter.set(149999); // 74.9995%
      expect(meter.getState()).toBe(BudgetState.Alert50);
    });

    it('should return Alert75 for 75-89%', () => {
      meter.set(150000); // 75%
      expect(meter.getState()).toBe(BudgetState.Alert75);

      meter.set(179999); // 89.9995%
      expect(meter.getState()).toBe(BudgetState.Alert75);
    });

    it('should return Alert90 for 90-100%', () => {
      meter.set(180000); // 90%
      expect(meter.getState()).toBe(BudgetState.Alert90);

      meter.set(200000); // 100%
      expect(meter.getState()).toBe(BudgetState.Alert90);
    });

    it('should return OverBudget for > 100%', () => {
      meter.set(200001); // 100.0005%
      expect(meter.getState()).toBe(BudgetState.OverBudget);

      meter.set(250000); // 125%
      expect(meter.getState()).toBe(BudgetState.OverBudget);
    });
  });

  describe('getPercentage', () => {
    it('should calculate correct percentage', () => {
      meter.set(100000);
      expect(meter.getPercentage()).toBe(50);

      meter.set(150000);
      expect(meter.getPercentage()).toBe(75);

      meter.set(200000);
      expect(meter.getPercentage()).toBe(100);
    });

    it('should handle over 100%', () => {
      meter.set(250000);
      expect(meter.getPercentage()).toBe(125);
    });
  });

  describe('cost estimation', () => {
    it('should calculate input cost', () => {
      // Default rate: $0.003 per 1K input tokens
      meter.addInput(10000); // 10K tokens
      const cost = meter.getEstimatedCost();
      expect(cost).toBeCloseTo(0.03, 5); // $0.03
    });

    it('should calculate output cost', () => {
      // Default rate: $0.015 per 1K output tokens
      meter.addOutput(10000); // 10K tokens
      const cost = meter.getEstimatedCost();
      expect(cost).toBeCloseTo(0.15, 5); // $0.15
    });

    it('should calculate combined cost', () => {
      meter.addInput(10000);  // $0.03
      meter.addOutput(10000); // $0.15
      const cost = meter.getEstimatedCost();
      expect(cost).toBeCloseTo(0.18, 5); // $0.18
    });

    it('should accept custom cost rates', () => {
      const customMeter = new TokenMeter(200000, {
        inputRate: 0.01,
        outputRate: 0.03,
      });
      customMeter.addInput(10000);  // $0.10
      customMeter.addOutput(10000); // $0.30
      expect(customMeter.getEstimatedCost()).toBeCloseTo(0.40, 5);
    });
  });

  describe('getUsage', () => {
    it('should return complete TokenUsage object', () => {
      meter.addInput(100000);
      const usage = meter.getUsage();

      expect(usage.current).toBe(100000);
      expect(usage.limit).toBe(200000);
      expect(usage.percentage).toBe(50);
      expect(usage.state).toBe(BudgetState.Alert50);
      expect(typeof usage.estimatedCost).toBe('number');
    });
  });
});

describe('formatNumber', () => {
  it('should format with thousand separators', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(124000)).toBe('124,000');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('should handle small numbers', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });
});

describe('formatCost', () => {
  it('should format as currency with 2 decimal places', () => {
    expect(formatCost(1.24)).toBe('$1.24');
    expect(formatCost(0.5)).toBe('$0.50');
    expect(formatCost(10)).toBe('$10.00');
  });

  it('should round appropriately', () => {
    expect(formatCost(1.234)).toBe('$1.23');
    expect(formatCost(1.235)).toBe('$1.24');
  });
});

describe('renderProgressBar', () => {
  it('should render correct fill/empty ratio', () => {
    // 50% of 20 chars = 10 filled, 10 empty
    const bar = renderProgressBar(50, 20, BudgetState.Normal);
    // Count filled blocks (ignoring ANSI codes)
    const stripped = bar.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).toMatch(/^█{10}░{10}$/);
  });

  it('should cap at 100% fill', () => {
    const bar = renderProgressBar(150, 20, BudgetState.OverBudget);
    const stripped = bar.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).toMatch(/^█{20}$/);
  });

  it('should handle 0%', () => {
    const bar = renderProgressBar(0, 20, BudgetState.Normal);
    const stripped = bar.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripped).toMatch(/^░{20}$/);
  });

  it('should include correct color codes', () => {
    const normalBar = renderProgressBar(25, 10, BudgetState.Normal);
    expect(normalBar).toContain(BudgetColors[BudgetState.Normal]);

    const alertBar = renderProgressBar(60, 10, BudgetState.Alert50);
    expect(alertBar).toContain(BudgetColors[BudgetState.Alert50]);
  });
});

describe('renderTokenBudgetWidget', () => {
  const mockUsage: TokenUsage = {
    current: 124000,
    limit: 200000,
    estimatedCost: 1.24,
    state: BudgetState.Alert50,
    percentage: 62,
  };

  it('should include header and footer', () => {
    const widget = renderTokenBudgetWidget(mockUsage);
    expect(widget).toContain('┌─ Token Budget');
    expect(widget).toContain('└─────────────');
  });

  it('should include progress bar', () => {
    const widget = renderTokenBudgetWidget(mockUsage);
    expect(widget).toContain('█');
  });

  it('should include percentage and state', () => {
    const widget = renderTokenBudgetWidget(mockUsage);
    expect(widget).toContain('62%');
    expect(widget).toContain('Alert50');
  });

  it('should include token counts with formatting', () => {
    const widget = renderTokenBudgetWidget(mockUsage);
    expect(widget).toContain('124,000');
    expect(widget).toContain('200,000');
  });

  it('should include cost when showCost is true', () => {
    const widget = renderTokenBudgetWidget(mockUsage, true);
    expect(widget).toContain('Est. cost: $1.24');
  });

  it('should omit cost when showCost is false', () => {
    const widget = renderTokenBudgetWidget(mockUsage, false);
    expect(widget).not.toContain('Est. cost');
  });
});

describe('getRecommendation', () => {
  it('should return null for Normal and Alert50', () => {
    expect(getRecommendation(BudgetState.Normal)).toBeNull();
    expect(getRecommendation(BudgetState.Alert50)).toBeNull();
  });

  it('should return suggestion for Alert75', () => {
    const rec = getRecommendation(BudgetState.Alert75);
    expect(rec).toContain('compact');
  });

  it('should return warning for Alert90', () => {
    const rec = getRecommendation(BudgetState.Alert90);
    expect(rec).toContain('WARNING');
    expect(rec).toContain('/compact');
  });

  it('should return urgent message for OverBudget', () => {
    const rec = getRecommendation(BudgetState.OverBudget);
    expect(rec).toContain('OVER BUDGET');
    expect(rec).toContain('immediately');
  });
});

describe('renderCompactStatus', () => {
  it('should render inline status with color', () => {
    const usage: TokenUsage = {
      current: 100000,
      limit: 200000,
      estimatedCost: 0.5,
      state: BudgetState.Alert50,
      percentage: 50,
    };

    const status = renderCompactStatus(usage);
    expect(status).toContain('100,000');
    expect(status).toContain('200,000');
    expect(status).toContain('50%');
    expect(status).toContain(BudgetColors[BudgetState.Alert50]);
  });
});
