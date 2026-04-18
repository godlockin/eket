/**
 * EKET Framework - Algorithm Skill: Model Evaluation
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ModelEvaluationInput {
  /** 模型/实验名称 */
  modelName: string;
  /** 任务类型 */
  taskType?: string;
  /** 数据集描述 */
  datasetDescription?: string;
}

export interface ModelEvaluationOutput {
  /** 6 步评估流程 */
  steps: string[];
  /** 实验记录输出路径 */
  outputPath: string;
}

export const modelEvaluationSkill: Skill<ModelEvaluationInput, ModelEvaluationOutput> = {
  name: 'algorithm/model-evaluation',
  description: '模型评估：6 步严谨流程，确保实验可复现、结论有统计依据',
  category: SkillCategory.ALGORITHM,
  tags: ['algorithm', 'ml', 'evaluation', 'experiment'],
  version: '1.0.0',

  async execute(input: SkillInput<ModelEvaluationInput>): Promise<SkillOutput<ModelEvaluationOutput>> {
    const start = Date.now();
    const { modelName, taskType = '分类/回归/排序' } = input.data as ModelEvaluationInput;
    const date = new Date().toISOString().slice(0, 10);

    const steps: string[] = [
      `[Step 1] 确定业务指标：根据 ${taskType} 任务选择核心指标（precision/recall/F1/AUC/NDCG 等），明确优化目标`,
      '[Step 2] 准备 holdout 测试集：与训练集严格时间/空间隔离，固定随机种子，锁定数据集版本',
      '[Step 3] 建立 baseline：实现规则 baseline 或简单模型（LR/决策树），作为对比基准',
      '[Step 4] 设计对比实验：单一变量原则，每次只改变一个因素，记录所有超参数',
      '[Step 5] 统计显著性检验：使用 t-test 或 bootstrap 检验结果差异，置信度 ≥ 95%',
      '[Step 6] 产出评估报告：含数据集描述 / 指标表格 / 错误分析 / 结论与下一步建议',
    ];

    return {
      success: true,
      data: {
        steps,
        outputPath: `confluence/memory/algo-experiment-${modelName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [`Model evaluation workflow generated for: ${modelName}`],
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

export default modelEvaluationSkill;
