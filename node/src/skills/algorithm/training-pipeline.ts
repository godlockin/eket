/**
 * EKET Framework - Algorithm Skill: Training Pipeline
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface TrainingPipelineInput {
  /** 模型/项目名称 */
  modelName: string;
  /** 框架（PyTorch/TensorFlow/JAX 等） */
  framework?: string;
  /** 是否启用混合精度 */
  mixedPrecision?: boolean;
}

export interface TrainingPipelineOutput {
  /** 7 步训练代码编写流程 */
  steps: string[];
  /** 项目结构说明 */
  projectStructure: string[];
  /** 输出路径 */
  outputPath: string;
}

export const trainingPipelineSkill: Skill<TrainingPipelineInput, TrainingPipelineOutput> = {
  name: 'algorithm/training-pipeline',
  description: '训练代码编写：7 步规范流程，确保代码模块化、可复现、有完整实验追踪',
  category: SkillCategory.ALGORITHM,
  tags: ['algorithm', 'ml', 'training', 'pipeline', 'experiment'],
  version: '1.0.0',

  async execute(input: SkillInput<TrainingPipelineInput>): Promise<SkillOutput<TrainingPipelineOutput>> {
    const start = Date.now();
    const {
      modelName,
      framework = 'PyTorch',
      mixedPrecision = true,
    } = input.data as TrainingPipelineInput;
    const date = new Date().toISOString().slice(0, 10);

    const projectStructure: string[] = [
      `${modelName}/`,
      '├── data/           # 数据集（DVC 管理，不入 git）',
      '├── model/          # 模型定义（base_model.py + 变体）',
      '├── trainer/        # 训练循环（trainer.py）',
      '├── eval/           # 评估逻辑（evaluator.py）',
      '├── scripts/        # 启动脚本（train.sh / eval.sh）',
      '├── configs/        # 超参配置（yaml）',
      '└── tests/          # 单元测试',
    ];

    const steps: string[] = [
      `[Step 1] 项目结构规范：按 data/model/trainer/eval/scripts/ 目录组织，README 说明运行方式，configs/ 存放所有超参 yaml`,
      `[Step 2] 数据加载器：实现支持增量加载、流式处理、多进程 DataLoader，含数据增强开关，记录数据集哈希确保版本一致`,
      `[Step 3] 模型定义：基类 + 可配置超参（通过 config yaml 注入），支持从 checkpoint 恢复，forward() 有类型注解`,
      `[Step 4] 训练循环：梯度裁剪（max_norm=1.0）、${mixedPrecision ? '混合精度（torch.cuda.amp）' : '全精度'}、每 N step 保存 checkpoint，支持断点续训`,
      `[Step 5] 实验跟踪：使用 MLflow/W&B 记录全量超参（含默认值）、每 epoch train/val loss、最优 checkpoint artifact，实验名格式 ${modelName}-{dataset}-${date}`,
      '[Step 6] 单元测试：测试 data_loader（shape/dtype/range）、forward pass（输出 shape）、loss 计算（数值范围），CI 必须全绿',
      `[Step 7] 可复现验证：固定 random_seed=42，torch.backends.cudnn.deterministic=True，相同 seed 两次运行结果误差 < 1e-5，记录验证结果`,
    ];

    return {
      success: true,
      data: {
        steps,
        projectStructure,
        outputPath: `confluence/memory/algo-training-${modelName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [`Training pipeline workflow generated for model: ${modelName} (${framework})`],
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

export default trainingPipelineSkill;
