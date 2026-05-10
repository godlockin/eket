/**
 * Context Tracker
 * TASK-602: Track tool output tokens and trigger /compact when approaching limit
 * TASK-604: Enhanced tracking with input/output, improved estimation, context:status
 */

import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import type { MessageMetadata } from './recovery-logger.js';

/**
 * Improved token estimation for mixed Chinese/English text
 * Chinese: ~2 chars/token, English: ~4 chars/token
 */
function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  let chineseChars = 0;
  let otherChars = 0;

  for (const char of text) {
    const code = char.charCodeAt(0);
    // CJK Unified Ideographs: 0x4E00-0x9FFF
    if (code >= 0x4e00 && code <= 0x9fff) {
      chineseChars++;
    } else {
      otherChars++;
    }
  }

  // Chinese: ~2 chars/token, English: ~4 chars/token
  const chineseTokens = Math.ceil(chineseChars / 2);
  const englishTokens = Math.ceil(otherChars / 4);

  return chineseTokens + englishTokens;
}

/**
 * Tracks estimated context tokens per session and triggers /compact when needed
 */
export class ContextTracker {
  private sessionTokens: Map<string, number> = new Map();
  private lastCompactTime: Map<string, number> = new Map();
  private sessionMessages: Map<string, MessageMetadata[]> = new Map(); // TASK-603

  /**
   * Track tool input (user prompt + args)
   */
  trackInput(sessionId: string, prompt: string, extraArgs?: string): void {
    const combinedText = extraArgs ? `${prompt} ${extraArgs}` : prompt;
    const estimated = estimateTokens(combinedText);
    const current = this.sessionTokens.get(sessionId) || 0;
    const newTotal = current + estimated;

    this.sessionTokens.set(sessionId, newTotal);
    console.log(`[Context Tracker] Session ${sessionId}: ${newTotal} tokens (+${estimated} input)`);

    // TASK-603: Record message metadata
    this.recordMessage(sessionId, { role: 'user', tokenEstimate: estimated, timestamp: new Date().toISOString() });

    this.checkWarning(sessionId, newTotal);
  }

  /**
   * Track tool output and estimate tokens
   * IMPROVED: Uses language-aware estimation (Chinese vs English)
   */
  trackToolOutput(sessionId: string, output: string): void {
    const estimated = estimateTokens(output);
    const current = this.sessionTokens.get(sessionId) || 0;
    const newTotal = current + estimated;

    this.sessionTokens.set(sessionId, newTotal);
    console.log(`[Context Tracker] Session ${sessionId}: ${newTotal} tokens (+${estimated} output)`);

    // TASK-603: Record message metadata (count tool calls if present)
    const toolCalls = (output.match(/<invoke/g) || []).length;
    this.recordMessage(sessionId, {
      role: 'assistant',
      tokenEstimate: estimated,
      toolCalls: toolCalls > 0 ? toolCalls : undefined,
      timestamp: new Date().toISOString(),
    });

    this.checkWarning(sessionId, newTotal);
  }

  /**
   * TASK-603: Record message metadata for snapshot
   */
  private recordMessage(sessionId: string, metadata: MessageMetadata): void {
    const messages = this.sessionMessages.get(sessionId) || [];
    messages.push(metadata);
    // Keep last 30 messages (will be trimmed to 20 in snapshot)
    if (messages.length > 30) {
      messages.shift();
    }
    this.sessionMessages.set(sessionId, messages);
  }

  /**
   * TASK-603: Get session messages for snapshot
   */
  getSessionMessages(sessionId: string): MessageMetadata[] {
    return this.sessionMessages.get(sessionId) || [];
  }

  /**
   * Unified warning check (DRY)
   */
  private checkWarning(sessionId: string, tokens: number): void {
    // Warning at 100k (conservative)
    if (tokens > 100000) {
      console.warn(`⚠️  Session ${sessionId} approaching limit: ${tokens}/200000 tokens`);
    }
  }

  /**
   * Check if session needs compaction
   * IMPROVED: Lower threshold (120k) for earlier compaction
   * Triggers when:
   * - Token count > 120k (CHANGED from 150k)
   * - Time since last compact > 5 minutes
   */
  shouldCompact(sessionId: string): boolean {
    const tokens = this.sessionTokens.get(sessionId) || 0;
    const lastCompact = this.lastCompactTime.get(sessionId) || 0;
    const timeSinceCompact = Date.now() - lastCompact;

    // Threshold: 120k tokens, 5min cooldown
    return tokens > 120000 && timeSinceCompact > 5 * 60 * 1000;
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

  /**
   * Get formatted status report for a session (for context:status command)
   */
  getStatus(sessionId: string): string {
    const tokens = this.sessionTokens.get(sessionId) || 0;
    const lastCompact = this.lastCompactTime.get(sessionId) || 0;
    const timeSinceCompact = lastCompact ? Date.now() - lastCompact : 0;

    const percentage = ((tokens / 200000) * 100).toFixed(1);
    const shouldCompactNow = this.shouldCompact(sessionId);

    let status = `\n=== Context Tracker Status ===\n\n`;
    status += `Session: ${sessionId}\n`;
    status += `Tokens: ${tokens.toLocaleString()} / 200,000 (${percentage}%)\n`;
    status += `Threshold: 120,000 tokens\n`;

    if (lastCompact) {
      const compactAgo = Math.round(timeSinceCompact / 1000 / 60);
      status += `Last compact: ${compactAgo} min ago\n`;
    } else {
      status += `Last compact: Never\n`;
    }

    status += `\nRecommendation: `;
    if (shouldCompactNow) {
      status += `⚠️  COMPACT NOW (threshold exceeded)\n`;
    } else if (tokens > 100000) {
      status += `⚡ Approaching limit, compact soon\n`;
    } else if (tokens > 80000) {
      status += `📊 Usage normal, monitor closely\n`;
    } else {
      status += `✅ Usage healthy\n`;
    }

    return status;
  }
}

/**
 * Global singleton instance
 */
export const contextTracker = new ContextTracker();
