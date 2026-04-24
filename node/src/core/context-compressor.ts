/**
 * ContextCompressor - Three-layer context compression
 *
 * Layer 2: Session summary → .eket/sessions/<ticketId>/summary.md
 * Layer 3: Archive key decisions → confluence/memory/sessions/<ticketId>.md
 */

import * as fs from 'fs';
import * as path from 'path';

import { findProjectRoot } from '../utils/process-cleanup.js';

const SUMMARY_TEMPLATE = (ticketId: string, completed: string[], decisions: string[], deferred: string[]) =>
  `# Session Summary: ${ticketId}

## 已完成步骤
${completed.length > 0 ? completed.map((l) => `- ${l}`).join('\n') : '- (无)'}

## 关键决策
${decisions.length > 0 ? decisions.map((l) => `- ${l}`).join('\n') : '- (无)'}

## 遗留问题
${deferred.length > 0 ? deferred.map((l) => `- ${l}`).join('\n') : '- (无)'}
`;

/**
 * Extract sections from session log using simple heuristics
 */
function extractSections(sessionLog: string): {
  completed: string[];
  decisions: string[];
  deferred: string[];
} {
  const lines = sessionLog.split('\n').map((l) => l.trim()).filter(Boolean);

  const completed: string[] = [];
  const decisions: string[] = [];
  const deferred: string[] = [];

  for (const line of lines) {
    if (line.startsWith('✅') || /完成/.test(line)) {
      completed.push(line.replace(/^✅\s*/, ''));
    } else if (/因为|选择|决定/.test(line)) {
      decisions.push(line);
    } else {
      deferred.push(line);
    }
  }

  return { completed, decisions, deferred };
}

export class ContextCompressor {
  private projectRoot: string | null = null;
  private projectRootOverride: string | null = null;

  constructor(projectRoot?: string) {
    this.projectRootOverride = projectRoot ?? null;
  }

  private async getRoot(): Promise<string> {
    if (this.projectRootOverride) {return this.projectRootOverride;}
    if (this.projectRoot) {return this.projectRoot;}
    const root = await findProjectRoot();
    if (!root) {throw new Error('EKET project root not found');}
    this.projectRoot = root;
    return root;
  }

  /**
   * Layer 2: Compress session log to summary file
   */
  async compressToSummary(ticketId: string, sessionLog: string): Promise<string> {
    const root = await this.getRoot();
    const { completed, decisions, deferred } = extractSections(sessionLog);
    const content = SUMMARY_TEMPLATE(ticketId, completed, decisions, deferred);

    const dir = path.join(root, '.eket', 'sessions', ticketId);
    fs.mkdirSync(dir, { recursive: true });
    const summaryPath = path.join(dir, 'summary.md');
    fs.writeFileSync(summaryPath, content, 'utf-8');

    return summaryPath;
  }

  /**
   * Layer 2: Load session summary if exists
   */
  async loadSummary(ticketId: string): Promise<string | null> {
    try {
      const root = await this.getRoot();
      const summaryPath = path.join(root, '.eket', 'sessions', ticketId, 'summary.md');
      if (!fs.existsSync(summaryPath)) {return null;}
      return fs.readFileSync(summaryPath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Layer 3: Archive key decisions to confluence/memory/sessions/<ticketId>.md
   */
  async archiveToMemory(ticketId: string): Promise<void> {
    const root = await this.getRoot();
    const summaryPath = path.join(root, '.eket', 'sessions', ticketId, 'summary.md');

    if (!fs.existsSync(summaryPath)) {
      console.log(`[context-compressor] No summary found for ${ticketId}, skipping archive`);
      return;
    }

    const summary = fs.readFileSync(summaryPath, 'utf-8');

    // Extract only key decisions section
    const decisionsMatch = summary.match(/## 关键决策\n([\s\S]*?)(?:\n## |\n$|$)/);
    const decisions = decisionsMatch ? decisionsMatch[1].trim() : '- (无)';

    const archiveContent = `# Session Archive: ${ticketId}

> 归档时间: ${new Date().toISOString()}

## 关键决策

${decisions}
`;

    const archiveDir = path.join(root, 'confluence', 'memory', 'sessions');
    fs.mkdirSync(archiveDir, { recursive: true });
    fs.writeFileSync(path.join(archiveDir, `${ticketId}.md`), archiveContent, 'utf-8');
    console.log(`[context-compressor] Archived key decisions for ${ticketId}`);
  }
}

export const contextCompressor = new ContextCompressor();
