/**
 * EKET Framework - Requirements Analysis Skill
 * Version: 1.0.0
 *
 * 需求分析技能：系统化收集、整理和输出需求规格
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 需求分析输入
 */
export interface RequirementsAnalysisInput {
  /** 项目名称 */
  projectName: string;
  /** 原始需求描述 */
  rawRequirements: string;
  /** 利益相关方列表 */
  stakeholders?: string[];
  /** 业务背景 */
  businessContext?: string;
}

/**
 * 需求分析输出
 */
export interface RequirementsAnalysisOutput {
  /** 执行步骤列表 */
  steps: Array<{
    index: number;
    title: string;
    description: string;
    artifacts: string[];
  }>;
  /** 功能需求列表 */
  functionalRequirements: string[];
  /** 非功能需求列表 */
  nonFunctionalRequirements: string[];
  /** 用户故事模板 */
  userStoryTemplate: string;
  /** 验收标准模板 */
  acceptanceCriteriaTemplate: string;
  /** 输出文档路径 */
  outputDocPath: string;
}

/**
 * 需求分析 Skill 实例
 */
export const RequirementsAnalysisSkill: Skill<RequirementsAnalysisInput, RequirementsAnalysisOutput> = {
  name: 'requirements_analysis',
  description: '系统化需求分析：访谈利益相关方 → 分类需求 → 用户故事 → 验收标准 → 风险识别 → 需求规格文档',
  category: SkillCategory.REQUIREMENTS,
  tags: ['requirements', 'analysis', 'user-story', 'acceptance-criteria'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['projectName', 'rawRequirements'],
    properties: {
      projectName: { type: 'string', description: '项目名称' },
      rawRequirements: { type: 'string', description: '原始需求描述' },
      stakeholders: { type: 'array', items: { type: 'string' }, description: '利益相关方列表' },
      businessContext: { type: 'string', description: '业务背景' },
    },
  },

  outputSchema: {
    type: 'object',
    required: ['steps', 'functionalRequirements', 'nonFunctionalRequirements', 'outputDocPath'],
  },

  async execute(input: SkillInput<RequirementsAnalysisInput>): Promise<SkillOutput<RequirementsAnalysisOutput>> {
    const startTime = Date.now();

    const steps = [
      {
        index: 1,
        title: '访谈利益相关方，收集原始需求',
        description:
          '与产品经理、业务方、最终用户进行结构化访谈，使用开放式问题挖掘真实痛点。' +
          '记录所有原始诉求，不做过滤，确保完整性。',
        artifacts: ['访谈记录.md', '原始需求列表.md'],
      },
      {
        index: 2,
        title: '区分功能需求 vs 非功能需求',
        description:
          '功能需求（FR）：系统必须做什么（功能、行为）。' +
          '非功能需求（NFR）：系统必须满足什么约束（性能、安全、可用性、可维护性）。' +
          '两类需求分别建档，优先级独立评估。',
        artifacts: ['functional-requirements.md', 'non-functional-requirements.md'],
      },
      {
        index: 3,
        title: '编写用户故事（As a... I want... So that...）',
        description:
          '每条功能需求转化为标准用户故事格式：' +
          '"As a [角色], I want [功能], So that [价值/目的]"。' +
          '用户故事粒度：1 个迭代内可完成，可独立交付业务价值。',
        artifacts: ['user-stories.md'],
      },
      {
        index: 4,
        title: '定义验收标准（Given/When/Then）',
        description:
          '每个用户故事配套 1-N 条验收标准，采用 BDD 格式：' +
          '"Given [前置条件], When [操作], Then [预期结果]"。' +
          '验收标准必须可测试、可自动化验证。',
        artifacts: ['acceptance-criteria.md'],
      },
      {
        index: 5,
        title: '识别风险和依赖',
        description:
          '技术风险：未验证技术方案、第三方依赖、性能瓶颈。' +
          '业务风险：需求模糊、利益相关方冲突、范围蔓延。' +
          '依赖关系：外部系统、团队协作、数据迁移。' +
          '每条风险标注严重度（高/中/低）和缓解措施。',
        artifacts: ['risk-register.md', 'dependency-map.md'],
      },
      {
        index: 6,
        title: '产出需求规格文档（放 confluence/memory/）',
        description:
          '汇总以上所有产物，生成完整需求规格说明书（SRS）。' +
          '文档包含：概述、范围、术语表、FR 列表、NFR 列表、用户故事、验收标准、风险登记册。' +
          '提交路径：confluence/memory/requirements-spec-{projectName}.md',
        artifacts: [`confluence/memory/requirements-spec-${input.data.projectName}.md`],
      },
    ];

    return {
      success: true,
      data: {
        steps,
        functionalRequirements: [
          '基于原始需求"' + input.data.rawRequirements.substring(0, 50) + '..."提取功能需求',
          '执行步骤 1-2 后自动填充具体功能需求列表',
        ],
        nonFunctionalRequirements: [
          '性能：核心页面响应时间 < 2s（P99）',
          '可用性：SLA ≥ 99.9%',
          '安全：OWASP Top 10 合规',
          '可维护性：代码覆盖率 ≥ 80%',
        ],
        userStoryTemplate: 'As a [角色/用户类型], I want [功能/操作], So that [业务价值/目的]',
        acceptanceCriteriaTemplate: 'Given [系统初始状态/前置条件], When [用户执行操作], Then [系统预期行为/结果]',
        outputDocPath: `confluence/memory/requirements-spec-${input.data.projectName}.md`,
      },
      duration: Date.now() - startTime,
      logs: [
        `[RequirementsAnalysis] 项目: ${input.data.projectName}`,
        `[RequirementsAnalysis] 利益相关方: ${(input.data.stakeholders ?? ['未指定']).join(', ')}`,
        `[RequirementsAnalysis] 生成 ${steps.length} 步分析流程`,
      ],
    };
  },
};
