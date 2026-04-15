/**
 * Agent Pool Manager Module
 * Version: 2.0.0
 *
 * v2.0.0 扩展性增强:
 * - 分布式轮询索引（Redis 原子递增）
 * - 按角色维护轮询计数器
 * - TTL 防止键堆积
 *
 * 管理可用 Agent 实例的资源池，负责任务分配和负载均衡。
 *
 * 核心职责：
 * - 维护可用 Agent 列表（按角色/技能分类）
 * - 智能任务分配（基于角色匹配、负载均衡、历史表现）
 * - 健康检查和自动剔除离线 Agent
 * - Agent 容量管理（最大并发任务数）
 * - 与 HTTP Hook Server 集成（接收 TeambmateIdle 事件）
 *
 * @module AgentPool
 */

import * as fs from 'fs';
import * as path from 'path';

import { ROUND_ROBIN_TTL, ROUND_ROBIN_KEY_PREFIX } from '../constants.js';
import type {
  Result,
  Instance,
  DistributedRoundRobinConfig,
  InstanceRegistryConfig,
} from '../types/index.js';
import { EketError } from '../types/index.js';

import { InstanceRegistry, createInstanceRegistry } from './instance-registry.js';
import { RedisClient, createRedisClient } from './redis-client.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Agent 实例信息（从 Instance Registry 同步）
 */
export interface AgentInstance {
  id: string;
  role: string;
  skills: string[];
  status: 'idle' | 'busy' | 'offline';
  currentLoad: number; // 当前任务数
  maxLoad: number; // 最大并发任务数
  lastHeartbeat: number;
  metadata?: Record<string, unknown>;
}

/**
 * Agent 容量信息
 */
export interface AgentCapacity {
  agentId: string;
  role: string;
  currentLoad: number;
  maxLoad: number;
  availableSlots: number;
  utilizationRate: number;
}

/**
 * 任务分配结果
 */
export interface TaskAssignmentResult {
  success: boolean;
  agentId?: string;
  agentRole?: string;
  error?: { code: string; message: string };
  reason?: string;
}

/**
 * Agent Pool 配置
 */
export interface AgentPoolConfig {
  registryConfig?: InstanceRegistryConfig;
  heartbeatTimeout: number; // 心跳超时（毫秒）
  healthCheckInterval: number; // 健康检查间隔（毫秒）
  defaultMaxLoad: number; // 默认最大并发任务数
}

/**
 * Agent 选择策略
 */
export type AgentSelectionStrategy =
  | 'least_loaded' // 选择负载最低的
  | 'round_robin' // 轮询
  | 'random' // 随机
  | 'best_match'; // 最佳匹配（技能匹配度最高）

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_HEALTH_CHECK_INTERVAL = 10000; // 10 秒
const DEFAULT_MAX_AGENTS = 5; // 默认最大 5 个并发任务
const DEFAULT_HEARTBEAT_TIMEOUT = 30000; // 30 秒

const DEFAULT_CONFIG: AgentPoolConfig = {
  heartbeatTimeout: DEFAULT_HEARTBEAT_TIMEOUT,
  healthCheckInterval: DEFAULT_HEALTH_CHECK_INTERVAL,
  defaultMaxLoad: DEFAULT_MAX_AGENTS,
};

// ============================================================================
// Agent Pool Manager
// ============================================================================

export class AgentPoolManager {
  private registry: InstanceRegistry;
  private config: AgentPoolConfig;
  private healthCheckInterval?: NodeJS.Timeout;
  private roundRobinIndex: Map<string, number> = new Map(); // 按角色的本地轮询索引（fallback）
  private redis?: RedisClient;
  private roundRobinConfig: DistributedRoundRobinConfig;

  constructor(config: Partial<AgentPoolConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.registry = createInstanceRegistry(this.config.registryConfig);

    // 分布式轮询索引配置
    this.roundRobinConfig = {
      enabled: true, // 默认启用分布式轮询
      ttl: ROUND_ROBIN_TTL,
      keyPrefix: ROUND_ROBIN_KEY_PREFIX,
    };
  }

