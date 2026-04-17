/**
 * EKET Framework - Algorithm Skill: Hyperparameter Optimization
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface HyperparameterOptimizationInput {
  /** 模型/实验名称 */
  modelName: string;
  /** 搜索框架（optuna/ray_tune/wandb_sweeps） */
  searchFramework?: string;
  /** 是否启用分布式搜索 */
  distributed?: boolean;
  /** 最大 trial 数 */
  maxTrials?: number;
}

export interface HyperparameterOptimizationOutput {
  /** 6 步超参优化流程 */
  steps: string[];
  /** 关键工具列表 */
  tools: string[];
  /** Checkpoints */
  checkpoints: string[];
  /** 搜索策略决策树 */
  strategyGuide: string[];
  /** 输出路径 */
  outputPath: string;
}

export const hyperparameterOptimizationSkill: Skill<HyperparameterOptimizationInput, HyperparameterOptimizationOutput> = {
  name: 'algorithm/hyperparameter-optimization',
  description: '超参数自动化搜索 — 贝叶斯优化、分布式搜索、Early Stopping',
  category: SkillCategory.DATA,
  tags: ['algorithm', 'ml', 'hyperparameter', 'optuna', 'ray-tune', 'bayesian', 'early-stopping'],
  version: '1.0.0',

  async execute(input: SkillInput<HyperparameterOptimizationInput>): Promise<SkillOutput<HyperparameterOptimizationOutput>> {
    const start = Date.now();
    const {
      modelName,
      searchFramework = 'optuna',
      distributed = false,
      maxTrials = 100,
    } = input.data as HyperparameterOptimizationInput;
    const date = new Date().toISOString().slice(0, 10);

    const steps: string[] = [
      `[Step 1] 搜索空间定义：连续参数用 suggest_float（学习率 log-uniform: 1e-5 ~ 1e-1）；离散参数用 suggest_int（batch_size: 16/32/64/128 步长 16）；类别参数用 suggest_categorical（optimizer: ['adam','adamw','sgd']）；条件参数（如 scheduler 类型决定其子参数）；基于文献/先验知识设置参数范围，避免搜索空间过大（>10个参数时优先分组搜索）`,
      `[Step 2] 搜索策略选择：参数数量 ≤ 3 且计算便宜 → Grid Search；参数数量 4-8 且无先验 → Random Search（预算 20-50 trials 建立基线）；参数数量 >8 或计算昂贵 → Bayesian Optimization（${searchFramework === 'optuna' ? 'Optuna TPE' : searchFramework === 'ray_tune' ? 'Ray Tune BayesOpt' : 'W&B Sweeps Bayes'}）；超大规模（GPU cluster）→ Population-Based Training（PBT）；先用 Random Search 5-10 trials 验证搜索空间合理性再切 Bayesian`,
      `[Step 3] 贝叶斯优化执行（${searchFramework === 'optuna' ? 'Optuna' : searchFramework}）：${searchFramework === 'optuna' ? 'study = optuna.create_study(direction="maximize", sampler=TPESampler(seed=42))；启用 pruner=HyperbandPruner(min_resource=3, reduction_factor=3)；study.optimize(objective, n_trials=' + maxTrials + ', gc_after_trial=True)；' : searchFramework === 'ray_tune' ? 'tune.run() with BayesOptSearch + ConcurrencyLimiter；' : 'W&B sweep config with method: bayes, metric: goal + name；'}每个 trial 记录完整超参组合 + 评估指标 + 训练时长；使用 warm-starting 复用已有 trial 信息加速收敛`,
      `[Step 4] 分布式搜索：${distributed ? 'Ray Tune 分布式 — ray.init(address="auto")，ResourceRequest 指定每 trial 的 CPU/GPU；使用 AsyncHyperBandScheduler 动态分配资源；storage_path 指向共享存储（S3/NFS）确保 checkpoint 可恢复；监控 trial 失败率（>10% 检查资源配置）；' : '单机并行 — Optuna n_jobs=-1 利用全部 CPU；注意内存峰值 = n_jobs × 单 trial 内存；'}设置 timeout（max_seconds=' + (maxTrials * 120) + '）防止无限运行；实现断点恢复（Optuna RDB storage / Ray Tune resume）`,
      `[Step 5] Early Stopping：HyperBand/ASHA 算法 — 按 bracket 分组 trial，每轮淘汰低分的 (1-1/reduction_factor) 比例；min_resource=3（最少训练 epoch 数再评估）；reduction_factor=3（每轮保留 1/3）；避免过早停止的保护：至少完成 min_resource 个 epoch；Optuna 中配置 pruner.should_prune() 在每个 epoch callback 中调用；预期节省计算资源 60-80%`,
      `[Step 6] 最优结果分析：参数重要性分析 — optuna.visualization.plot_param_importances()，识别关键参数（top 3 通常解释 >80% 性能变化）；学习曲线可视化 — 对比 best trial vs median trial 的训练曲线，确认无过拟合；结果复现验证 — 用最优参数 fixed seed=42 重新训练 3 次，验证方差 <1%；更新 configs/best_hparams.yaml，提交到 MLflow/W&B 记录实验谱系`,
    ];

    const tools: string[] = [
      'Optuna (TPE sampler, HyperBand pruner, visualization)',
      distributed ? 'Ray Tune (distributed search, ASHA scheduler)' : 'Optuna n_jobs (single-machine parallel)',
      'W&B Sweeps (experiment tracking + sweep visualization)',
      'MLflow (parameter logging, metric tracking)',
      'optuna-dashboard (real-time optimization visualization)',
      'scikit-learn (cross-validation integration)',
    ];

    const checkpoints: string[] = [
      '⚠️  禁止手动调参进生产：所有超参变更必须通过 HPO pipeline 记录到 MLflow/W&B',
      '⚠️  搜索结果必须复现验证（3次固定seed训练，方差 <1%）后才能确定最优参数',
      '✅  每次搜索前必须用 Random Search 5-10 trials 验证搜索空间合理性',
      '✅  Early Stopping 必须启用，预算紧张时 min_resource 调低但不得低于 3',
      '✅  最优参数及实验谱系（parent study ID）必须记录，支持 audit trail',
    ];

    const strategyGuide: string[] = [
      '参数 ≤ 3 且计算 <1min/trial     → Grid Search',
      '参数 4-8 且无先验知识          → Random Search (20-50 trials 建基线)',
      '参数 >8 或计算 >10min/trial    → Bayesian (Optuna TPE)',
      '多机 GPU cluster 可用          → Ray Tune + ASHA',
      '超大规模 + 在线学习需求         → Population-Based Training (PBT)',
    ];

    return {
      success: true,
      data: {
        steps,
        tools,
        checkpoints,
        strategyGuide,
        outputPath: `confluence/memory/algo-hpo-${modelName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [`HPO workflow generated for: ${modelName} (framework: ${searchFramework}, distributed: ${distributed}, maxTrials: ${maxTrials})`],
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

export default hyperparameterOptimizationSkill;
