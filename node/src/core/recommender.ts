/**
 * Recommender Engine
 * 基于技能匹配、历史表现和负载均衡的智能任务推荐
 *
 * Phase 5.2 - Intelligent Task Recommendation System
 */

import type {
  Recommendation,
  RecommenderConfig,
  TaskHistory,
  InstancePerformance,
  SkillMatchResult,
  InstanceWorkload,
  RecommendationResponse,
  RecommendationRequest,
} from '../types/recommender.js';
import {
  DEFAULT_RECOMMENDER_CONFIG,
  DEFAULT_ALGORITHM_PARAMS,
} from '../types/recommender.js';
import type { Instance, Ticket, Result } from '../types/index.js';
import { EketError } from '../types/index.js';
import { createInstanceRegistry } from '../core/instance-registry.js';
import { createHistoryTracker } from '../core/history-tracker.js';

/**
 * Recommender
 * 智能任务推荐引擎
 */
export class Recommender {
  private config: RecommenderConfig;
  private registry?: ReturnType<typeof createInstanceRegistry>;
  private historyTracker?: ReturnType<typeof createHistoryTracker>;

  constructor(config?: Partial<RecommenderConfig>) {
    // Defensive copy to prevent external mutation
    this.config = {
      ...DEFAULT_RECOMMENDER_CONFIG,
      ...config,
    };
  }