  /**
   * 启动 Agent Pool（连接 Registry，启动健康检查）
   */
  async start(): Promise<Result<void>> {
    const connectResult = await this.registry.connect();
    if (!connectResult.success) {
      return connectResult;
    }

    // 初始化 Redis 客户端用于分布式轮询
    this.redis = createRedisClient();
    const redisResult = await this.redis.connect();
    if (!redisResult.success) {
      console.warn('[Agent Pool] Redis connection failed, using local round-robin');
      this.roundRobinConfig.enabled = false;
    }

    // 启动健康检查循环
    this.startHealthCheckLoop();

    return { success: true, data: undefined };
  }

  /**
   * 停止 Agent Pool
   */
  async stop(): Promise<void> {
    this.stopHealthCheckLoop();
    await this.registry.disconnect();
    if (this.redis) {
      await this.redis.disconnect();
    }
  }

  /**
   * 获取分布式轮询计数器（原子递增）
   */
  private async getNextRoundRobinIndex(role: string): Promise<number> {
    const key = `${this.roundRobinConfig.keyPrefix}${role}`;

    // 如果分布式轮询未启用或 Redis 不可用，使用本地轮询
    if (!this.roundRobinConfig.enabled || !this.redis?.isReady()) {
      return this.getLocalRoundRobinIndex(role);
    }

    try {
      const client = this.redis.getClient();
      if (!client) {
        return this.getLocalRoundRobinIndex(role);
      }

      // 原子递增并设置 TTL
      const newValue = await client.incr(key);
      // 设置过期时间（防止键堆积）
      await client.expire(key, this.roundRobinConfig.ttl);

      return newValue;
    } catch (err) {
      console.warn('[Agent Pool] Redis INCR failed, using local round-robin');
      return this.getLocalRoundRobinIndex(role);
    }
  }

  /**
   * 获取本地轮询索引（fallback）
   */
  private getLocalRoundRobinIndex(role: string): number {
    const currentIndex = this.roundRobinIndex.get(role) || 0;
    const nextIndex = (currentIndex + 1) % Number.MAX_SAFE_INTEGER; // 防止溢出
    this.roundRobinIndex.set(role, nextIndex);
    return currentIndex;
  }

