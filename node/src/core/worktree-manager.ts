/**
 * WorktreeManager - Git Worktree Lifecycle Management
 *
 * 封装 git worktree 生命周期，为每个 Slaver 提供隔离执行环境。
 *
 * - worktree 路径：.claude/worktrees/<ticketId>/
 * - 分支命名：worktree/<ticketId>/<slaverId>
 * - 元数据：.claude/worktrees/index.json
 * - 创建/删除时触发 http-hook-server WorktreeCreate/WorktreeRemove 事件
 */

import * as fs from 'fs/promises';
import * as http from 'http';
import * as path from 'path';

import { execFileNoThrow } from '../utils/execFileNoThrow.js';

// ============================================================================
// Types
// ============================================================================

export interface WorktreeInfo {
  ticketId: string;
  slaverId: string;
  path: string;
  branch: string;
  createdAt: string;
}

interface WorktreeIndex {
  [ticketId: string]: WorktreeInfo;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  status: number;
}

export type ExecFn = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<ExecResult>;

export interface WorktreeManagerConfig {
  /** 项目根目录，默认 process.cwd() */
  projectRoot?: string;
  /** Hook server 端口，默认 3030 */
  hookServerPort?: number;
  /** Hook server host，默认 localhost */
  hookServerHost?: string;
  /**
   * 可替换的命令执行函数（用于测试注入）
   * 默认使用 execFileNoThrow
   */
  execFn?: ExecFn;
}

// ============================================================================
// WorktreeManager
// ============================================================================

export class WorktreeManager {
  private projectRoot: string;
  private hookServerPort: number;
  private hookServerHost: string;
  private execFn: ExecFn;

  constructor(config: WorktreeManagerConfig = {}) {
    this.projectRoot = config.projectRoot ?? process.cwd();
    this.hookServerPort = config.hookServerPort ?? 3030;
    this.hookServerHost = config.hookServerHost ?? 'localhost';
    this.execFn = config.execFn ?? execFileNoThrow;
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private get worktreesDir(): string {
    return path.join(this.projectRoot, '.claude', 'worktrees');
  }

  private get indexPath(): string {
    return path.join(this.worktreesDir, 'index.json');
  }

  private worktreePath(ticketId: string): string {
    return path.join(this.worktreesDir, ticketId);
  }

  private branchName(ticketId: string, slaverId: string): string {
    return `worktree/${ticketId}/${slaverId}`;
  }

  /** 读取 worktree 元数据索引 */
  private async readIndex(): Promise<WorktreeIndex> {
    try {
      const raw = await fs.readFile(this.indexPath, 'utf-8');
      return JSON.parse(raw) as WorktreeIndex;
    } catch {
      return {};
    }
  }

  /** 写入 worktree 元数据索引 */
  private async writeIndex(index: WorktreeIndex): Promise<void> {
    await fs.mkdir(this.worktreesDir, { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  /**
   * 向 hook server 发送事件（fire-and-forget，hook server 未运行时静默忽略）
   */
  private async sendHookEvent(
    eventType: 'WorktreeCreate' | 'WorktreeRemove',
    payload: Record<string, unknown>,
  ): Promise<void> {
    return new Promise((resolve) => {
      const body = JSON.stringify({ event: eventType, ...payload });
      const endpoint =
        eventType === 'WorktreeCreate' ? '/hooks/worktree-create' : '/hooks/worktree-remove';

      const req = http.request(
        {
          hostname: this.hookServerHost,
          port: this.hookServerPort,
          path: endpoint,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        () => resolve(),
      );

      req.on('error', () => resolve()); // hook server 未运行时静默忽略
      req.setTimeout(2000, () => {
        req.destroy();
        resolve();
      });
      req.write(body);
      req.end();
    });
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * 创建 worktree，返回 worktree 路径。
   * 基于当前 HEAD 创建新分支并 checkout 到独立目录。
   */
  async createWorktree(ticketId: string, slaverId: string): Promise<string> {
    const wtPath = this.worktreePath(ticketId);
    const branch = this.branchName(ticketId, slaverId);

    // 确保父目录存在
    await fs.mkdir(this.worktreesDir, { recursive: true });

    // git worktree add -b <branch> <path>
    const result = await this.execFn('git', ['worktree', 'add', '-b', branch, wtPath], {
      cwd: this.projectRoot,
    });

    if (result.status !== 0) {
      throw new Error(
        `WorktreeManager.createWorktree failed for ${ticketId}: ${result.stderr}`,
      );
    }

    // 写入元数据
    const index = await this.readIndex();
    const info: WorktreeInfo = {
      ticketId,
      slaverId,
      path: wtPath,
      branch,
      createdAt: new Date().toISOString(),
    };
    index[ticketId] = info;
    await this.writeIndex(index);

    // 触发 hook 事件（fire-and-forget）
    void this.sendHookEvent('WorktreeCreate', { ticketId, slaverId, path: wtPath, branch });

    return wtPath;
  }

  /**
   * Squash merge worktree 分支到当前主分支（在主仓库中执行）。
   */
  async mergeWorktree(ticketId: string): Promise<void> {
    const index = await this.readIndex();
    const info = index[ticketId];
    if (!info) {
      throw new Error(`WorktreeManager: no worktree found for ticketId=${ticketId}`);
    }

    // git merge --squash <branch>
    const mergeResult = await this.execFn('git', ['merge', '--squash', info.branch], {
      cwd: this.projectRoot,
    });
    if (mergeResult.status !== 0) {
      throw new Error(
        `WorktreeManager.mergeWorktree squash failed for ${ticketId}: ${mergeResult.stderr}`,
      );
    }

    // git commit
    const commitResult = await this.execFn(
      'git',
      ['commit', '-m', `feat: squash merge ${info.branch} [${ticketId}]`],
      { cwd: this.projectRoot },
    );
    if (commitResult.status !== 0) {
      throw new Error(
        `WorktreeManager.mergeWorktree commit failed for ${ticketId}: ${commitResult.stderr}`,
      );
    }
  }

  /**
   * 删除 worktree 及其分支。
   * force=true 时强制删除未合并的 worktree。
   */
  async removeWorktree(ticketId: string, force = false): Promise<void> {
    const index = await this.readIndex();
    const info = index[ticketId];
    if (!info) {
      throw new Error(`WorktreeManager: no worktree found for ticketId=${ticketId}`);
    }

    // git worktree remove [--force] <path>
    const removeArgs = force
      ? ['worktree', 'remove', '--force', info.path]
      : ['worktree', 'remove', info.path];

    const removeResult = await this.execFn('git', removeArgs, {
      cwd: this.projectRoot,
    });
    if (removeResult.status !== 0) {
      throw new Error(
        `WorktreeManager.removeWorktree failed for ${ticketId}: ${removeResult.stderr}`,
      );
    }

    // 删除分支（忽略失败，可能已合并/不存在）
    const deleteFlag = force ? '-D' : '-d';
    await this.execFn('git', ['branch', deleteFlag, info.branch], {
      cwd: this.projectRoot,
    });

    // 更新元数据
    delete index[ticketId];
    await this.writeIndex(index);

    // 触发 hook 事件（fire-and-forget）
    void this.sendHookEvent('WorktreeRemove', {
      ticketId,
      slaverId: info.slaverId,
      path: info.path,
      branch: info.branch,
    });
  }

  /**
   * 列出所有 EKET 管理的 worktree（从 index.json 读取）。
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    const index = await this.readIndex();
    return Object.values(index);
  }
}
