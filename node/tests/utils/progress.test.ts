/**
 * Tests for Progress Bar Utilities
 */

import { createProgressBar, createMultiProgressBar, withProgress } from '../src/utils/progress.js';

describe('Progress Bar Utilities', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createProgressBar', () => {
    it('should create a progress bar with default options', () => {
      const bar = createProgressBar({ total: 100 });
      expect(bar).toBeDefined();
      expect(bar.getTotal()).toBe(100);
      bar.stop();
    });

    it('should create a progress bar with custom name', () => {
      const bar = createProgressBar({ total: 50, name: 'Testing' });
      expect(bar).toBeDefined();
      bar.stop();
    });

    it('should increment progress correctly', () => {
      const bar = createProgressBar({ total: 10 });
      const startValue = bar.getValue();
      bar.increment();
      expect(bar.getValue()).toBeGreaterThan(startValue || 0);
      bar.stop();
    });

    it('should update progress to specific value', () => {
      const bar = createProgressBar({ total: 100 });
      bar.update(50);
      expect(bar.getValue()).toBe(50);
      bar.stop();
    });
  });

  describe('createMultiProgressBar', () => {
    it('should create a multi progress bar', () => {
      const multiBar = createMultiProgressBar();
      expect(multiBar).toBeDefined();

      const bar1 = multiBar.createBar(100, { name: 'Build' });
      const bar2 = multiBar.createBar(50, { name: 'Test' });

      expect(bar1).toBeDefined();
      expect(bar2).toBeDefined();

      multiBar.stop();
    });

    it('should handle multiple bars independently', () => {
      const multiBar = createMultiProgressBar();

      const bar1 = multiBar.createBar(100, { name: 'First' });
      const bar2 = multiBar.createBar(100, { name: 'Second' });

      bar1.update(50);
      bar2.update(25);

      expect(bar1.getValue()).toBe(50);
      expect(bar2.getValue()).toBe(25);

      multiBar.stop();
    });
  });

  describe('withProgress', () => {
    it('should execute function with progress tracking', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');
      const result = await withProgress(mockFn, { total: 10, name: 'Test' });

      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should pass progress callback to function', async () => {
      const mockFn = jest.fn().mockImplementation(async (updateProgress) => {
        updateProgress(5);
        return 'done';
      });

      const result = await withProgress(mockFn, { total: 10 });
      expect(result).toBe('done');
    });

    it('should handle errors gracefully', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Test error'));

      await expect(withProgress(mockFn, { total: 10 })).rejects.toThrow('Test error');
    });
  });
});
