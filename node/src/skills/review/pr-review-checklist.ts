/**
 * EKET Framework - PR Review Checklist Skill
 * Version: 1.0.0
 *
 * PR 审查清单技能：7 步系统化代码审查
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * PR 审查输入
 */
export interface PRReviewInput {
  /** PR 编号 */
  prNumber: string;
  /** PR 标题 */
  prTitle: string;
  /** PR 描述 */
  prDescription?: string;
  /** 变更文件列表 */
  changedFiles?: string[];
  /** 仓库名称 */
  repoName?: string;
}

/**
 * 审查结果项
 */
export interface ReviewCheckItem {
  index: number;
  category: string;
  title: string;
  description: string;
  checkPoints: string[];
  commands?: string[];
  status: 'pending' | 'pass' | 'fail' | 'skip';
  severity: 'blocking' | 'warning' | 'info';
}

/**
 * PR 审查输出
 */
export interface PRReviewOutput {
  /** 审查清单 */
  checklist: ReviewCheckItem[];
  /** 审查命令汇总 */
  verificationCommands: string[];
  /** 快速拒绝条件（任一满足则 Request Changes） */
  autoRejectConditions: string[];
}

/**
 * PR 审查清单 Skill 实例
 */
export const PRReviewChecklistSkill: Skill<PRReviewInput, PRReviewOutput> = {
  name: 'pr_review_checklist',
  description: 'PR 系统化审查：类型安全 → 测试覆盖 → 构建 → 全量测试 → 安全 → 文档 → PR 描述完整性',
  category: SkillCategory.TESTING,
  tags: ['review', 'pr', 'checklist', 'quality', 'security', 'ci'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['prNumber', 'prTitle'],
    properties: {
      prNumber: { type: 'string', description: 'PR 编号' },
      prTitle: { type: 'string', description: 'PR 标题' },
      prDescription: { type: 'string', description: 'PR 描述' },
      changedFiles: { type: 'array', items: { type: 'string' }, description: '变更文件列表' },
      repoName: { type: 'string', description: '仓库名称' },
    },
  },

  outputSchema: {
    type: 'object',
    required: ['checklist', 'verificationCommands', 'autoRejectConditions'],
  },

  async execute(input: SkillInput<PRReviewInput>): Promise<SkillOutput<PRReviewOutput>> {
    const startTime = Date.now();

    const checklist: ReviewCheckItem[] = [
      {
        index: 1,
        category: 'type-safety',
        title: '类型安全检查（无 any / @ts-ignore）',
        description: '确保代码无类型绕过，维护编译时类型安全保障。',
        checkPoints: [
          '无 `any` 类型声明（包括隐式 any）',
          '无 `@ts-ignore` / `@ts-expect-error` 注释',
          '所有外部输入（API 响应、用户输入）有明确类型定义',
          '错误处理使用 `unknown` 而非 `any`',
          'strict mode 已启用（tsconfig.json）',
        ],
        commands: [
          'grep -rn "any" src/ --include="*.ts" | grep -v "// ok:"',
          'grep -rn "@ts-ignore\\|@ts-expect-error" src/ --include="*.ts"',
          'npm run build 2>&1 | grep -i "error"',
        ],
        status: 'pending',
        severity: 'blocking',
      },
      {
        index: 2,
        category: 'test-coverage',
        title: '测试覆盖（新增功能有对应测试）',
        description: '每个新增功能、边界条件、错误路径都有对应的自动化测试。',
        checkPoints: [
          '新增功能有对应的单元测试',
          '关键业务逻辑有集成测试',
          '边界条件（空值、极值、错误输入）有测试覆盖',
          '整体覆盖率不低于变更前',
          '测试命名清晰，能反映测试意图',
        ],
        commands: [
          'npm test -- --coverage 2>&1 | tail -20',
          'npm test -- --coverage --coverageThreshold=\'{"global":{"lines":80}}\'',
        ],
        status: 'pending',
        severity: 'blocking',
      },
      {
        index: 3,
        category: 'build',
        title: '构建通过（npm run build 0 error）',
        description: '代码在目标环境可以无错误编译构建。',
        checkPoints: [
          'npm run build 输出 0 errors',
          '无新增 warnings（warning 是未来的 error）',
          '构建产物大小无异常增长（> 20% 需说明原因）',
          '所有平台（Node 版本）构建通过',
        ],
        commands: [
          'npm run build 2>&1',
          'npm run build 2>&1 | grep -c "error" || echo "0 errors"',
        ],
        status: 'pending',
        severity: 'blocking',
      },
      {
        index: 4,
        category: 'full-test',
        title: '全量测试通过（npm test 无新增失败）',
        description: '所有现有测试在合并后仍然通过，无回归。',
        checkPoints: [
          'npm test 全量运行通过',
          '与 main/master 基线对比无新增失败用例',
          '跳过的测试（.skip）有注释说明原因',
          '异步测试无超时或 flaky 情况',
        ],
        commands: [
          'npm test 2>&1 | tail -20',
          'npm test 2>&1 | grep -E "FAIL|PASS|Tests:"',
        ],
        status: 'pending',
        severity: 'blocking',
      },
      {
        index: 5,
        category: 'security',
        title: '安全检查（无硬编码密钥，无明显注入风险）',
        description: '代码无安全漏洞，敏感信息通过环境变量管理。',
        checkPoints: [
          '无硬编码 API Key、密码、Token、Secret',
          '无 SQL 注入风险（使用参数化查询）',
          '无 XSS 风险（用户输入已转义）',
          '无路径穿越漏洞（文件操作使用白名单路径）',
          'npm audit 无 high/critical 级别漏洞',
          '新增依赖已评估安全性',
        ],
        commands: [
          'grep -rn "password\\|secret\\|api_key\\|apikey" src/ --include="*.ts" -i | grep -v ".env\\|process.env"',
          'npm audit --audit-level=high 2>&1',
        ],
        status: 'pending',
        severity: 'blocking',
      },
      {
        index: 6,
        category: 'documentation',
        title: '文档更新（README / CHANGELOG 同步）',
        description: '外部可见的变更（API、配置、部署）有对应文档更新。',
        checkPoints: [
          '新增 API 接口在 README 或 API 文档中有说明',
          '新增环境变量在 .env.example 中有示例和注释',
          'CHANGELOG.md 有对应变更记录（如果项目维护 CHANGELOG）',
          '重大变更（Breaking Change）在 PR 描述中明确标注',
          '删除的功能从文档中移除',
        ],
        commands: [
          'git diff --name-only | grep -E "README|CHANGELOG|docs/"',
        ],
        status: 'pending',
        severity: 'warning',
      },
      {
        index: 7,
        category: 'pr-description',
        title: 'PR 描述完整（变更说明 + 测试计划）',
        description: 'PR 描述提供足够上下文，让 Reviewer 能高效审查。',
        checkPoints: [
          'PR 标题清晰描述变更类型和内容（feat/fix/chore/refactor）',
          'PR 描述包含：背景/动机、变更内容、测试计划',
          '关联 Ticket/Issue（closes #xxx）',
          '如有 UI 变更，附截图或录屏',
          '如有 Breaking Change，标注迁移指南',
          'Self-Review 已完成（不提交明显低质量代码）',
        ],
        commands: [],
        status: 'pending',
        severity: 'warning',
      },
    ];

    const verificationCommands = [
      '# 1. 类型检查',
      'npm run build',
      '',
      '# 2. 全量测试',
      'npm test',
      '',
      '# 3. 安全扫描',
      'npm audit --audit-level=high',
      '',
      '# 4. 硬编码检查',
      'grep -rn "password\\|secret\\|api_key" src/ --include="*.ts" -i | grep -v ".env\\|process.env"',
    ];

    const autoRejectConditions = [
      'npm run build 有 TypeScript 错误',
      'npm test 有新增失败用例（相比 main 分支）',
      '检测到硬编码密钥或凭证',
      'npm audit 有 critical 级别漏洞',
      'PR 描述为空或无意义',
    ];

    return {
      success: true,
      data: {
        checklist,
        verificationCommands,
        autoRejectConditions,
      },
      duration: Date.now() - startTime,
      logs: [
        `[PRReviewChecklist] PR: #${input.data.prNumber} - ${input.data.prTitle}`,
        `[PRReviewChecklist] 生成 ${checklist.length} 项审查清单`,
        `[PRReviewChecklist] Blocking 项: ${checklist.filter(c => c.severity === 'blocking').length}`,
      ],
    };
  },
};
