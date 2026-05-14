/**
 * Context size estimation with intelligent fallback
 *
 * Strategy:
 * - Rough: 0.3 bytes/token heuristic (fast, ±30% error)
 * - Precise: tiktoken tokenization (slow, ±10% error)
 * - Smart: rough < 40K → skip tiktoken
 * - Alert: triggers Master notification at 150K+ threshold
 */

import { encoding_for_model } from '@dqbd/tiktoken';
import glob from 'glob';
import { readFileSync, statSync } from 'fs';
import { promisify } from 'util';
import { ContextAlert, AlertContext } from './context-alert.js';

const globAsync = promisify(glob);

export interface EstimateResult {
  tokens: number;
  method: 'rough' | 'precise';
  duration?: number;
  alerted?: boolean;
}

export class ContextEstimator {
  private alert: ContextAlert;

  constructor(private taskId?: string) {
    this.alert = new ContextAlert();
  }
  /**
   * Rough estimation via byte count heuristic
   * Fast O(n) file stat, no content reading
   * Error: ±30% typical
   */
  async roughEstimate(): Promise<number> {
    // Use same patterns as precise estimate for consistency
    const patterns = [
      'jira/tickets/**/*.md',
      'confluence/memory/**/*.md',
      '.eket/ACTIVE_CONTEXT',
      'CLAUDE.md',
      '.claude/CLAUDE.md'
    ];

    let totalSize = 0;

    for (const pattern of patterns) {
      try {
        const files = await globAsync(pattern, { nodir: true });
        // Cap at 20 files per pattern (same as precise)
        const limited = files.slice(0, 20);

        for (const file of limited) {
          try {
            totalSize += statSync(file).size;
          } catch {
            // Ignore permission/missing file errors
          }
        }
      } catch {
        // Skip invalid patterns
      }
    }

    // Heuristic: 1 token ≈ 3.3 bytes for English + code
    return Math.floor(totalSize * 0.3);
  }

  /**
   * Precise estimation via tiktoken encoding
   * Reads top-priority files only (cap at 20 per pattern to avoid OOM)
   * Error: ±10% typical
   */
  async preciseEstimate(): Promise<number> {
    const patterns = [
      'jira/tickets/**/*.md',
      'confluence/memory/**/*.md',
      '.eket/ACTIVE_CONTEXT',
      'CLAUDE.md',
      '.claude/CLAUDE.md'
    ];

    const enc = encoding_for_model('gpt-4');
    let total = 0;

    for (const pattern of patterns) {
      try {
        const files = await globAsync(pattern, { nodir: true });
        // Limit to 20 files per pattern to avoid OOM/excessive estimation time
        const limited = files.slice(0, 20);

        for (const file of limited) {
          try {
            const content = readFileSync(file, 'utf-8');
            total += enc.encode(content).length;
          } catch {
            // Skip unreadable files
          }
        }
      } catch {
        // Skip invalid patterns
      }
    }

    enc.free(); // Critical: prevent memory leak
    return total;
  }

  /**
   * Intelligent estimation with automatic method selection
   *
   * Logic:
   * 1. Quick rough estimate
   * 2. If < 40K → return rough (fast path)
   * 3. Else → precise tokenization (accuracy path)
   * 4. Check for 150K+ threshold → alert Master if needed
   */
  async estimate(): Promise<EstimateResult> {
    const start = performance.now();

    const rough = await this.roughEstimate();

    // Fast path: low token count doesn't need precision
    if (rough < 40000) {
      return {
        tokens: rough,
        method: 'rough',
        duration: performance.now() - start
      };
    }

    // Slow path: high token count needs accurate measurement
    const precise = await this.preciseEstimate();
    const duration = performance.now() - start;

    // Alert Master if approaching token limit
    let alerted = false;
    if (this.taskId) {
      const alertContext: AlertContext = {
        taskId: this.taskId,
        tokens: precise,
        timestamp: new Date().toISOString()
      };
      alerted = await this.alert.alertMaster(alertContext);
    }

    return {
      tokens: precise,
      method: 'precise',
      duration,
      alerted
    };
  }
}
