/**
 * Context Tracker
 * TASK-602: Track tool output tokens and trigger /compact when approaching limit
 */

import { execFileNoThrow } from '../utils/execFileNoThrow.js';

/**
 * Tracks estimated context tokens per session and triggers /compact when needed
 */
export class ContextTracker {
  private sessionTokens: Map<string, number> = new Map();
  private lastCompactTime: Map<string, number> = new Map();

  /**
   * Track tool output and estimate tokens
   * Formula: output.length / 3.5 (conservative GPT-4 estimate)
   */
  trackToolOutput(sessionId: string, output: string): void {
    const estimated = Math.ceil(output.length / 3.5);
    const current = this.sessionTokens.get(sessionId) || 0;
    const newTotal = current + estimated;

    this.sessionTokens.set(sessionId, newTotal);

    console.log(`[Context Tracker] Session ${sessionId}: ${newTotal} tokens (+${estimated})`);

    // Warning at 100k (conservative)
    if (newTotal > 100000) {
      console.warn(`⚠️  Session ${sessionId} approaching limit: ${newTotal}/200000 tokens`);
    }
  }

  /**
   * Check if session needs compaction
   * Triggers when:
   * - Token count > 150k
   * - Time since last compact > 5 minutes
   */
  shouldCompact(sessionId: string): boolean {
    const tokens = this.sessionTokens.get(sessionId) || 0;
    const lastCompact = this.lastCompactTime.get(sessionId) || 0;
    const timeSinceCompact = Date.now() - lastCompact;

    // Threshold: 150k tokens, 5min cooldown
    return tokens > 150000 && timeSinceCompact > 5 * 60 * 1000;
  }

  /**
   * Execute /compact command via Claude CLI
   * Resets token counter to 20k (conservative post-compact estimate)
   */
  async triggerCompact(sessionId: string): Promise<boolean> {
    const currentTokens = this.sessionTokens.get(sessionId) || 0;
    console.log(`🗜️  Compacting session ${sessionId} (${currentTokens} tokens)...`);

    try {
      const result = await execFileNoThrow('claude', ['--command', '/compact']);

      if (result.status === 0) {
        // Reset to 20k (conservative estimate of post-compact context)
        this.sessionTokens.set(sessionId, 20000);
        this.lastCompactTime.set(sessionId, Date.now());
        console.log('✅ Compact successful, tokens reset to ~20k');
        return true;
      } else {
        console.error('❌ Compact failed:', result.stderr);
        return false;
      }
    } catch (error) {
      console.error('❌ Compact error:', error);
      return false;
    }
  }

  /**
   * Get current estimated token count for session
   */
  getSessionTokens(sessionId: string): number {
    return this.sessionTokens.get(sessionId) || 0;
  }

  /**
   * Clear session tracking (call on session end)
   */
  clearSession(sessionId: string): void {
    this.sessionTokens.delete(sessionId);
    this.lastCompactTime.delete(sessionId);
    console.log(`🧹 Cleared tracking for session ${sessionId}`);
  }

  /**
   * Get stats for all sessions (debugging)
   */
  getStats(): { sessionId: string; tokens: number; lastCompact: number }[] {
    return Array.from(this.sessionTokens.entries()).map(([sessionId, tokens]) => ({
      sessionId,
      tokens,
      lastCompact: this.lastCompactTime.get(sessionId) || 0,
    }));
  }
}

/**
 * Global singleton instance
 */
export const contextTracker = new ContextTracker();
