/**
 * EKET Framework - Master Cognitive Continuity
 *
 * Master 认知连续性管理器
 *
 * 解决 Master 切换时的认知断层问题：
 * - 保存当前 Master 的判断性知识（风险、决策、项目状态）
 * - 新 Master 选举成功后加载前任 Master 的 context
 * - 双写策略：优先 Redis，降级文件
 *
 * 持久化策略：
 * 1. 优先写入 Redis key `eket:master:context`（TTL = 7天）
 * 2. Redis 不可用时降级到 `.eket/state/master-context.json`
 * 3. 两处都写（双写保证数据安全）
 * 4. 读时优先 Redis，降级文件
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

import type { Result } from '../types/index.js';
import { EketError, EketErrorCode } from '../types/index.js';

import { createRedisClient, type RedisClient } from './redis-client.js';

// ============================================================================
// Types
// ============================================================================

export interface ActiveRisk {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  relatedTickets: string[];
  detectedAt: number;
  mitigationStatus: 'none' | 'in_progress' | 'mitigated';
}

export interface PendingJudgment {
  id: string;
  question: string;
  context: string;
  options: string[];
  urgency: 'low' | 'normal' | 'high';
  raisedAt: number;
  raisedBy: string;
}

export interface RecentDecision {
  id: string;
  summary: string;
  rationale: string;
  affectedTickets: string[];
  madeAt: number;
  madeBy: string;
}

export interface ProjectPulse {
  overallHealth: 'healthy' | 'stressed' | 'blocked';
  blockedTickets: string[];
  criticalPath: string[];
  estimatedCompletionRisk: 'low' | 'medium' | 'high';
  lastAssessedAt: number;
}

export interface MasterContext {
  masterId: string;
  capturedAt: number;
  leaseExpiresAt: number;
  activeRisks: ActiveRisk[];
  pendingJudgments: PendingJudgment[];
  recentDecisions: RecentDecision[];
  projectPulse: ProjectPulse;
}

// ============================================================================
// Constants
// ============================================================================

const REDIS_CONTEXT_KEY = 'eket:master:context';
const REDIS_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const STATE_FILE_NAME = 'master-context.json';

// ============================================================================
// MasterContextManager
// ============================================================================

export class MasterContextManager {
  private readonly stateFilePath: string;
  private redisClient: RedisClient | null = null;

  constructor(projectRoot: string) {
    this.stateFilePath = path.join(
      projectRoot,
      '.eket',
      'state',
      STATE_FILE_NAME
    );
  }

  // --------------------------------------------------------------------------
  // Redis Connection Management
  // --------------------------------------------------------------------------

  /**
   * 建立持久化 Redis 连接（可选调用；若未调用则每次操作临时连接）
   */
  async connectRedis(): Promise<Result<void>> {
    if (this.redisClient) {
      return { success: true, data: undefined };
    }
    const client = createRedisClient({ keyPrefix: '' });
    const result = await client.connect();
    if (result.success) {
      this.redisClient = client;
    }
    return result;
  }

  /**
   * 断开持久化 Redis 连接
   */
  async disconnectRedis(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.disconnect();
      this.redisClient = null;
    }
  }

  // --------------------------------------------------------------------------
  // Core Persistence
  // --------------------------------------------------------------------------

  /**
   * 保存 MasterContext（双写：Redis + 文件）
   */
  async saveContext(
    context: Omit<MasterContext, 'capturedAt'>
  ): Promise<Result<void>> {
    const fullContext: MasterContext = {
      ...context,
      capturedAt: Date.now(),
    };

    const serialized = JSON.stringify(fullContext, null, 2);

    // 并行双写，收集错误
    const [redisResult, fileResult] = await Promise.allSettled([
      this._writeToRedis(serialized),
      this._writeToFile(serialized),
    ]);

    // 只要有一个成功就认为保存成功
    const redisOk =
      redisResult.status === 'fulfilled' && redisResult.value.success;
    const fileOk =
      fileResult.status === 'fulfilled' && fileResult.value.success;

    if (!redisOk && !fileOk) {
      const redisErr =
        redisResult.status === 'fulfilled'
          ? redisResult.value.success === false
            ? redisResult.value.error.message
            : 'unknown'
          : String(redisResult.reason);

      const fileErr =
        fileResult.status === 'fulfilled'
          ? fileResult.value.success === false
            ? fileResult.value.error.message
            : 'unknown'
          : String(fileResult.reason);

      return {
        success: false,
        error: new EketError(
          EketErrorCode.MASTER_CONTEXT_SAVE_FAILED,
          `Failed to save master context to both Redis and file. Redis: ${redisErr}. File: ${fileErr}`
        ),
      };
    }

    return { success: true, data: undefined };
  }

  /**
   * 加载最新 MasterContext（优先 Redis，降级文件）
   */
  async loadContext(): Promise<Result<MasterContext | null>> {
    // 1. 尝试从 Redis 加载
    const redisResult = await this._readFromRedis();
    if (redisResult.success && redisResult.data !== null) {
      return { success: true, data: redisResult.data };
    }

    // 2. 降级到文件
    const fileResult = this._readFromFile();
    if (fileResult.success) {
      return { success: true, data: fileResult.data };
    }

    // 3. 两者都失败但可能只是没有 context（不是错误）
    if (
      !redisResult.success &&
      fileResult.success === false &&
      (fileResult.error.code === 'MASTER_CONTEXT_FILE_NOT_FOUND' ||
        fileResult.error.code === 'REDIS_CONTEXT_NOT_FOUND')
    ) {
      return { success: true, data: null };
    }

    return {
      success: false,
      error: new EketError(
        'MASTER_CONTEXT_LOAD_FAILED',
        `Failed to load master context from both Redis and file`
      ),
    };
  }

  // --------------------------------------------------------------------------
  // Risk Management
  // --------------------------------------------------------------------------

  /**
   * 新增活跃风险点
   */
  async addActiveRisk(
    risk: Omit<ActiveRisk, 'id' | 'detectedAt'>
  ): Promise<Result<ActiveRisk>> {
    const loadResult = await this.loadContext();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const context = loadResult.data;
    if (context === null) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.MASTER_CONTEXT_NOT_FOUND,
          'No master context exists. Call saveContext first.'
        ),
      };
    }

    const newRisk: ActiveRisk = {
      ...risk,
      id: this._generateId('risk'),
      detectedAt: Date.now(),
    };

    context.activeRisks.push(newRisk);

    const saveResult = await this.saveContext(context);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, data: newRisk };
  }

  // --------------------------------------------------------------------------
  // Judgment Management
  // --------------------------------------------------------------------------

  /**
   * 新增悬而未决的判断
   */
  async addPendingJudgment(
    judgment: Omit<PendingJudgment, 'id' | 'raisedAt'>
  ): Promise<Result<PendingJudgment>> {
    const loadResult = await this.loadContext();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const context = loadResult.data;
    if (context === null) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.MASTER_CONTEXT_NOT_FOUND,
          'No master context exists. Call saveContext first.'
        ),
      };
    }

    const newJudgment: PendingJudgment = {
      ...judgment,
      id: this._generateId('judgment'),
      raisedAt: Date.now(),
    };

    context.pendingJudgments.push(newJudgment);

    const saveResult = await this.saveContext(context);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, data: newJudgment };
  }

  /**
   * 解决一个悬而未决的判断
   */
  async resolvePendingJudgment(
    id: string,
    resolution: string
  ): Promise<Result<void>> {
    const loadResult = await this.loadContext();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const context = loadResult.data;
    if (context === null) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.MASTER_CONTEXT_NOT_FOUND,
          'No master context exists.'
        ),
      };
    }

    const idx = context.pendingJudgments.findIndex((j) => j.id === id);
    if (idx === -1) {
      return {
        success: false,
        error: new EketError(
          'PENDING_JUDGMENT_NOT_FOUND',
          `Pending judgment with id "${id}" not found`
        ),
      };
    }

    // 将 resolution 追加到 context 字段，并从列表中移除
    const resolved = context.pendingJudgments[idx];
    const resolvedDecision: RecentDecision = {
      id: this._generateId('decision'),
      summary: `Resolved: ${resolved.question}`,
      rationale: resolution,
      affectedTickets: [],
      madeAt: Date.now(),
      madeBy: 'master',
    };

    context.pendingJudgments.splice(idx, 1);
    context.recentDecisions.push(resolvedDecision);

    const saveResult = await this.saveContext(context);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, data: undefined };
  }

  // --------------------------------------------------------------------------
  // Decision Management
  // --------------------------------------------------------------------------

  /**
   * 新增最近决策记录
   */
  async addRecentDecision(
    decision: Omit<RecentDecision, 'id' | 'madeAt'>
  ): Promise<Result<RecentDecision>> {
    const loadResult = await this.loadContext();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const context = loadResult.data;
    if (context === null) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.MASTER_CONTEXT_NOT_FOUND,
          'No master context exists. Call saveContext first.'
        ),
      };
    }

    const newDecision: RecentDecision = {
      ...decision,
      id: this._generateId('decision'),
      madeAt: Date.now(),
    };

    context.recentDecisions.push(newDecision);

    const saveResult = await this.saveContext(context);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, data: newDecision };
  }

  // --------------------------------------------------------------------------
  // Project Pulse
  // --------------------------------------------------------------------------

  /**
   * 更新项目整体节奏感知
   */
  async updateProjectPulse(pulse: ProjectPulse): Promise<Result<void>> {
    const loadResult = await this.loadContext();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const context = loadResult.data;
    if (context === null) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.MASTER_CONTEXT_NOT_FOUND,
          'No master context exists. Call saveContext first.'
        ),
      };
    }

    context.projectPulse = pulse;

    const saveResult = await this.saveContext(context);
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    return { success: true, data: undefined };
  }

  // --------------------------------------------------------------------------
  // Handover Summary
  // --------------------------------------------------------------------------

  /**
   * 生成给下一个 Master 的文字摘要
   */
  async generateHandoverSummary(): Promise<Result<string>> {
    const loadResult = await this.loadContext();
    if (!loadResult.success) {
      return { success: false, error: loadResult.error };
    }

    const context = loadResult.data;
    if (context === null) {
      return {
        success: false,
        error: new EketError(
          EketErrorCode.MASTER_CONTEXT_NOT_FOUND,
          'No master context exists to generate handover summary.'
        ),
      };
    }

    const lines: string[] = [];

    lines.push('# Master Handover Summary');
    lines.push('');
    lines.push(
      `**Previous Master**: ${context.masterId}  `
    );
    lines.push(
      `**Context Captured At**: ${new Date(context.capturedAt).toISOString()}  `
    );
    lines.push(
      `**Lease Expires At**: ${new Date(context.leaseExpiresAt).toISOString()}`
    );
    lines.push('');

    // Project Pulse
    lines.push('## Project Health');
    lines.push(
      `- **Overall Health**: ${context.projectPulse.overallHealth}`
    );
    lines.push(
      `- **Completion Risk**: ${context.projectPulse.estimatedCompletionRisk}`
    );
    if (context.projectPulse.blockedTickets.length > 0) {
      lines.push(
        `- **Blocked Tickets**: ${context.projectPulse.blockedTickets.join(', ')}`
      );
    }
    if (context.projectPulse.criticalPath.length > 0) {
      lines.push(
        `- **Critical Path**: ${context.projectPulse.criticalPath.join(' → ')}`
      );
    }
    lines.push('');

    // Active Risks
    if (context.activeRisks.length > 0) {
      lines.push('## Active Risks');
      for (const risk of context.activeRisks) {
        const icon =
          risk.severity === 'critical'
            ? '🔴'
            : risk.severity === 'high'
              ? '🟠'
              : risk.severity === 'medium'
                ? '🟡'
                : '🟢';
        lines.push(
          `- ${icon} **[${risk.severity.toUpperCase()}]** ${risk.description} (status: ${risk.mitigationStatus})`
        );
        if (risk.relatedTickets.length > 0) {
          lines.push(
            `  - Related tickets: ${risk.relatedTickets.join(', ')}`
          );
        }
      }
      lines.push('');
    }

    // Pending Judgments
    if (context.pendingJudgments.length > 0) {
      lines.push('## Pending Judgments (Decisions Needed)');
      for (const judgment of context.pendingJudgments) {
        const urgencyIcon =
          judgment.urgency === 'high'
            ? '⚡'
            : judgment.urgency === 'normal'
              ? '📋'
              : '📝';
        lines.push(
          `- ${urgencyIcon} **[${judgment.urgency.toUpperCase()}]** ${judgment.question}`
        );
        lines.push(`  - Context: ${judgment.context}`);
        if (judgment.options.length > 0) {
          lines.push(`  - Options: ${judgment.options.join(' / ')}`);
        }
        lines.push(`  - Raised by: ${judgment.raisedBy}`);
      }
      lines.push('');
    }

    // Recent Decisions
    if (context.recentDecisions.length > 0) {
      lines.push('## Recent Non-Obvious Decisions');
      // 最多显示最近 5 条
      const recent = context.recentDecisions
        .slice()
        .sort((a, b) => b.madeAt - a.madeAt)
        .slice(0, 5);
      for (const decision of recent) {
        lines.push(`- **${decision.summary}**`);
        lines.push(`  - Why: ${decision.rationale}`);
        if (decision.affectedTickets.length > 0) {
          lines.push(
            `  - Affected tickets: ${decision.affectedTickets.join(', ')}`
          );
        }
        lines.push(`  - Made by: ${decision.madeBy}`);
      }
      lines.push('');
    }

    if (
      context.activeRisks.length === 0 &&
      context.pendingJudgments.length === 0 &&
      context.recentDecisions.length === 0
    ) {
      lines.push('*No significant risks, pending judgments, or recent decisions recorded.*');
      lines.push('');
    }

    lines.push('---');
    lines.push('*This summary was auto-generated by MasterContextManager.*');

    return { success: true, data: lines.join('\n') };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private _generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  private async _writeToRedis(serialized: string): Promise<Result<void>> {
    try {
      // 优先使用持久化客户端；若无则创建临时连接（向后兼容）
      const usePersistent = this.redisClient !== null;
      const redisClient = usePersistent ? this.redisClient! : createRedisClient({ keyPrefix: '' });

      if (!usePersistent) {
        const connectResult = await redisClient.connect();
        if (!connectResult.success) {
          return { success: false, error: connectResult.error };
        }
      }

      const client = redisClient.getClient();
      if (!client) {
        if (!usePersistent) { await redisClient.disconnect(); }
        return {
          success: false,
          error: new EketError(
            EketErrorCode.REDIS_CLIENT_NOT_AVAILABLE,
            'Redis client not available after connect'
          ),
        };
      }

      await client.setex(REDIS_CONTEXT_KEY, REDIS_TTL_SECONDS, serialized);
      if (!usePersistent) { await redisClient.disconnect(); }

      return { success: true, data: undefined };
    } catch (e: unknown) {
      const err = e as { message?: string };
      return {
        success: false,
        error: new EketError(
          EketErrorCode.REDIS_WRITE_FAILED,
          `Failed to write master context to Redis: ${err.message ?? 'unknown'}`
        ),
      };
    }
  }

  private async _readFromRedis(): Promise<Result<MasterContext | null>> {
    try {
      // 优先使用持久化客户端；若无则创建临时连接（向后兼容）
      const usePersistent = this.redisClient !== null;
      const redisClient = usePersistent ? this.redisClient! : createRedisClient({ keyPrefix: '' });

      if (!usePersistent) {
        const connectResult = await redisClient.connect();
        if (!connectResult.success) {
          return { success: false, error: connectResult.error };
        }
      }

      const client = redisClient.getClient();
      if (!client) {
        if (!usePersistent) { await redisClient.disconnect(); }
        return {
          success: false,
          error: new EketError(
            EketErrorCode.REDIS_CLIENT_NOT_AVAILABLE,
            'Redis client not available after connect'
          ),
        };
      }

      const raw = await client.get(REDIS_CONTEXT_KEY);
      if (!usePersistent) { await redisClient.disconnect(); }

      if (raw === null) {
        return {
          success: false,
          error: new EketError(
            'REDIS_CONTEXT_NOT_FOUND',
            'No master context found in Redis'
          ),
        };
      }

      const parsed = JSON.parse(raw) as MasterContext;
      return { success: true, data: parsed };
    } catch (e: unknown) {
      const err = e as { message?: string };
      return {
        success: false,
        error: new EketError(
          EketErrorCode.REDIS_READ_FAILED,
          `Failed to read master context from Redis: ${err.message ?? 'unknown'}`
        ),
      };
    }
  }

  private _writeToFile(serialized: string): Result<void> {
    try {
      const dir = path.dirname(this.stateFilePath);
      fs.mkdirSync(dir, { recursive: true });

      // 原子写入：先写临时文件，再 rename
      const tmpPath = `${this.stateFilePath}.tmp`;
      fs.writeFileSync(tmpPath, serialized, 'utf-8');
      fs.renameSync(tmpPath, this.stateFilePath);

      return { success: true, data: undefined };
    } catch (e: unknown) {
      const err = e as { message?: string };
      return {
        success: false,
        error: new EketError(
          EketErrorCode.FILE_WRITE_FAILED,
          `Failed to write master context to file: ${err.message ?? 'unknown'}`
        ),
      };
    }
  }

  private _readFromFile(): Result<MasterContext | null> {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return {
          success: false,
          error: new EketError(
            'MASTER_CONTEXT_FILE_NOT_FOUND',
            `Master context file not found: ${this.stateFilePath}`
          ),
        };
      }

      const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
      const parsed = JSON.parse(raw) as MasterContext;
      return { success: true, data: parsed };
    } catch (e: unknown) {
      const err = e as { message?: string };
      return {
        success: false,
        error: new EketError(
          EketErrorCode.FILE_READ_FAILED,
          `Failed to read master context from file: ${err.message ?? 'unknown'}`
        ),
      };
    }
  }
}
