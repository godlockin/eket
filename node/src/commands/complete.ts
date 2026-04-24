/**
 * Task Complete Command
 * Slaver 完成任务时调用：合并 worktree + 清理
 *
 * 用法: node dist/index.js task:complete <ticketId>
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { CompletionValidator } from '../core/completion-validator.js';
import { contextCompressor } from '../core/context-compressor.js';
import { createSQLiteClient } from '../core/sqlite-client.js';
import { sseBus } from '../core/sse-bus.js';
import { WorktreeManager } from '../core/worktree-manager.js';
import type { SkillFeedback, SlaveResult } from '../types/index.js';
import { printError, logSuccess } from '../utils/error-handler.js';
import { execFileNoThrow } from '../utils/execFileNoThrow.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

import { getIsolationMode } from './claim.js';

// Try to load SkillIndex for activatedSkills detection (graceful degradation)
let _getSkillIndex: (() => import('../skills/index-loader.js').SkillIndex) | null = null;
(async () => {
  try {
    const mod = await import('../skills/index-loader.js');
    _getSkillIndex = mod.getSkillIndex;
  } catch { /* optional */ }
})();

/**
 * 推断 Scope-risk：从 git diff --stat 获取变更文件数
 */
export function inferScopeRisk(fileCount: number): 'low' | 'medium' | 'high' {
  if (fileCount <= 5) {return 'low';}
  if (fileCount <= 15) {return 'medium';}
  return 'high';
}

/**
 * 从 git diff HEAD~1 --stat 获取变更文件数
 */
