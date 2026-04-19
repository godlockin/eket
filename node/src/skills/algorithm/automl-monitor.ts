/**
 * EKET Framework - Algorithm Skill: AutoML Monitor (AutoResearch Loop)
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface AutoMLMonitorInput {
  /** 模型/服务名称 */
  modelName: string;
  /** 监控指标列表 */
  metrics?: string[];
  /** 指标下降告警阈值（相对值，如 0.05 = 5%） */
  alertThreshold?: number;
  /** AB 测试初始流量比例（如 0.05 = 5%） */
  abTestInitialTraffic?: number;
  /** 自动回滚连续失败点数 */
  autoRollbackPoints?: number;
}

export interface AutoMLMonitorOutput {
  /** 8 步 AutoResearch 闭环流程 */
  steps: string[];
  /** 监控配置摘要 */
  config: {
    metrics: string[];
    alertThreshold: number;
    abTestInitialTraffic: number;
    autoRollbackPoints: number;
  };
  /** 输出路径 */
  outputPath: string;
}

export const autoMLMonitorSkill: Skill<AutoMLMonitorInput, AutoMLMonitorOutput> = {
  name: 'algorithm/automl-monitor',
  description: 'AutoResearch 闭环：8 步内外任务并行，线上监控 + 自动优化 + 数据飞轮',
  category: SkillCategory.ALGORITHM,
  tags: ['algorithm', 'ml', 'automl', 'monitor', 'drift', 'ab-test', 'data-flywheel'],
  version: '1.0.0',

  async execute(input: SkillInput<AutoMLMonitorInput>): Promise<SkillOutput<AutoMLMonitorOutput>> {
    const start = Date.now();
    const {
      modelName,
      metrics = ['precision', 'recall', 'F1', 'AUC', 'latency_p99'],
      alertThreshold = 0.05,
      abTestInitialTraffic = 0.05,
      autoRollbackPoints = 3,
    } = input.data as AutoMLMonitorInput;
    const date = new Date().toISOString().slice(0, 10);

    const metricsStr = metrics.join('/');
    const thresholdPct = (alertThreshold * 100).toFixed(0);
    const trafficPct = (abTestInitialTraffic * 100).toFixed(0);

    const steps: string[] = [
      `[Step 1 - 外任务] 线上指标监控 Dashboard：为 ${modelName} 配置实时监控，追踪 ${metricsStr}，按小时/天粒度展示趋势，Dashboard 共享给团队`,
      `[Step 2 - 外任务] 漂移检测：每日计算输入特征分布漂移（PSI > 0.2 告警）和预测分布漂移（KL散度），记录漂移趋势，异常自动写入告警队列`,
      `[Step 3 - 外任务] 告警阈值配置：核心指标相对下降 > ${thresholdPct}% 触发重训练工单，写入 jira/tickets/，抄送相关方，SLA 24h 内响应`,
      `[Step 4 - 内任务] 自动超参搜索：使用 Optuna 搜索空间定义 + TPE 采样，并行运行 N 个 trial，best trial 指标改善 > baseline ${thresholdPct}% 才晋级`,
      `[Step 5 - 内任务] 数据飞轮：收集线上日志 → 高置信预测样本（confidence > 0.95）自动加入候选集 → 人工抽样审核（10% 比例）→ 通过则合入训练集，记录数据量增长`,
      `[Step 6 - 外任务] AB 测试：新模型先承接 ${trafficPct}% 流量，持续观察 48h，${metricsStr} 全面优于 baseline（统计显著 p < 0.05）再扩量至 50% → 100%`,
      `[Step 7 - 外任务] 自动回滚：线上核心指标连续 ${autoRollbackPoints} 个监控点低于告警阈值 → 自动切回上一个稳定版本，发告警通知，保留现场日志供分析`,
      `[Step 8 - 闭环] 迭代复盘报告：每次完整迭代（触发 → 重训 → 上线）后记录：训练数据量变化 / 指标提升 delta / 迭代总耗时 / 数据飞轮贡献量，存入 confluence/memory/ 归档`,
    ];

    const config = {
      metrics,
      alertThreshold,
      abTestInitialTraffic,
      autoRollbackPoints,
    };

    return {
      success: true,
      data: {
        steps,
        config,
        outputPath: `confluence/memory/algo-automl-monitor-${modelName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [
        `AutoML monitor workflow generated for model: ${modelName}`,
        `Alert threshold: ${thresholdPct}%, AB test initial traffic: ${trafficPct}%`,
        `Auto-rollback after ${autoRollbackPoints} consecutive failures`,
      ],
    };
  },

  validateInput(input: unknown): boolean {
    return (
      typeof input === 'object' &&
      input !== null &&
      'data' in input &&
      typeof (input as Record<string, unknown>).data === 'object'
    );
  },
};

export default autoMLMonitorSkill;
