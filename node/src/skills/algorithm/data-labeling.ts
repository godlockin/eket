/**
 * EKET Framework - Algorithm Skill: Data Labeling
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface DataLabelingInput {
  /** 数据集名称 */
  datasetName: string;
  /** 任务类型（分类/NER/图像分割等） */
  taskType?: string;
  /** 标注人数 */
  annotatorCount?: number;
}

export interface DataLabelingOutput {
  /** 7 步标注流程 */
  steps: string[];
  /** 标注质量报告输出路径 */
  outputPath: string;
}

export const dataLabelingSkill: Skill<DataLabelingInput, DataLabelingOutput> = {
  name: 'algorithm/data-labeling',
  description: '数据打标：7 步严谨流程，确保标注质量、一致性与可追溯性',
  category: SkillCategory.ALGORITHM,
  tags: ['algorithm', 'ml', 'labeling', 'annotation', 'data'],
  version: '1.0.0',

  async execute(input: SkillInput<DataLabelingInput>): Promise<SkillOutput<DataLabelingOutput>> {
    const start = Date.now();
    const {
      datasetName,
      taskType = '分类/NER/目标检测',
      annotatorCount = 2,
    } = input.data as DataLabelingInput;
    const date = new Date().toISOString().slice(0, 10);

    const steps: string[] = [
      `[Step 1] 定义标注规范：针对 ${taskType} 任务编写 label taxonomy，明确类别定义、边界案例说明文档，输出 label-guide.md`,
      `[Step 2] 工具选型：根据数据量和任务类型选择标注工具（Label Studio / Labelbox / 自建），配置标注界面和快捷键`,
      `[Step 3] 标注员培训：提供标注示例（每类 ≥ 10 个正负样本），进行考核（准确率 ≥ 90% 才可上岗），记录培训记录`,
      `[Step 4] 双人标注 + 一致性校验：${annotatorCount} 人独立标注同一批样本，计算 Cohen's kappa，kappa ≥ 0.8 为合格，不足则补充培训`,
      '[Step 5] 难样本仲裁：kappa < 0.8 的样本或标注员意见分歧样本，送领域专家仲裁，记录仲裁决策和依据',
      `[Step 6] 数据集版本化：对已标注数据集计算 SHA256 哈希，使用 DVC 记录版本，标注结果存入 data/labeled/${datasetName}-v1/`,
      '[Step 7] 标注质量报告：输出类别分布统计、kappa 系数、标注员一致性矩阵、难样本比例，存入 confluence/memory/ 归档',
    ];

    return {
      success: true,
      data: {
        steps,
        outputPath: `confluence/memory/algo-labeling-${datasetName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [`Data labeling workflow generated for dataset: ${datasetName}`],
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

export default dataLabelingSkill;