  /**
   * 启动健康检查循环
   */
  private startHealthCheckLoop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('[Agent Pool] Health check loop error:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * 停止健康检查循环
   */
  private stopHealthCheckLoop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * 执行健康检查
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const result = await this.registry.getActiveInstances();
      if (!result.success) {
        console.error('[Agent Pool] Health check failed:', result.error.message);
        return;
      }

      const instances = result.data;
      const now = Date.now();

      for (const instance of instances) {
        const lastHeartbeat = instance.lastHeartbeat || instance.updatedAt || 0;
        const timeSinceHeartbeat = now - lastHeartbeat;

        // 心跳过期，标记为 offline
        if (timeSinceHeartbeat > this.config.heartbeatTimeout) {
          console.log(
            `[Agent Pool] Agent ${instance.id} heartbeat expired ` +
              `(${Math.round(timeSinceHeartbeat / 1000)}s > ${this.config.heartbeatTimeout / 1000}s), marking as offline`
          );
          await this.registry.updateInstanceStatus(instance.id, 'offline');
        }
      }
    } catch (error) {
      console.error('[Agent Pool] Health check error:', error);
    }
  }

  /**
   * 获取指定角色的可用 Agent 列表
   */
  async getAvailableAgents(role?: string): Promise<Result<AgentInstance[]>> {
    const result = await this.registry.getAvailableInstances();
    if (!result.success) {
      return result;
    }

    const instances = result.data;
    const agents: AgentInstance[] = instances
      .filter((instance) => {
        // 按角色过滤
        if (role && instance.agent_type !== role) {
          return false;
        }
        // 只返回 idle 状态的
        return instance.status === 'idle';
      })
      .map((instance) => this.toAgentInstance(instance));

    return { success: true, data: agents };
  }

  /**
   * 选择最适合的 Agent
   */
  async selectAgent(
    requiredRole: string,
    requiredSkills?: string[],
    strategy: AgentSelectionStrategy = 'least_loaded'
  ): Promise<Result<AgentInstance | null>> {
    const agentsResult = await this.getAvailableAgents(requiredRole);
    if (!agentsResult.success) {
      return agentsResult;
    }

    const agents = agentsResult.data;
    if (agents.length === 0) {
      return { success: true, data: null }; // 没有可用 Agent
    }

    // 按技能匹配度过滤（使用大小写不敏感匹配）
    let candidates = agents;
    if (requiredSkills && requiredSkills.length > 0) {
      // Normalize required skills to lowercase for case-insensitive matching
      const normalizedRequiredSkills = requiredSkills.map((skill) => skill.toLowerCase());

      candidates = agents.filter((agent) => {
        // Normalize agent skills to lowercase
        const normalizedAgentSkills = agent.skills.map((skill) => skill.toLowerCase());
        const hasRequiredSkill = normalizedRequiredSkills.every((skill) =>
          normalizedAgentSkills.includes(skill)
        );
        return hasRequiredSkill;
      });

      // 如果没有完全匹配的，退回使用所有 agents
      if (candidates.length === 0) {
        console.log(
          `[Agent Pool] No agents with all required skills, ` +
            `using ${agents.length} agents with role ${requiredRole}`
        );
        candidates = agents;
      }
    }

    // 根据策略选择
    let selected: AgentInstance | null = null;

    switch (strategy) {
      case 'least_loaded':
        selected = this.selectLeastLoaded(candidates);
        break;
      case 'round_robin':
        selected = await this.selectRoundRobin(requiredRole, candidates);
        break;
      case 'random':
        selected = this.selectRandom(candidates);
        break;
      case 'best_match':
        selected = requiredSkills
          ? this.selectBestMatch(candidates, requiredSkills)
          : this.selectLeastLoaded(candidates);
        break;
    }

    return { success: true, data: selected };
  }

  /**
   * 选择负载最低的 Agent
   */
  private selectLeastLoaded(agents: AgentInstance[]): AgentInstance | null {
    if (agents.length === 0) {
      return null;
    }

    return agents.reduce((least, current) => {
      const leastLoadRatio = least.currentLoad / least.maxLoad;
      const currentLoadRatio = current.currentLoad / current.maxLoad;
      return currentLoadRatio < leastLoadRatio ? current : least;
    });
  }

  /**
   * 轮询选择 Agent
   */
  private async selectRoundRobin(
    role: string,
    agents: AgentInstance[]
  ): Promise<AgentInstance | null> {
    if (agents.length === 0) {
      return null;
    }

    // 使用分布式轮询索引
    const index = await this.getNextRoundRobinIndex(role);
    const selectedIndex = index % agents.length;

    return agents[selectedIndex] || null;
  }

  /**
   * 随机选择 Agent
   */
  private selectRandom(agents: AgentInstance[]): AgentInstance | null {
    if (agents.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * agents.length);
    return agents[randomIndex] || null;
  }

  /**
   * 选择技能匹配度最高的 Agent
   */
  private selectBestMatch(agents: AgentInstance[], requiredSkills: string[]): AgentInstance | null {
    if (agents.length === 0) {
      return null;
    }

    // Normalize required skills to lowercase for case-insensitive matching
    const normalizedRequiredSkills = requiredSkills.map((skill) => skill.toLowerCase());

    let bestMatch: AgentInstance | null = null;
    let bestMatchCount = -1;

    for (const agent of agents) {
      // Normalize agent skills to lowercase
      const normalizedAgentSkills = agent.skills.map((skill) => skill.toLowerCase());

      const matchedCount = normalizedRequiredSkills.filter((skill) =>
        normalizedAgentSkills.includes(skill)
      ).length;

      if (matchedCount > bestMatchCount) {
        bestMatch = agent;
        bestMatchCount = matchedCount;
      }
    }

    return bestMatch;
  }

  /**
   * 分配任务给 Agent（标记为 busy）
   */
  async assignTaskToAgent(agentId: string, taskId: string): Promise<Result<TaskAssignmentResult>> {
    // 获取 Agent 信息
    const agentResult = await this.registry.getInstance(agentId);
    if (!agentResult.success) {
      return {
        success: false,
        error: agentResult.error,
      };
    }

    if (!agentResult.data) {
      return {
        success: true,
        data: {
          success: false,
          error: { code: 'AGENT_NOT_FOUND', message: `Agent ${agentId} not found` },
          reason: 'Agent not found',
        },
      };
    }

    const instance = agentResult.data;

    // 检查 Agent 是否可用
    if (instance.status !== 'idle') {
      return {
        success: true,
        data: {
          success: false,
          error: { code: 'AGENT_BUSY', message: `Agent ${agentId} is busy` },
          reason: `Agent is ${instance.status}`,
        },
      };
    }

    // 检查负载
    const maxLoad = this.config.defaultMaxLoad;
    if (instance.currentLoad >= maxLoad) {
      return {
        success: true,
        data: {
          success: false,
          error: { code: 'AGENT_AT_CAPACITY', message: `Agent ${agentId} is at capacity` },
          reason: `Agent at max load (${instance.currentLoad}/${maxLoad})`,
        },
      };
    }

    // 更新 Agent 状态
    const updateResult = await this.registry.updateInstanceStatus(agentId, 'busy', taskId);

    if (!updateResult.success) {
      return {
        success: false,
        error: updateResult.error,
      };
    }

    return {
      success: true,
      data: {
        success: true,
        agentId,
        agentRole: instance.agent_type,
      },
    };
  }

  /**
   * 释放 Agent（任务完成后）
   */
  async releaseAgent(agentId: string, taskId?: string): Promise<Result<void>> {
    return await this.registry.updateInstanceStatus(agentId, 'idle', taskId);
  }

  /**
   * 通知 Handoff 就绪 — Slaver 完成任务后调用
   * 自动寻找 ready 状态的下一个 ticket 并写入 inbox 通知文件
   * 保留人工控制点：Master 需执行 handoff:confirm 命令确认
   */
  async notifyHandoffReady(
    completedTicketId: string,
    slaverId: string,
    projectRoot: string
  ): Promise<Result<string>> {
    try {
      // 查找 ready 状态的 ticket（扫描 jira/tickets/）
      const jiraDir = path.join(projectRoot, 'jira', 'tickets');
      let suggestedNextTicketId: string | undefined;

      if (fs.existsSync(jiraDir)) {
        const files = fs.readdirSync(jiraDir).filter((f) => f.endsWith('.md'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(jiraDir, file), 'utf-8');
          const statusMatch = content.match(/\*\*status\*\*:\s*(\w+)/i);
          if (statusMatch?.[1]?.toLowerCase() === 'ready') {
            // 提取 ticket ID（文件名去掉 .md）
            suggestedNextTicketId = path.basename(file, '.md').toUpperCase();
            break;
          }
        }
      }

      // 写入 inbox 通知文件
      const feedbackDir = path.join(projectRoot, 'inbox', 'human_feedback');
      if (!fs.existsSync(feedbackDir)) {
        fs.mkdirSync(feedbackDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const inboxFile = path.join(feedbackDir, `handoff-${completedTicketId}-${timestamp}.md`);
      const suggestionNote = suggestedNextTicketId
        ? `建议下一任务: ${suggestedNextTicketId}（ready 状态，角色匹配）`
        : '未找到 ready 状态任务，Master 请手动分配';
      const confirmCmd = `node dist/index.js handoff:confirm ${completedTicketId} ${slaverId}`;

      const content = [
        `## Handoff 请求 — ${completedTicketId} 完成`,
        '',
        `Slaver: ${slaverId}`,
        `完成时间: ${new Date().toISOString()}`,
        `${suggestionNote}`,
        `确认命令: \`${confirmCmd}\``,
        '',
        '---',
        '',
        '> 执行上述确认命令后，框架将自动分配下一任务给该 Slaver。',
        '> 如不需要自动 Handoff，忽略此文件即可。',
      ].join('\n');

      fs.writeFileSync(inboxFile, content, 'utf-8');

      return { success: true, data: inboxFile };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('HANDOFF_NOTIFY_FAILED', `Failed to notify handoff: ${errorMessage}`),
      };
    }
  }

  /**
   * 执行 Handoff — Master 确认后调用
   * 将 Slaver 的当前任务更新为新 ticket，状态变为 busy
   */
  async executeHandoff(
    slaverId: string,
    newTicketId: string
  ): Promise<Result<void>> {
    // 先将 Slaver 设为 idle，再分配新任务
    const releaseResult = await this.registry.updateInstanceStatus(slaverId, 'idle', undefined);
    if (!releaseResult.success) {
      return releaseResult;
    }

    // 分配新任务
    const assignResult = await this.assignTaskToAgent(slaverId, newTicketId);
    if (!assignResult.success) {
      return assignResult;
    }

    if (!assignResult.data.success) {
      return {
        success: false,
        error: new EketError(
          'HANDOFF_ASSIGN_FAILED',
          assignResult.data.error?.message || 'Failed to assign task during handoff'
        ),
      };
    }

    return { success: true, data: undefined };
  }

  /**
   * 获取 Agent 容量信息
   */
  async getAgentCapacity(agentId: string): Promise<Result<AgentCapacity | null>> {
    const agentResult = await this.registry.getInstance(agentId);
    if (!agentResult.success) {
      return agentResult;
    }

    if (!agentResult.data) {
      return { success: true, data: null };
    }

    const instance = agentResult.data;
    const maxLoad = this.config.defaultMaxLoad;
    const currentLoad = instance.currentLoad || 0;

    return {
      success: true,
      data: {
        agentId,
        role: instance.agent_type,
        currentLoad,
        maxLoad,
        availableSlots: Math.max(0, maxLoad - currentLoad),
        utilizationRate: currentLoad / maxLoad,
      },
    };
  }

  /**
   * 获取所有 Agent 的容量信息
   */
  async getAllAgentCapacities(role?: string): Promise<Result<AgentCapacity[]>> {
    const result = role
      ? await this.registry.getInstancesByRole(role)
      : await this.registry.getActiveInstances();

    if (!result.success) {
      return result;
    }

    const capacities: AgentCapacity[] = result.data.map((instance) => {
      const maxLoad = this.config.defaultMaxLoad;
      const currentLoad = instance.currentLoad || 0;
      return {
        agentId: instance.id,
        role: instance.agent_type,
        currentLoad,
        maxLoad,
        availableSlots: Math.max(0, maxLoad - currentLoad),
        utilizationRate: currentLoad / maxLoad,
      };
    });

    return { success: true, data: capacities };
  }

  /**
   * 注册新 Agent（辅助方法）
   */
  async registerAgent(agent: Partial<Instance>): Promise<Result<string>> {
    const instanceId = agent.id || `agent_${agent.agent_type || 'product_manager'}_${Date.now()}`;

    const instance: Instance = {
      id: instanceId,
      type: agent.type || 'ai',
      agent_type: agent.agent_type || 'product_manager',
      skills: agent.skills || [],
      status: agent.status || 'idle',
      currentTaskId: agent.currentTaskId,
      currentLoad: agent.currentLoad || 0,
      lastHeartbeat: Date.now(),
      updatedAt: Date.now(),
      metadata: agent.metadata,
    };

    const result = await this.registry.registerInstance(instance);
    if (!result.success) {
      return result;
    }

    return { success: true, data: instanceId };
  }

  /**
   * 注销 Agent
   */
  async unregisterAgent(agentId: string): Promise<Result<void>> {
    return await this.registry.unregisterInstance(agentId);
  }

  /**
   * 转换 Instance 为 AgentInstance
   */
  private toAgentInstance(instance: Instance): AgentInstance {
    return {
      id: instance.id,
      role: instance.agent_type,
      skills: instance.skills || [],
      status: instance.status,
      currentLoad: instance.currentLoad || 0,
      maxLoad: this.config.defaultMaxLoad,
      lastHeartbeat: instance.lastHeartbeat || instance.updatedAt || Date.now(),
      metadata: instance.metadata,
    };
  }

  /**
   * 获取 Pool 统计信息
   */
  async getStats(): Promise<
    Result<{
      totalAgents: number;
      idleAgents: number;
      busyAgents: number;
      offlineAgents: number;
      totalCapacity: number;
      usedCapacity: number;
      utilizationRate: number;
    }>
  > {
    const result = await this.registry.getActiveInstances();
    if (!result.success) {
      return result;
    }

    const instances = result.data;
    const totalAgents = instances.length;
    const idleAgents = instances.filter((i) => i.status === 'idle').length;
    const busyAgents = instances.filter((i) => i.status === 'busy').length;
    const offlineAgents = instances.filter((i) => i.status === 'offline').length;
    const totalCapacity = totalAgents * this.config.defaultMaxLoad;
    const usedCapacity = instances.reduce((sum, i) => sum + (i.currentLoad || 0), 0);

    return {
      success: true,
      data: {
        totalAgents,
        idleAgents,
        busyAgents,
        offlineAgents,
        totalCapacity,
        usedCapacity,
        utilizationRate: totalCapacity > 0 ? usedCapacity / totalCapacity : 0,
      },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * 创建 Agent Pool Manager
 */
export function createAgentPoolManager(config?: Partial<AgentPoolConfig>): AgentPoolManager {
  return new AgentPoolManager(config);
}
