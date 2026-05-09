/**
 * Unit tests for ContextTracker
 * TASK-602
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContextTracker } from '../../src/core/context-tracker.js';

describe('ContextTracker', () => {
  let tracker: ContextTracker;

  beforeEach(() => {
    tracker = new ContextTracker();
  });

  describe('trackToolOutput', () => {
    it('should accumulate tokens correctly', () => {
      // 3500 chars = ~1000 tokens
      const output = 'x'.repeat(3500);

      tracker.trackToolOutput('session-1', output);
      expect(tracker.getSessionTokens('session-1')).toBe(1000);

      tracker.trackToolOutput('session-1', output);
      expect(tracker.getSessionTokens('session-1')).toBe(2000);
    });

    it('should track multiple sessions independently', () => {
      const output1 = 'a'.repeat(3500); // ~1000 tokens
      const output2 = 'b'.repeat(7000); // ~2000 tokens

      tracker.trackToolOutput('session-a', output1);
      tracker.trackToolOutput('session-b', output2);

      expect(tracker.getSessionTokens('session-a')).toBe(1000);
      expect(tracker.getSessionTokens('session-b')).toBe(2000);
    });

    it('should use ceiling for fractional tokens', () => {
      // 100 chars / 3.5 = 28.57 → 29 tokens
      const output = 'x'.repeat(100);
      tracker.trackToolOutput('session-1', output);
      expect(tracker.getSessionTokens('session-1')).toBe(29);
    });
  });

  describe('shouldCompact', () => {
    it('should not compact below 150k tokens', () => {
      const output = 'x'.repeat(3500 * 100); // ~100k tokens
      tracker.trackToolOutput('session-1', output);
      expect(tracker.shouldCompact('session-1')).toBe(false);
    });

    it('should compact above 150k tokens', () => {
      const output = 'x'.repeat(3500 * 160); // ~160k tokens
      tracker.trackToolOutput('session-1', output);
      expect(tracker.shouldCompact('session-1')).toBe(true);
    });

    it('should respect 5-minute cooldown after compact', async () => {
      const largeOutput = 'x'.repeat(3500 * 160); // ~160k tokens

      tracker.trackToolOutput('session-1', largeOutput);

      // Manually simulate successful compact
      // (skip actual CLI call to avoid test dependency)
      const sessionTokensMap = (tracker as any).sessionTokens;
      const lastCompactMap = (tracker as any).lastCompactTime;
      sessionTokensMap.set('session-1', 20000);
      lastCompactMap.set('session-1', Date.now());

      // Accumulate more tokens immediately
      tracker.trackToolOutput('session-1', largeOutput);
      expect(tracker.getSessionTokens('session-1')).toBeGreaterThan(150000);

      // Should NOT compact yet (< 5min)
      expect(tracker.shouldCompact('session-1')).toBe(false);

      // Simulate 6 minutes passing
      lastCompactMap.set('session-1', Date.now() - 6 * 60 * 1000);

      // Now should compact
      expect(tracker.shouldCompact('session-1')).toBe(true);
    });
  });

  describe('clearSession', () => {
    it('should remove session tracking', () => {
      const output = 'x'.repeat(3500 * 100);
      tracker.trackToolOutput('session-1', output);

      expect(tracker.getSessionTokens('session-1')).toBeGreaterThan(0);

      tracker.clearSession('session-1');

      expect(tracker.getSessionTokens('session-1')).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats for all sessions', () => {
      tracker.trackToolOutput('session-a', 'x'.repeat(3500 * 50)); // ~50k
      tracker.trackToolOutput('session-b', 'x'.repeat(3500 * 100)); // ~100k

      const stats = tracker.getStats();

      expect(stats).toHaveLength(2);
      expect(stats.find((s) => s.sessionId === 'session-a')?.tokens).toBe(50000);
      expect(stats.find((s) => s.sessionId === 'session-b')?.tokens).toBe(100000);
    });
  });

  describe('getSessionTokens', () => {
    it('should return 0 for non-existent session', () => {
      expect(tracker.getSessionTokens('non-existent')).toBe(0);
    });

    it('should return correct token count', () => {
      tracker.trackToolOutput('session-1', 'x'.repeat(3500 * 10)); // ~10k
      expect(tracker.getSessionTokens('session-1')).toBe(10000);
    });
  });
});
