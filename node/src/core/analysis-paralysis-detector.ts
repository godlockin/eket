/**
 * Analysis Paralysis Detector
 *
 * Detects when an agent reads 5+ consecutive files without any write operation.
 * Throttle: after warning, re-warn only after 3 more reads.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export interface ParalysisWarning {
  consecutiveReads: number;
  recentFiles: string[];
  message: string;
}

const READ_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']);
const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'Bash']);

const THRESHOLD = 5;
const THROTTLE_READS = 3;

export class ParalysisDetector {
  private consecutiveReads = 0;
  private recentFiles: string[] = [];
  private lastWarnAt = -1; // consecutiveReads value when last warned

  record(toolName: string, filePath?: string): ParalysisWarning | null {
    if (WRITE_TOOLS.has(toolName)) {
      this.reset();
      return null;
    }

    if (!READ_TOOLS.has(toolName)) {
      return null;
    }

    this.consecutiveReads++;
    if (filePath) {
      this.recentFiles.push(filePath);
      if (this.recentFiles.length > 5) {
        this.recentFiles.shift();
      }
    }

    if (this.consecutiveReads < THRESHOLD) {
      return null;
    }

    // Check throttle: only warn if we haven't warned, or 3+ reads since last warn
    const readsSinceLastWarn =
      this.lastWarnAt < 0 ? this.consecutiveReads : this.consecutiveReads - this.lastWarnAt;

    if (this.lastWarnAt >= 0 && readsSinceLastWarn < THROTTLE_READS) {
      return null;
    }

    this.lastWarnAt = this.consecutiveReads;

    const warning: ParalysisWarning = {
      consecutiveReads: this.consecutiveReads,
      recentFiles: [...this.recentFiles],
      message: `⚠️ Analysis paralysis detected: ${this.consecutiveReads} consecutive reads without write. Recent files: ${this.recentFiles.join(', ') || 'none'}. Write code or report BLOCKED.`,
    };

    this.writeWarningFile(warning);
    return warning;
  }

  reset(): void {
    this.consecutiveReads = 0;
    this.recentFiles = [];
    this.lastWarnAt = -1;
  }

  private writeWarningFile(warning: ParalysisWarning): void {
    try {
      const dir = join(process.cwd(), '..', '.eket', 'inbox');
      mkdirSync(dir, { recursive: true });
      const content = `# Analysis Paralysis Warning\n\n${warning.message}\n\n**Consecutive reads**: ${warning.consecutiveReads}\n\n**Recent files**:\n${warning.recentFiles.map((f) => `- ${f}`).join('\n') || '- (none)'}\n\n_Generated at ${new Date().toISOString()}_\n`;
      writeFileSync(join(dir, 'paralysis-warning.md'), content, 'utf-8');
    } catch {
      // non-fatal
    }
  }
}

export const globalParalysisDetector = new ParalysisDetector();
