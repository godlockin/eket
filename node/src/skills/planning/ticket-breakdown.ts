/**
 * EKET Framework - Ticket Breakdown Skill
 * Version: 1.0.0
 *
 * 任务拆解技能：Epic → Story → Task，标注依赖和优先级
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * Ticket 拆解输入
 */
export interface TicketBreakdownInput {
  /** Epic 名称 */
  epicName: string;
  /** Epic 目标描述 */
  epicGoal: string;
  /** Epic 边界（范围说明） */
  epicScope?: string;
  /** 迭代周期（天） */
  sprintDays?: number;
}

/**
 * Story 结构
 */
export interface Story {
  id: string;
  title: string;
  description: string;
  tasks: Task[];
}

/**
 * Task 结构
 */
export interface Task {
  id: string;
  title: string;
  estimatedHours: number;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  blockedBy: string[];
  acceptanceCommand: string;
}

/**
 * Ticket 拆解输出
 */
export interface TicketBreakdownOutput {
  /** 执行步骤列表 */
  steps: Array<{
    index: number;
    title: string;
    description: string;
    rules: string[];
  }>;
  /** 拆解模板（Stories + Tasks 示例） */
  breakdownTemplate: {
    stories: Story[];
  };
  /** 优先级说明 */
  priorityGuide: Record<string, string>;
}

/**
 * Ticket 拆解 Skill 实例
 */
