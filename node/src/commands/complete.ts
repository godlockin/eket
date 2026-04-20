/**
 * Task Complete Command
 * Slaver 完成任务时调用：合并 worktree + 清理
 *
 * 用法: node dist/index.js task:complete <ticketId>
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { WorktreeManager } from '../core/worktree-manager.js';
import { createSQLiteClient } from '../core/sqlite-client.js';
import { printError, logSuccess } from '../utils/error-handler.js';
import { findProjectRoot } from '../utils/process-cleanup.js';
import { getIsolationMode } from './claim.js';
import type { SkillFeedback } from '../types/index.js';

// Try to load SkillIndex for activatedSkills detection (graceful degradation)
let _getSkillIndex: (() => import('../skills/index-loader.js').SkillIndex) | null = null;
(async () => {
  try {
    const mod = await import('../skills/index-loader.js');
    _getSkillIndex = mod.getSkillIndex;
  } catch { /* optional */ }
})();

/**
 * 向 inbox/human_feedback/ 写合并冲突通知
 */
export function writeConflictNotice(
  projectRoot: string,
  ticketId: string,
  slaverId: string,
  worktreePath: string,
  errorMessage: string,
): void {
  const dir = path.join(projectRoot, 'inbox', 'human_feedback');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `worktree-conflict-${ticketId}-${Date.now()}.md`;
  const content = `## Worktree 合并冲突 — ${ticketId}
Slaver: ${slaverId}
Worktree: ${worktreePath}
错误: ${errorMessage}
手动解决后执行: git worktree remove .claude/worktrees/${ticketId}
`;
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

/**
 * 更新 ticket 状态（在 jira/tickets/ 下）
 */
function updateTicketStatus(projectRoot: string, ticketId: string, status: string): void {
  const jiraPath = path.join(projectRoot, 'jira', 'tickets');
  const dirs = ['feature', 'bugfix', 'task', 'improvement', ''];

  for (const dir of dirs) {
    const ticketFile = dir
      ? path.join(jiraPath, dir, `${ticketId}.md`)
      : path.join(jiraPath, `${ticketId}.md`);
    if (fs.existsSync(ticketFile)) {
      let content = fs.readFileSync(ticketFile, 'utf-8');
      content = content.replace(/\*\*状态\*\*:\s*\S+/i, `**状态**: ${status}`);
      fs.writeFileSync(ticketFile, content, 'utf-8');
      return;
    }
  }
}

/**
 * 获取当前 slaverId
 */
function getSlaverId(projectRoot: string): string {
  if (process.env.EKET_SLAVER_ID) return process.env.EKET_SLAVER_ID;
  const slaveridPath = path.join(projectRoot, '.eket', 'slaver-id');
  try {
    if (fs.existsSync(slaveridPath)) {
      const id = fs.readFileSync(slaveridPath, 'utf-8').trim();
      if (id) return id;
    }
  } catch {
    // ignore
  }
  return `slaver_${process.pid}`;
}

/**
 * 上报 SkillFeedback（TASK-104b）
 */
async function reportSkillFeedback(
  projectRoot: string,
  ticketId: string,
  slaverId: string,
): Promise<void> {
  try {
    // Determine activatedSkills from SkillIndex (by domain matching)
    let activatedSkills: string[] = [];
    let recommendedLevel: 1 | 2 | 3 = 1;
    if (_getSkillIndex) {
      try {
        const idx = _getSkillIndex();
        // Extract domain from ticketId (e.g. "TASK-104b" -> "task", or use tag matching)
        const domain = ticketId.replace(/-\d+.*$/, '').toLowerCase();
        const domainSkills = idx.nodes.filter(
          (n) => n.domain?.toLowerCase().includes(domain) || domain.includes(n.domain?.toLowerCase() ?? '')
        );
        activatedSkills = domainSkills.length > 0
          ? domainSkills.map((n) => n.id)
          : idx.nodes.slice(0, 3).map((n) => n.id); // fallback: first 3
        recommendedLevel = (idx.modelRouteTable[domain] ?? idx.modelRouteTable['default'] ?? 1) as 1 | 2 | 3;
      } catch { /* SkillIndex not initialized — skip */ }
    }

    // Load instance state for levelChanges
    let actualLevel: 1 | 2 | 3 = 1;
    let levelChanges: import('../types/index.js').LevelChange[] = [];
    try {
      const { createInstanceRegistry } = await import('../core/instance-registry.js');
      const registry = createInstanceRegistry();
      const result = await registry.getInstance(slaverId);
      const instance = result && 'data' in result ? result.data : null;
      if (instance) {
        actualLevel = instance.currentLevel;
        levelChanges = instance.levelChanges;
      }
    } catch { /* registry unavailable */ }

    const feedback: SkillFeedback = {
      ticketId,
      slaverId,
      recommendedLevel,
      actualLevel,
      activatedSkills,
      activatedExperts: [],
      levelChanges,
      completedAt: new Date().toISOString(),
    };

    const dbPath = path.join(projectRoot, '.eket', 'eket.db');
    const client = createSQLiteClient(dbPath);
    await client.connect();
    await client.saveSkillFeedback(ticketId, feedback);
    await client.close();
    console.log(`[skill-feedback] Saved feedback for ${ticketId}`);
  } catch (e: unknown) {
    // Non-fatal: log and continue
    console.warn(`[skill-feedback] Failed to save feedback: ${(e as Error).message ?? e}`);
  }
}

/**
 * 注册 task:complete 命令
 */
export function registerComplete(program: Command): void {
  program
    .command('task:complete <ticketId>')
    .description('Mark task as complete, merge worktree and clean up')
    .action(async (ticketId: string) => {
      console.log(`\n=== Complete Task: ${ticketId} ===\n`);

      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        printError({
          code: 'PROJECT_NOT_FOUND',
          message: 'EKET project not found',
          solutions: ['Run `eket-cli project:init` to initialize the project'],
        });
        process.exit(1);
      }

      const slaverId = getSlaverId(projectRoot);
      const isolationMode = getIsolationMode();

      if (isolationMode !== 'worktree') {
        // isolation=none: just update ticket status
        updateTicketStatus(projectRoot, ticketId, 'done');
        await reportSkillFeedback(projectRoot, ticketId, slaverId);
        logSuccess('Task completed', [`Task: ${ticketId}`, 'Isolation: none']);
        return;
      }

      // isolation=worktree: merge + cleanup
      const wm = new WorktreeManager({ projectRoot });

      let worktreePath = '';
      try {
        const worktrees = await wm.listWorktrees();
        const info = worktrees.find((w) => w.ticketId === ticketId);
        worktreePath = info?.path ?? `.claude/worktrees/${ticketId}`;
      } catch {
        worktreePath = `.claude/worktrees/${ticketId}`;
      }

      console.log(`[worktree] Merging worktree for ${ticketId}...`);

      try {
        await wm.mergeWorktree(ticketId);
        console.log(`[worktree] Merge successful`);
      } catch (e: unknown) {
        const err = e as { message?: string };
        const errMsg = err.message ?? 'unknown merge error';
        console.error(`[worktree] Merge failed: ${errMsg}`);

        // Update ticket status to BLOCKED
        updateTicketStatus(projectRoot, ticketId, 'blocked');

        // Write inbox notification
        writeConflictNotice(projectRoot, ticketId, slaverId, worktreePath, errMsg);

        printError({
          code: 'WORKTREE_MERGE_FAILED',
          message: `Worktree merge failed for ${ticketId}: ${errMsg}`,
          solutions: [
            `Resolve conflicts manually in: ${worktreePath}`,
            `Then run: git worktree remove .claude/worktrees/${ticketId}`,
            'Check inbox/human_feedback/ for details',
          ],
        });
        return;
      }

      // Merge succeeded: remove worktree
      try {
        await wm.removeWorktree(ticketId);
        console.log(`[worktree] Removed: ${worktreePath}`);
      } catch (e: unknown) {
        const err = e as { message?: string };
        console.warn(`[worktree] Remove failed (non-fatal): ${err.message ?? 'unknown'}`);
      }

      // Update ticket status
      updateTicketStatus(projectRoot, ticketId, 'done');

      // Report skill feedback (TASK-104b)
      await reportSkillFeedback(projectRoot, ticketId, slaverId);

      logSuccess('Task completed', [
        `Task: ${ticketId}`,
        `Worktree merged and removed: ${worktreePath}`,
      ]);
    });
}
