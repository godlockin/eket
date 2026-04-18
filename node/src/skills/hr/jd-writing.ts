/**
 * EKET Framework - HR Skill: JD Writing
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface JdWritingInput {
  /** 职位名称 */
  roleName: string;
  /** 用人部门 */
  department?: string;
  /** 汇报关系 */
  reportsTo?: string;
  /** 薪资范围 */
  salaryRange?: string;
}

export interface JdWritingOutput {
  /** 7 步流程说明 */
  steps: string[];
  /** 输出路径建议 */
  outputPath: string;
}

export const jdWritingSkill: Skill<JdWritingInput, JdWritingOutput> = {
  name: 'hr/jd-writing',
  description: '岗位 JD 撰写：7 步结构化流程，确保 JD 精准对齐用人部门需求',
  category: SkillCategory.HR,
  tags: ['hr', 'jd', 'recruiting', 'talent'],
  version: '1.0.0',

  async execute(input: SkillInput<JdWritingInput>): Promise<SkillOutput<JdWritingOutput>> {
    const start = Date.now();
    const { roleName, department = '待确认', outputPath: _op } = input.data as JdWritingInput & { outputPath?: string };
    const date = new Date().toISOString().slice(0, 10);

    const steps: string[] = [
      `[Step 1] 对齐用人部门期望：与 ${department} 负责人 1:1 沟通，明确核心痛点和期望产出`,
      '[Step 2] 提炼核心职责（3-5条，动宾结构）：每条职责以动词开头，描述可衡量的输出',
      '[Step 3] 区分必要/加分技能：必要条件≤5项（硬门槛），加分项≤3项（差异化优势）',
      '[Step 4] 确定薪资范围：完成市场调研（参考 L/M/H 分位）+ 对齐内部 band，写入 JD',
      '[Step 5] 撰写公司文化描述：真实描述团队氛围和工作方式，不夸大、不空洞',
      '[Step 6] 发布前用人部门 review：至少 1 位用人部门负责人确认，修改后存档',
      '[Step 7] 追踪投递转化率：上线 2 周后复盘简历量/面试率，迭代优化 JD 描述',
    ];

    return {
      success: true,
      data: {
        steps,
        outputPath: `confluence/hr/jd-${roleName.toLowerCase().replace(/\s+/g, '-')}-${date}.md`,
      },
      duration: Date.now() - start,
      logs: [`JD writing workflow generated for role: ${roleName}`],
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

export default jdWritingSkill;
