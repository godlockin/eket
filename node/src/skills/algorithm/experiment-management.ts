/**
 * EKET Framework - Algorithm Skill: Experiment Management
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface ExperimentManagementInput {
  /** 模型名称 */
  modelName: string;
  /** 数据集名称 */
  datasetName: string;
  /** 实验描述（简短） */
  description?: string;
}

export interface ExperimentManagementOutput {
  /** 6 步实验管理流程 */
  steps: string[];
  /** 实验命名 */
  experimentName: string;
  /** 输出路径 */
  outputPath: string;
}

export const experimentManagementSkill: Skill<ExperimentManagementInput, ExperimentManagementOutput> = {
  name: 'algorithm/experiment-management',
  description: '实验管理：6 步规范流程，确保实验可追溯、可对比、结论有依据',
  category: SkillCategory.ALGORITHM,
  tags: ['algorithm', 'ml', 'experiment', 'mlflow', 'wandb', 'tracking'],
  version: '1.0.0',

  async execute(input: SkillInput<ExperimentManagementInput>): Promise<SkillOutput<ExperimentManagementOutput>> {
    const start = Date.now();
    const {
      modelName,
      datasetName,
      description = 'exp',
    } = input.data as ExperimentManagementInput;
    const date = new Date().toISOString().slice(0, 10);

    const experimentName = `${modelName.toLowerCase()}-${datasetName.toLowerCase()}-${date}-${description.toLowerCase().replace(/\s+/g, '-')}`;

    const steps: string[] = [
      `[Step 1] 实验命名规范：使用格式 {model}-{dataset}-{date}-{desc}，本次实验名：${experimentName}，在 MLflow/W&B 中创建对应 run`,
      '[Step 2] 超参全量记录：记录所有超参（含默认值），包括 lr/batch_size/epochs/optimizer/scheduler/dropout 等，禁止省略"未改动"的超参',
      '[Step 3] 指标分组记录：train/val/test 指标分开记录，每 epoch 打点，含 loss/accuracy/F1/AUC，best checkpoint 额外标注',
      '[Step 4] Artifact 管理：保存模型权重（best + last）、训练配置文件（config.yaml）、数据集哈希（dataset.lock），上传到 MLflow artifact store',
      '[Step 5] 对比实验规范：单一变量原则，与 baseline 对比时只改一个因素，结果以 delta（绝对值 + 相对值）汇报，正负面结果均记录',
      '[Step 6] 实验报告：包含背景/假设/数据集描述/实验配置/结果表格/错误分析/结论/下一步建议，存入 confluence/memory/ 归档',
    ];

    return {
      success: true,
      data: {
        steps,
        experimentName,
        outputPath: `confluence/memory/algo-experiment-${experimentName}.md`,
      },
      duration: Date.now() - start,
      logs: [`Experiment management workflow generated: ${experimentName}`],
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

export default experimentManagementSkill;