export async function getChangedFileCount(): Promise<number> {
  const result = await execFileNoThrow('git', ['diff', 'HEAD~1', '--stat']);
  const output = result.stdout.trim();
  if (!output) {return 0;}
  const lastLine = output.split('\n').pop() ?? '';
  const match = lastLine.match(/(\d+)\s+file/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * 构建 Commit Trailer 字符串
 */
export async function buildCommitTrailer(ticketId: string, slaverId: string): Promise<string> {
  // Confidence: from levelChanges count
  let levelChangesCount = 0;
  let rejectedApproaches = 'none';

  try {
    const { createInstanceRegistry } = await import('../core/instance-registry.js');
    const registry = createInstanceRegistry();
    const result = await registry.getInstance(slaverId);
    const instance = result && 'data' in result ? result.data : null;
    if (instance) {
      const changes = instance.levelChanges ?? [];
      levelChangesCount = changes.length;
      // Extract rejected approaches from levelChanges reasons
      const reasons = changes
        .map((c: { reason?: string }) => c.reason)
        .filter((r: string | undefined): r is string => Boolean(r))
        .map((r: string) => r.split(/[\s,]+/)[0])
        .filter((r: string) => r.length > 2);
      if (reasons.length > 0) {
        rejectedApproaches = [...new Set(reasons)].join(', ');
      }
    }
  } catch {
    // registry unavailable — use defaults
  }

  const confidence: 'high' | 'medium' | 'low' =
    levelChangesCount === 0 ? 'high' : levelChangesCount === 1 ? 'medium' : 'low';

  // Directive: ticketId as directive (truncated to 80 chars)
  const directive = ticketId.slice(0, 80);

  // Scope-risk: from git diff stat
  const fileCount = await getChangedFileCount();
  const scopeRisk = inferScopeRisk(fileCount);

  return [
    `Confidence: ${confidence}`,
    `Rejected-approaches: ${rejectedApproaches}`,
    `Directive: ${directive}`,
    `Scope-risk: ${scopeRisk}`,
  ].join('\n');
}

/**
 * 追加 Commit Trailer 到最新 commit（幂等）
 */
export async function appendCommitTrailer(ticketId: string, slaverId: string): Promise<void> {
  try {
    // Check if already has trailer
    const logResult = await execFileNoThrow('git', ['log', '-1', '--format=%B']);
    const currentMsg = logResult.stdout.trim();

    if (currentMsg.includes('Confidence:')) {
      console.log('[commit-trailer] Trailer already present, skipping (idempotent)');
      return;
    }

    const trailer = await buildCommitTrailer(ticketId, slaverId);
    const newMsg = `${currentMsg}\n\n${trailer}`;

    const amendResult = await execFileNoThrow('git', ['commit', '--amend', '-m', newMsg]);
    if (amendResult.status !== 0) {
      console.warn(`[commit-trailer] git commit --amend failed: ${amendResult.stderr}`);
      return;
    }
    console.log('[commit-trailer] Appended trailer to latest commit');
  } catch (e: unknown) {
    console.warn(`[commit-trailer] Failed to append trailer (non-fatal): ${(e as Error).message ?? e}`);
  }
}

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
  if (process.env.EKET_SLAVER_ID) {return process.env.EKET_SLAVER_ID;}
  const slaveridPath = path.join(projectRoot, '.eket', 'slaver-id');
  try {
    if (fs.existsSync(slaveridPath)) {
      const id = fs.readFileSync(slaveridPath, 'utf-8').trim();
      if (id) {return id;}
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
    let levelChanges: Array<import('../types/index.js').LevelChange> = [];
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
 * 获取 git 变更文件列表
 */
async function getChangedFiles(): Promise<string[]> {
  const result = await execFileNoThrow('git', ['diff', 'HEAD~1', '--name-only']);
  const output = result.stdout.trim();
  if (!output) {return [];}
  return output.split('\n').filter(Boolean);
}

/**
 * 运行完成验证，失败时写 inbox 并打印 warning（不硬阻断）
 */
async function runCompletionValidation(
  projectRoot: string,
  ticketId: string,
  slaverId: string,
): Promise<void> {
  try {
    const validator = new CompletionValidator(projectRoot);
    const changedFiles = await getChangedFiles();
    const report = await validator.validateCompletion(ticketId, changedFiles);

    if (!report.passed) {
      console.warn(`[completion-validator] WARN: ${report.summary}`);
      // Write to inbox
      const dir = path.join(projectRoot, 'inbox', 'human_feedback');
      fs.mkdirSync(dir, { recursive: true });
      const filename = `validation-warn-${ticketId}-${Date.now()}.md`;
      const details = report.checks
        .filter(c => !c.passed)
        .map(c => `- [${c.dimension}] ${c.message} (source: ${c.source})`)
        .join('\n');
      fs.writeFileSync(
        path.join(dir, filename),
        `## Completion Validation Warning — ${ticketId}\nSlaver: ${slaverId}\n\n${report.summary}\n\n${details}\n`,
        'utf-8',
      );
    } else {
      console.log(`[completion-validator] ${report.summary}`);
    }
  } catch (e: unknown) {
    console.warn(`[completion-validator] Failed (non-fatal): ${(e as Error).message ?? e}`);
  }
}

/**
 * Build and write SlaveResult to .eket/results/<ticketId>.json
 */
export async function writeSlaveResult(
  projectRoot: string,
  ticketId: string,
  slaverId: string,
  options: {
    prNumber?: number;
    prUrl?: string;
    skillFeedback?: SkillFeedback;
  } = {}
): Promise<SlaveResult> {
  const filesChanged: string[] = [];
  try {
    const result = await execFileNoThrow('git', ['diff', 'HEAD~1', '--name-only']);
    if (result.stdout.trim()) {
      filesChanged.push(...result.stdout.trim().split('\n').filter(Boolean));
    }
  } catch { /* non-fatal */ }

  const slaveResult: SlaveResult = {
    ticketId,
    slaverId,
    completedAt: Date.now(),
    prNumber: options.prNumber,
    prUrl: options.prUrl,
    filesChanged,
    testsAdded: 0,
    testsPassed: 0,
    keyDecisions: [],
    deferredIssues: [],
    skillFeedback: options.skillFeedback,
  };

  const resultsDir = path.join(projectRoot, '.eket', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(
    path.join(resultsDir, `${ticketId}.json`),
    JSON.stringify(slaveResult, null, 2),
    'utf-8'
  );
  console.log(`[slave-result] Written: .eket/results/${ticketId}.json`);

  return slaveResult;
}


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
        await runCompletionValidation(projectRoot, ticketId, slaverId);
        updateTicketStatus(projectRoot, ticketId, 'done');
        await reportSkillFeedback(projectRoot, ticketId, slaverId);
        await appendCommitTrailer(ticketId, slaverId);
        logSuccess('Task completed', [`Task: ${ticketId}`, 'Isolation: none']);
        sseBus.publish({ type: 'task_completed', ticketId, slaverId, timestamp: new Date().toISOString() });
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

      // Run completion validation before merge (warn, don't hard-block)
      await runCompletionValidation(projectRoot, ticketId, slaverId);

      try {
        await wm.mergeWorktree(ticketId);
        console.log(`[worktree] Merge successful`);
      } catch (e: unknown) {
        const err = e as { message?: string };
        const errMsg = err.message ?? 'unknown merge error';
        console.error(`[worktree] Merge failed: ${errMsg}`);

        // Update ticket status to BLOCKED
        updateTicketStatus(projectRoot, ticketId, 'blocked');

        // Publish task_failed SSE event (TASK-109)
        sseBus.publish({
          type: 'task_failed',
          ticketId,
          slaverId,
          timestamp: new Date().toISOString(),
          payload: { reason: 'worktree_merge_failed', error: errMsg },
        });

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

      // Archive session to confluence/memory (TASK-117)
      await contextCompressor.archiveToMemory(ticketId);

      // Append commit trailer (TASK-108)
      await appendCommitTrailer(ticketId, slaverId);

      // Write SlaveResult (TASK-121)
      await writeSlaveResult(projectRoot, ticketId, slaverId);

      logSuccess('Task completed', [
        `Task: ${ticketId}`,
        `Worktree merged and removed: ${worktreePath}`,
      ]);

      // Publish task_completed SSE event (TASK-109)
      sseBus.publish({
        type: 'task_completed',
        ticketId,
        slaverId,
        timestamp: new Date().toISOString(),
      });
    });
}
