/**
 * EKET Framework - Dependency Audit Skill
 * Version: 1.0.0
 *
 * 依赖安全审计技能：系统化 npm 依赖漏洞扫描与修复
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 依赖审计输入
 */
export interface DependencyAuditInput {
  /** 项目路径 */
  projectPath?: string;
  /** 审计级别 */
  auditLevel?: 'low' | 'moderate' | 'high' | 'critical';
  /** 是否自动修复 patch/minor */
  autoFix?: boolean;
}

/**
 * 依赖审计输出
 */
export interface DependencyAuditOutput {
  /** 执行步骤 */
  steps: Array<{
    index: number;
    title: string;
    description: string;
    commands: string[];
    decision?: string;
  }>;
  /** 升级策略说明 */
  upgradeStrategy: {
    patch: string;
    minor: string;
    major: string;
    cannotUpgrade: string;
  };
  /** 后续行动项 */
  actionItems: string[];
}

/**
 * 依赖安全审计 Skill 实例
 */
export const DependencyAuditSkill: Skill<DependencyAuditInput, DependencyAuditOutput> = {
  name: 'dependency_audit',
  description: 'npm 依赖安全审计：扫描 CVE → 分析直接/间接依赖 → 分级升级策略 → 风险说明 → 锁定提交',
  category: SkillCategory.SECURITY,
  tags: ['security', 'audit', 'dependency', 'npm', 'cve', 'vulnerability'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: [],
    properties: {
      projectPath: { type: 'string', description: '项目路径，默认当前目录' },
      auditLevel: {
        type: 'string',
        enum: ['low', 'moderate', 'high', 'critical'],
        description: '最低告警级别，默认 high',
      },
      autoFix: { type: 'boolean', description: '是否自动修复 patch/minor 版本漏洞' },
    },
  },

  outputSchema: {
    type: 'object',
    required: ['steps', 'upgradeStrategy', 'actionItems'],
  },

  async execute(input: SkillInput<DependencyAuditInput>): Promise<SkillOutput<DependencyAuditOutput>> {
    const startTime = Date.now();
    const auditLevel = input.data.auditLevel ?? 'high';
    const autoFix = input.data.autoFix ?? false;

    const steps = [
      {
        index: 1,
        title: '运行 npm audit --audit-level=high',
        description:
          '对当前项目所有依赖执行安全扫描，获取 CVE 报告。' +
          '输出包含：漏洞数量、严重级别、受影响包名和版本。',
        commands: [
          `npm audit --audit-level=${auditLevel}`,
          'npm audit --json > audit-report.json',
          'cat audit-report.json | jq ".metadata"',
        ],
        decision: '如果 0 vulnerabilities：流程结束，记录扫描通过。否则继续步骤 2。',
      },
      {
        index: 2,
        title: '分析 CVE 报告，区分直接/间接依赖',
        description:
          '直接依赖：package.json dependencies/devDependencies 中明确列出的包。' +
          '间接依赖（传递依赖）：直接依赖引入的依赖。' +
          '直接依赖漏洞由我们直接控制；间接依赖需通过升级直接依赖或使用 overrides 修复。',
        commands: [
          'npm audit --json | jq ".vulnerabilities | to_entries[] | {name: .key, isDirect: .value.isDirect, severity: .value.severity}"',
          'cat package.json | jq ".dependencies, .devDependencies" | grep -f <(npm audit --json | jq -r ".vulnerabilities | keys[]")',
        ],
        decision: '分类列表：直接依赖漏洞列表、间接依赖漏洞列表，分别制定修复策略。',
      },
      {
        index: 3,
        title: '升级策略：patch 自动升，minor 评估，major 单独 PR',
        description:
          'patch（1.0.x）：仅修复 bug，无 API 变更，安全自动升级。' +
          'minor（1.x.0）：新增功能，向后兼容，评估影响后升级。' +
          'major（x.0.0）：可能有 Breaking Change，必须单独 PR，充分测试。',
        commands: [
          autoFix ? 'npm audit fix' : '# autoFix=false，手动执行以下命令',
          'npm audit fix --dry-run',
          '# 仅 patch/minor',
          'npm audit fix',
          '# 包含 major（谨慎使用）',
          'npm audit fix --force',
        ],
        decision: 'patch：直接执行 npm audit fix。minor：评估 CHANGELOG 后升级。major：开新 PR 单独处理。',
      },
      {
        index: 4,
        title: '无法升级的漏洞写风险说明文档',
        description:
          '部分漏洞因版本锁定或 Breaking Change 无法立即修复，需要文档化风险。' +
          '风险说明包含：CVE 编号、影响范围、临时缓解措施、预计修复时间线、负责人。',
        commands: [
          '# 查看无法自动修复的漏洞',
          'npm audit fix --dry-run 2>&1 | grep "manual review"',
          '# 创建风险说明文档',
          'cat > confluence/memory/security-risk-register.md << EOF\n# Security Risk Register\n\n## $(date +%Y-%m-%d)\n\n| CVE | Package | Severity | Reason Cannot Fix | Mitigation | ETA |\n|-----|---------|----------|-------------------|------------|-----|\nEOF',
        ],
        decision: '每条无法修复的漏洞必须有对应的风险说明条目，经安全负责人审批。',
      },
      {
        index: 5,
        title: '锁定 package-lock.json 并提交',
        description:
          '审计修复完成后，重新生成 package-lock.json 并提交到版本控制。' +
          '确保团队所有成员和 CI 环境使用相同依赖版本。' +
          '提交信息标注修复的 CVE 编号，便于追溯。',
        commands: [
          'npm install',
          'git add package.json package-lock.json',
          'git commit -m "security: fix dependency vulnerabilities\n\nFixed CVEs: [列出修复的 CVE 编号]\nRemaining risks: see confluence/memory/security-risk-register.md"',
          'npm audit --audit-level=high',
        ],
        decision: '最终 npm audit 必须 0 high/critical vulnerabilities，否则重复上述流程。',
      },
    ];

    const upgradeStrategy = {
      patch: '自动升级（npm audit fix），无需评估，直接执行',
      minor: '手动评估：阅读 CHANGELOG，运行全量测试后升级',
      major: '单独开 PR，充分测试后合并，需 Tech Lead 审核',
      cannotUpgrade: '文档化风险，制定缓解措施，记录到 confluence/memory/security-risk-register.md',
    };

    const actionItems = [
      '运行 `npm audit --audit-level=high` 获取当前状态',
      '区分直接依赖和间接依赖漏洞',
      '执行 `npm audit fix` 修复可自动修复的漏洞',
      'major 版本升级开单独 PR',
      '无法修复的漏洞写入风险登记册',
      '提交 package-lock.json 锁定版本',
      '在 CI pipeline 中加入 `npm audit --audit-level=high` 检查',
    ];

    return {
      success: true,
      data: {
        steps,
        upgradeStrategy,
        actionItems,
      },
      duration: Date.now() - startTime,
      logs: [
        `[DependencyAudit] 审计级别: ${auditLevel}`,
        `[DependencyAudit] 自动修复: ${autoFix}`,
        `[DependencyAudit] 生成 ${steps.length} 步审计流程`,
      ],
    };
  },
};
