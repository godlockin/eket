/**
 * Unit tests for ContextTracker
 * TASK-602: Original tests
 * TASK-604: Enhanced tests for new features
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContextTracker } from '../../src/core/context-tracker.js';

describe('ContextTracker', () => {
  let tracker: ContextTracker;

  beforeEach(() => {
    tracker = new ContextTracker();
  });

  // ============================================================================
  // TASK-604: trackInput Tests
  // ============================================================================

  describe('trackInput', () => {
    it('should track input with improved estimation', () => {
      // English: 16 chars / 4 = 4 tokens
      tracker.trackInput('session-1', 'test input here!');
      expect(tracker.getSessionTokens('session-1')).toBe(4);
    });

    it('should track Chinese input correctly', () => {
      // Chinese: 8 chars / 2 = 4 tokens
      tracker.trackInput('session-1', '测试中文输入内容');
      expect(tracker.getSessionTokens('session-1')).toBe(4);
    });

    it('should track mixed Chinese/English input', () => {
      // '测试 test' = 2 Chinese + 5 English = 1 + 2 = 3 tokens
      tracker.trackInput('session-1', '测试 test');
      expect(tracker.getSessionTokens('session-1')).toBe(3);
    });

    it('should handle extraArgs parameter', () => {
      // 'cmd' (3 chars) + 'arg1' (4 chars) = 7 chars / 4 = 2 tokens
      tracker.trackInput('session-1', 'cmd', 'arg1');
      expect(tracker.getSessionTokens('session-1')).toBe(2);
    });

    it('should handle undefined extraArgs gracefully', () => {
      tracker.trackInput('session-1', 'test', undefined);
      expect(tracker.getSessionTokens('session-1')).toBe(1);
    });

    it('should handle empty text', () => {
      tracker.trackInput('session-1', '');
      expect(tracker.getSessionTokens('session-1')).toBe(0);
    });
  });

  // ============================================================================
  // TASK-604: trackToolOutput Tests (Enhanced)
  // ============================================================================

  describe('trackToolOutput', () => {
    it('should use improved token estimation for English', () => {
      // 100 English chars / 4 = 25 tokens
      const output = 'x'.repeat(100);
      tracker.trackToolOutput('session-1', output);
      expect(tracker.getSessionTokens('session-1')).toBe(25);
    });

    it('should use improved estimation for Chinese', () => {
      // 10 Chinese chars / 2 = 5 tokens
      const output = '中'.repeat(10);
      tracker.trackToolOutput('session-1', output);
      expect(tracker.getSessionTokens('session-1')).toBe(5);
    });

    it('should accumulate tokens correctly with mixed input/output', () => {
      tracker.trackInput('session-1', 'test'); // 1 token
      tracker.trackToolOutput('session-1', '测试输出'); // 2 tokens
      expect(tracker.getSessionTokens('session-1')).toBe(3);
    });

    it('should track multiple sessions independently', () => {
      const output1 = 'a'.repeat(100); // 25 tokens
      const output2 = 'b'.repeat(200); // 50 tokens

      tracker.trackToolOutput('session-a', output1);
      tracker.trackToolOutput('session-b', output2);

      expect(tracker.getSessionTokens('session-a')).toBe(25);
      expect(tracker.getSessionTokens('session-b')).toBe(50);
    });
  });

  // ============================================================================
  // TASK-604: shouldCompact Tests (120k threshold)
  // ============================================================================

  describe('shouldCompact', () => {
    it('should not compact below 120k tokens', () => {
      // 100k English chars / 4 = 25k tokens
      const output = 'x'.repeat(100000);
      tracker.trackToolOutput('session-1', output);
      expect(tracker.shouldCompact('session-1')).toBe(false);
    });

    it('should compact above 120k tokens', () => {
      // 500k English chars / 4 = 125k tokens
      const output = 'x'.repeat(500000);
      tracker.trackToolOutput('session-1', output);
      expect(tracker.shouldCompact('session-1')).toBe(true);
    });

    it('should respect 5-minute cooldown after compact', async () => {
      const largeOutput = 'x'.repeat(500000); // 125k tokens

      tracker.trackToolOutput('session-1', largeOutput);

      // Manually simulate successful compact
      const sessionTokensMap = (tracker as any).sessionTokens;
      const lastCompactMap = (tracker as any).lastCompactTime;
      sessionTokensMap.set('session-1', 20000);
      lastCompactMap.set('session-1', Date.now());

      // Accumulate more tokens immediately
      tracker.trackToolOutput('session-1', largeOutput);
      expect(tracker.getSessionTokens('session-1')).toBeGreaterThan(120000);

      // Should NOT compact yet (< 5min)
      expect(tracker.shouldCompact('session-1')).toBe(false);

      // Simulate 6 minutes passing
      lastCompactMap.set('session-1', Date.now() - 6 * 60 * 1000);

      // Now should compact
      expect(tracker.shouldCompact('session-1')).toBe(true);
    });
  });

  // ============================================================================
  // TASK-604: getStatus Tests
  // ============================================================================

  describe('getStatus', () => {
    it('should return formatted status report', () => {
      tracker.trackToolOutput('session-1', 'x'.repeat(400000)); // 100k tokens
      const status = tracker.getStatus('session-1');

      expect(status).toContain('Context Tracker Status');
      expect(status).toContain('Session: session-1');
      expect(status).toContain('100,000 / 200,000');
      expect(status).toContain('50.0%');
      expect(status).toContain('Threshold: 120,000 tokens');
    });

    it('should show healthy status below 80k', () => {
      tracker.trackToolOutput('session-1', 'x'.repeat(200000)); // 50k tokens
      const status = tracker.getStatus('session-1');
      expect(status).toContain('✅ Usage healthy');
    });

    it('should show monitor status between 80k-100k', () => {
      tracker.trackToolOutput('session-1', 'x'.repeat(360000)); // 90k tokens
      const status = tracker.getStatus('session-1');
      expect(status).toContain('📊 Usage normal, monitor closely');
    });

    it('should show approaching limit between 100k-120k', () => {
      tracker.trackToolOutput('session-1', 'x'.repeat(440000)); // 110k tokens
      const status = tracker.getStatus('session-1');
      expect(status).toContain('⚡ Approaching limit, compact soon');
    });

    it('should show compact now above 120k', () => {
      tracker.trackToolOutput('session-1', 'x'.repeat(500000)); // 125k tokens
      const status = tracker.getStatus('session-1');
      expect(status).toContain('⚠️  COMPACT NOW');
    });

    it('should show last compact time', () => {
      const sessionTokensMap = (tracker as any).sessionTokens;
      const lastCompactMap = (tracker as any).lastCompactTime;
      sessionTokensMap.set('session-1', 50000);
      lastCompactMap.set('session-1', Date.now() - 3 * 60 * 1000); // 3 min ago

      const status = tracker.getStatus('session-1');
      expect(status).toContain('Last compact: 3 min ago');
    });

    it('should show Never for never compacted sessions', () => {
      tracker.trackToolOutput('session-1', 'test');
      const status = tracker.getStatus('session-1');
      expect(status).toContain('Last compact: Never');
    });
  });

  // ============================================================================
  // Original TASK-602 Tests (Retained)
  // ============================================================================

  describe('clearSession', () => {
    it('should remove session tracking', () => {
      const output = 'x'.repeat(100000);
      tracker.trackToolOutput('session-1', output);

      expect(tracker.getSessionTokens('session-1')).toBeGreaterThan(0);

      tracker.clearSession('session-1');

      expect(tracker.getSessionTokens('session-1')).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats for all sessions', () => {
      tracker.trackToolOutput('session-a', 'x'.repeat(200000)); // 50k tokens
      tracker.trackToolOutput('session-b', 'x'.repeat(400000)); // 100k tokens

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
      tracker.trackToolOutput('session-1', 'x'.repeat(40000)); // 10k tokens
      expect(tracker.getSessionTokens('session-1')).toBe(10000);
    });
  });
});