  /**
   * 初始化推荐引擎
   */
  async initialize(): Promise<Result<void>> {
    try {
      this.registry = createInstanceRegistry();
      this.historyTracker = createHistoryTracker();

      const connectResult = await this.registry.connect();
      if (!connectResult.success) {
        return connectResult;
      }

      const historyResult = await this.historyTracker.connect();
      if (!historyResult.success) {
        return historyResult;
      }

      return { success: true, data: undefined };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('RECOMMENDER_INIT_FAILED', `Failed to initialize recommender: ${errorMessage}`),
      };
    }
  }

  /**
   * 关闭推荐引擎
   */
  async shutdown(): Promise<void> {
    if (this.registry) {
      await this.registry.disconnect();
    }
    if (this.historyTracker) {
      await this.historyTracker.close();
    }
  }

  /**
   * 为 Instance 推荐任务
   */
  async recommendForInstance(
    instanceId: string,
    tasks: Ticket[],
    limit?: number
  ): Promise<Result<Recommendation[]>> {
    if (!this.registry || !this.historyTracker) {
      return {
        success: false,
        error: new EketError('RECOMMENDER_NOT_INITIALIZED', 'Recommender not initialized'),
      };
    }

    try {
      // 获取 Instance 信息
      const instanceResult = await this.registry.getInstance(instanceId);
      if (!instanceResult.success) {
        return instanceResult;
      }

      const instance = instanceResult.data;
      if (!instance) {
        return {
          success: false,
          error: new EketError('INSTANCE_NOT_FOUND', `Instance ${instanceId} not found`),
        };
      }

      // 获取 Instance 表现
      const perfResult = await this.historyTracker.getInstancePerformance(
        instanceId,
        instance.agent_type
      );
      if (!perfResult.success) {
        return perfResult;
      }

      // 为每个任务计算推荐分数
      const recommendations: Recommendation[] = [];

      for (const task of tasks) {
        // 跳过已分配给其他人的任务
        if (task.assignee && task.assignee !== instanceId) {
          continue;
        }

        const recommendation = this.calculateRecommendation(
          instance,
          task,
          perfResult.data,
          instance.currentLoad
        );

        // 过滤掉技能匹配度过低的任务
        if (recommendation.factors.skillMatch >= DEFAULT_ALGORITHM_PARAMS.skillMatchThreshold) {
          recommendations.push(recommendation);
        }
      }

      // 按分数排序
      recommendations.sort((a, b) => b.score - a.score);

      // 限制返回数量
      const maxCount = limit || this.config.maxRecommendations;
      const minCount = Math.min(this.config.minRecommendations, maxCount);

      return {
        success: true,
        data: recommendations.slice(0, Math.max(minCount, maxCount)),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('RECOMMENDATION_FAILED', `Failed to generate recommendations: ${errorMessage}`),
      };
    }
  }

  /**
   * 为任务推荐 Instance
   */
  async recommendForTask(
    taskId: string,
    instances: Instance[],
    limit?: number
  ): Promise<Result<Recommendation[]>> {
    if (!this.historyTracker) {
      return {
        success: false,
        error: new EketError('RECOMMENDER_NOT_INITIALIZED', 'Recommender not initialized'),
      };
    }

    try {
      // 构建任务对象（简化版）
      const task: Ticket = {
        id: taskId,
        title: '',
        priority: 'normal',
        tags: [],
        status: 'ready',
      };

      const recommendations: Recommendation[] = [];

      for (const instance of instances) {
        // 跳过非空闲状态的 Instance
        if (instance.status !== 'idle') {
          continue;
        }

        // 获取 Instance 表现
        const perfResult = await this.historyTracker.getInstancePerformance(
          instance.id,
          instance.agent_type
        );

        if (!perfResult.success) {
          continue;
        }

        const recommendation = this.calculateRecommendation(
          instance,
          task,
          perfResult.data,
          instance.currentLoad
        );

        // 过滤掉技能匹配度过低的推荐
        if (recommendation.factors.skillMatch >= DEFAULT_ALGORITHM_PARAMS.skillMatchThreshold) {
          recommendations.push(recommendation);
        }
      }

      // 按分数排序
      recommendations.sort((a, b) => b.score - a.score);

      // 限制返回数量
      const maxCount = limit || this.config.maxRecommendations;
      const minCount = Math.min(this.config.minRecommendations, maxCount);

      return {
        success: true,
        data: recommendations.slice(0, Math.max(minCount, maxCount)),
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('RECOMMENDATION_FAILED', `Failed to generate recommendations: ${errorMessage}`),
      };
    }
  }

  /**
   * 批量推荐（为所有 Instance 推荐任务）
   */
  async recommendAll(
    tasks: Ticket[],
    instances: Instance[]
  ): Promise<Result<Recommendation[]>> {
    const allRecommendations: Recommendation[] = [];

    for (const instance of instances) {
      if (instance.status !== 'idle') {
        continue;
      }

      // 获取 Instance 表现
      const perfResult = await this.historyTracker!.getInstancePerformance(
        instance.id,
        instance.agent_type
      );

      if (!perfResult.success) {
        continue;
      }

      // 为该 Instance 计算推荐
      for (const task of tasks) {
        if (task.assignee && task.assignee !== instance.id) {
          continue;
        }

        const recommendation = this.calculateRecommendation(
          instance,
          task,
          perfResult.data,
          instance.currentLoad
        );

        if (recommendation.factors.skillMatch >= DEFAULT_ALGORITHM_PARAMS.skillMatchThreshold) {
          allRecommendations.push(recommendation);
        }
      }
    }

    // 按分数排序
    allRecommendations.sort((a, b) => b.score - a.score);

    return {
      success: true,
      data: allRecommendations.slice(0, this.config.maxRecommendations),
    };
  }

  /**
   * 计算单个推荐分数
   */
  private calculateRecommendation(
    instance: Instance,
    task: Ticket,
    performance: InstancePerformance,
    currentLoad: number
  ): Recommendation {
    const reasons: string[] = [];

    // 1. 计算技能匹配度
    const skillMatch = this.calculateSkillMatch(instance.skills, task.tags);
    if (skillMatch.matchScore > 0.5) {
      reasons.push(`技能匹配度高 (${(skillMatch.matchScore * 100).toFixed(0)}%)`);
    }
    if (skillMatch.missingSkills.length > 0) {
      reasons.push(`缺少技能：${skillMatch.missingSkills.join(', ')}`);
    }

    // 2. 历史表现分数
    const historicalPerformance = performance.compositeScore;
    if (performance.totalTasks > 0) {
      reasons.push(`历史表现：${performance.averageQuality.toFixed(1)}/5 (${performance.totalTasks} 任务)`);
    } else {
      reasons.push('无历史记录，使用默认分数');
    }

    // 3. 负载平衡分数
    const workload = this.calculateWorkload(instance, currentLoad);
    const workloadBalance = workload.availableCapacity;
    if (workloadBalance > 0.7) {
      reasons.push('当前负载较低');
    } else if (workloadBalance < 0.3) {
      reasons.push('当前负载较高');
    }

    // 4. 优先级加成
    const priorityBonus = this.calculatePriorityBonus(task.priority);

    // 5. 综合分数
    const score =
      skillMatch.matchScore * this.config.skillMatchWeight +
      historicalPerformance * this.config.performanceWeight +
      workloadBalance * this.config.workloadWeight +
      priorityBonus;

    return {
      instanceId: instance.id,
      taskId: task.id,
      score: Math.round(score * 1000) / 1000,
      factors: {
        skillMatch: Math.round(skillMatch.matchScore * 1000) / 1000,
        historicalPerformance: Math.round(historicalPerformance * 1000) / 1000,
        workloadBalance: Math.round(workloadBalance * 1000) / 1000,
        priorityBonus: Math.round(priorityBonus * 1000) / 1000,
      },
      reasons,
    };
  }

  /**
   * 计算技能匹配度
   */
  private calculateSkillMatch(instanceSkills: string[], taskTags: string[]): SkillMatchResult {
    const normalizedInstanceSkills = instanceSkills.map((s) => s.toLowerCase());
    const normalizedTaskTags = taskTags.map((t) => t.toLowerCase());

    const matchedSkills: string[] = [];
    const missingSkills: string[] = [];

    for (const tag of normalizedTaskTags) {
      if (normalizedInstanceSkills.includes(tag)) {
        matchedSkills.push(tag);
      } else {
        missingSkills.push(tag);
      }
    }

    // 计算匹配分数
    const matchScore = taskTags.length > 0
      ? matchedSkills.length / taskTags.length
      : (instanceSkills.length > 0 ? 0.5 : 0); // 无标签时，有技能的 Instance 给中等分数

    return {
      requiredSkills: taskTags,
      instanceSkills,
      matchedSkills,
      missingSkills,
      matchScore,
    };
  }

  /**
   * 计算负载分数
   */
  private calculateWorkload(instance: Instance, currentLoad: number): InstanceWorkload {
    // 假设最大负载为 5 个任务
    const maxLoad = 5;
    const utilizationRate = Math.min(1, currentLoad / maxLoad);
    const availableCapacity = 1 - utilizationRate;

    return {
      instanceId: instance.id,
      currentLoad,
      maxLoad,
      utilizationRate,
      availableCapacity,
    };
  }

  /**
   * 计算优先级加成
   */
  private calculatePriorityBonus(priority: string): number {
    const bonuses: Record<string, number> = {
      urgent: 0.3,
      high: 0.2,
      normal: 0,
      low: -0.1,
    };
    return bonuses[priority] ?? 0;
  }

  /**
   * 记录任务完成（用于后续推荐）
   */
  async recordTaskCompletion(
    instanceId: string,
    taskId: string,
    quality: number,
    duration: number,
    role: string,
    exceededEstimate: boolean
  ): Promise<Result<number>> {
    if (!this.historyTracker) {
      return {
        success: false,
        error: new EketError('RECOMMENDER_NOT_INITIALIZED', 'Recommender not initialized'),
      };
    }

    const history: TaskHistory = {
      instanceId,
      taskId,
      role,
      quality,
      duration,
      exceededEstimate,
      completedAt: Date.now(),
    };

    return await this.historyTracker.recordTaskCompletion(history);
  }

  /**
   * 获取推荐详情报告
   */
  async getRecommendationReport(
    request: RecommendationRequest
  ): Promise<Result<RecommendationResponse>> {
    if (!this.registry || !this.historyTracker) {
      return {
        success: false,
        error: new EketError('RECOMMENDER_NOT_INITIALIZED', 'Recommender not initialized'),
      };
    }

    try {
      const { instanceId, taskId, limit } = request;

      let recommendations: Recommendation[] = [];
      let totalCandidates = 0;

      if (instanceId) {
        // 为 Instance 推荐任务
        const instancesResult = await this.registry.getActiveInstances();
        if (!instancesResult.success) {
          return instancesResult;
        }

        totalCandidates = instancesResult.data.length;

        // 这里简化处理，实际需要获取任务列表
        const result = await this.recommendForInstance(instanceId, [], limit);
        if (!result.success) {
          return result;
        }
        recommendations = result.data;
      } else if (taskId) {
        // 为任务推荐 Instance
        const instancesResult = await this.registry.getActiveInstances();
        if (!instancesResult.success) {
          return instancesResult;
        }

        totalCandidates = instancesResult.data.length;

        const result = await this.recommendForTask(taskId, instancesResult.data, limit);
        if (!result.success) {
          return result;
        }
        recommendations = result.data;
      }

      return {
        success: true,
        data: {
          success: true,
          recommendations,
          metadata: {
            totalCandidates,
            algorithmVersion: 'weighted-score-v1',
            computedAt: Date.now(),
            config: this.config,
          },
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('REPORT_GENERATION_FAILED', `Failed to generate report: ${errorMessage}`),
      };
    }
  }
}

/**
 * 创建 Recommender 实例
 */
export function createRecommender(config?: Partial<RecommenderConfig>): Recommender {
  return new Recommender(config);
}

/**
 * 便捷函数：生成推荐
 */
export async function generateRecommendations(
  instanceId: string,
  tasks: Ticket[],
  config?: Partial<RecommenderConfig>
): Promise<Result<Recommendation[]>> {
  const recommender = createRecommender(config);
  await recommender.initialize();

  try {
    return await recommender.recommendForInstance(instanceId, tasks);
  } finally {
    await recommender.shutdown();
  }
}
