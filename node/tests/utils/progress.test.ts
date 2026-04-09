/**
 * Tests for Progress Bar Utilities
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createProgressBar, createMultiProgressBar, withProgress } from '../../src/utils/progress';

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
      bar.stop();
    });

    it('should create a progress bar with custom name', () => {
      const bar = createProgressBar({ total: 50, name: 'Testing' });
      expect(bar).toBeDefined();
      bar.stop();
    });

    it('should increment progress correctly', () => {
      const bar = createProgressBar({ total: 10 });
      bar.increment();
      bar.increment();
      bar.stop();
    });

    it('should update progress to specific value', () => {
      const bar = createProgressBar({ total: 100 });
      bar.update(50);
      bar.stop();
    });
  });

  describe('createMultiProgressBar', () => {
    it('should create a multi progress bar', () => {
      const multiBar = createMultiProgressBar();
      expect(multiBar).toBeDefined();

      const bar1 = multiBar.create(100, { name: 'Build' });
      const bar2 = multiBar.create(50, { name: 'Test' });

      expect(bar1).toBeDefined();
      expect(bar2).toBeDefined();

      multiBar.stop();
    });

    it('should handle multiple bars independently', () => {
      const multiBar = createMultiProgressBar();

      const bar1 = multiBar.create(100, { name: 'First' });
      const bar2 = multiBar.create(100, { name: 'Second' });

      bar1.update(50);
      bar2.update(25);

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
      const mockFn = jest.fn().mockImplementation(async (bar: any) => {
        bar.increment();
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