export const TicketBreakdownSkill: Skill<TicketBreakdownInput, TicketBreakdownOutput> = {
  name: 'ticket_breakdown',
  description: 'Epic → Story → Task 拆解：理解边界 → 分 Story → 拆 Task → 标依赖 → 设优先级 → 写验收命令',
  category: SkillCategory.PLANNING,
  tags: ['planning', 'breakdown', 'ticket', 'sprint', 'epic', 'story', 'task'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['epicName', 'epicGoal'],
    properties: {
      epicName: { type: 'string', description: 'Epic 名称' },
      epicGoal: { type: 'string', description: 'Epic 目标描述' },
      epicScope: { type: 'string', description: 'Epic 边界/范围说明' },
      sprintDays: { type: 'number', description: '迭代周期（天），默认 14' },
    },
  },

  outputSchema: {
    type: 'object',
    required: ['steps', 'breakdownTemplate', 'priorityGuide'],
  },

  async execute(input: SkillInput<TicketBreakdownInput>): Promise<SkillOutput<TicketBreakdownOutput>> {
    const startTime = Date.now();
    const sprintDays = input.data.sprintDays ?? 14;

    const steps = [
      {
        index: 1,
        title: '理解 Epic 目标和边界',
        description:
          '明确 Epic 的业务价值和完成定义（Definition of Done）。' +
          '识别"在范围内"和"不在范围内"的功能，防止范围蔓延。',
        rules: [
          'Epic 必须有明确的成功指标（可量化）',
          '边界外的需求记录到 backlog，不纳入当前 Epic',
          '与 Product Owner 对齐 Epic 的商业优先级',
        ],
      },
      {
        index: 2,
        title: '拆分为 Story（用户可感知的功能单元）',
        description:
          '每个 Story 代表一个用户可感知的完整功能，遵循 INVEST 原则：' +
          'Independent（独立）、Negotiable（可协商）、Valuable（有价值）、' +
          'Estimable（可估算）、Small（小）、Testable（可测试）。',
        rules: [
          'Story 必须能在 1 个迭代内完成',
          'Story 必须能独立交付，不依赖其他未完成 Story',
          '粒度：1 个用户行为流程 = 1 个 Story',
        ],
      },
      {
        index: 3,
        title: 'Story → Task（2-8h 可完成的工程任务）',
        description:
          '每个 Story 拆分为具体的工程 Task，每个 Task：' +
          '估算工时在 2-8 小时内（超过则继续拆分），' +
          '有明确的技术产出（代码文件/配置/文档），' +
          '可被一名工程师独立完成。',
        rules: [
          'Task 工时 < 2h：过细，考虑合并',
          'Task 工时 > 8h：过粗，必须继续拆分',
          '每个 Task 有且仅有一个负责人',
        ],
      },
      {
        index: 4,
        title: '标注 blocked_by 依赖关系',
        description:
          '识别 Task 之间的依赖：A 依赖 B 则 A.blocked_by = [B.id]。' +
          '依赖链不得有循环（DAG 拓扑排序验证）。' +
          '关键路径上的 Task 优先安排。',
        rules: [
          '依赖关系只能向前（无循环依赖）',
          '跨团队依赖提前 1 个 sprint 沟通确认',
          '外部依赖（第三方 API）标注为 EXTERNAL_DEPENDENCY',
        ],
      },
      {
        index: 5,
        title: '设置优先级（P0/P1/P2/P3）',
        description:
          'P0：阻塞发布，必须本迭代完成。' +
          'P1：核心功能，尽力本迭代完成。' +
          'P2：增强功能，可顺延至下一迭代。' +
          'P3：Nice-to-have，进入 backlog。',
        rules: [
          'P0 数量 ≤ 迭代总容量的 30%',
          '优先级由 Product Owner 最终确认',
          '技术债务 Task 默认 P2，除非影响稳定性',
        ],
      },
      {
        index: 6,
        title: '每张 ticket 必须有可执行的验收命令',
        description:
          '验收命令是可在终端直接运行的命令，执行后输出明确的通过/失败信号。' +
          '示例：`npm test -- --testPathPattern=auth`，`curl -f http://localhost:3000/health`。' +
          '禁止模糊验收标准如"功能正常"、"UI 美观"。',
        rules: [
          '验收命令必须是幂等的（多次执行结果一致）',
          '验收命令在 CI 环境中必须可运行',
          '复杂验收逻辑封装为 npm scripts',
        ],
      },
    ];

    const priorityGuide: Record<string, string> = {
      P0: '阻塞发布 / 核心链路中断 / 安全漏洞 — 必须本迭代完成',
      P1: '重要功能 / 影响主流程 — 尽力本迭代完成',
      P2: '增强功能 / 优化体验 — 可顺延至下一迭代',
      P3: 'Nice-to-have / 技术探索 — 进入 backlog',
    };

    const breakdownTemplate: TicketBreakdownOutput['breakdownTemplate'] = {
      stories: [
        {
          id: 'STORY-001',
          title: `[${input.data.epicName}] 示例 Story`,
          description: `实现 ${input.data.epicGoal} 的核心功能`,
          tasks: [
            {
              id: 'TASK-001',
              title: '数据库 Schema 设计与迁移',
              estimatedHours: 4,
              priority: 'P0',
              blockedBy: [],
              acceptanceCommand: 'npm run db:migrate && npm run db:verify',
            },
            {
              id: 'TASK-002',
              title: '业务逻辑层实现',
              estimatedHours: 6,
              priority: 'P0',
              blockedBy: ['TASK-001'],
              acceptanceCommand: 'npm test -- --testPathPattern=business-logic',
            },
            {
              id: 'TASK-003',
              title: 'API 接口实现与集成测试',
              estimatedHours: 4,
              priority: 'P1',
              blockedBy: ['TASK-002'],
              acceptanceCommand: 'npm run test:integration -- --grep "API"',
            },
          ],
        },
      ],
    };

    return {
      success: true,
      data: {
        steps,
        breakdownTemplate,
        priorityGuide,
      },
      duration: Date.now() - startTime,
      logs: [
        `[TicketBreakdown] Epic: ${input.data.epicName}`,
        `[TicketBreakdown] 迭代周期: ${sprintDays} 天`,
        `[TicketBreakdown] 生成 ${steps.length} 步拆解流程`,
      ],
    };
  },
};
