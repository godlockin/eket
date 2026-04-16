/**
 * EKET Framework - Incident Runbook Skill
 * Version: 1.0.0
 *
 * 故障响应手册技能：告警触发 → 影响评估 → 应急处置 → 根因分析 → 修复上线 → Postmortem
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 故障响应输入
 */
export interface IncidentRunbookInput {
  /** 服务名称 */
  serviceName: string;
  /** 告警类型 */
  alertType?: string;
  /** 严重级别 */
  severity?: 'P1' | 'P2' | 'P3' | 'P4';
  /** 当前值班人员 */
  oncallEngineer?: string;
}

/**
 * 故障响应步骤
 */
export interface IncidentStep {
  index: number;
  title: string;
  description: string;
  actions: string[];
  commands?: string[];
  decisionPoints?: string[];
  timeTarget?: string;
}

/**
 * 故障响应输出
 */
export interface IncidentRunbookOutput {
  /** 响应步骤 */
  steps: IncidentStep[];
  /** 严重级别定义 */
  severityDefinition: Record<string, { description: string; responseTime: string; escalation: string }>;
  /** Postmortem 模板 */
  postmortemTemplate: string;
  /** 常用诊断命令 */
  diagnosticCommands: string[];
}

/**
 * 故障响应手册 Skill 实例
 */
export const IncidentRunbookSkill: Skill<IncidentRunbookInput, IncidentRunbookOutput> = {
  name: 'incident_runbook',
  description: '故障响应手册：告警确认 → 影响评估 → 应急处置 → 根因分析 → 修复上线 → Postmortem',
  category: SkillCategory.DEVOPS,
  tags: ['ops', 'incident', 'runbook', 'postmortem', 'sre', 'on-call'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['serviceName'],
    properties: {
      serviceName: { type: 'string', description: '服务名称' },
      alertType: { type: 'string', description: '告警类型' },
      severity: { type: 'string', enum: ['P1', 'P2', 'P3', 'P4'], description: '严重级别' },
      oncallEngineer: { type: 'string', description: '当前值班人员' },
    },
  },

  outputSchema: {
    type: 'object',
    required: ['steps', 'severityDefinition', 'postmortemTemplate', 'diagnosticCommands'],
  },

  async execute(input: SkillInput<IncidentRunbookInput>): Promise<SkillOutput<IncidentRunbookOutput>> {
    const startTime = Date.now();
    const { serviceName, severity = 'P2', oncallEngineer = '值班工程师' } = input.data;

    const steps: IncidentStep[] = [
      {
        index: 1,
        title: '告警触发：确认告警类型和影响范围',
        description:
          '收到告警后，第一件事是确认告警的真实性和范围，避免误报浪费资源。',
        actions: [
          '确认告警来源（监控系统/用户反馈/自动检测）',
          '验证告警真实性（非误报/测试告警）',
          '确认告警类型：服务不可用/性能劣化/数据异常/安全事件',
          '查看告警历史：是否是已知问题的复现',
          `在 #incident 频道发布：[${severity}] ${serviceName} - ${input.data.alertType ?? '告警类型待确认'} - 调查中 @${oncallEngineer}`,
          '创建 Incident Ticket，记录开始时间',
        ],
        commands: [
          `# 检查服务健康状态`,
          `curl -f http://${serviceName}/health || echo "服务不可达"`,
          `# 查看最近错误日志`,
          `kubectl logs -l app=${serviceName} --since=15m | grep -i "error\\|fatal" | tail -50`,
          `# 查看告警面板`,
          `open https://grafana.internal/d/${serviceName}-overview`,
        ],
        timeTarget: '5 分钟内完成确认',
      },
      {
        index: 2,
        title: '影响评估：受影响用户数 / 核心功能是否可用',
        description:
          '量化影响范围，确定 Incident 严重级别，决定是否需要升级。',
        actions: [
          '统计受影响用户数/请求数（查 APM 或日志）',
          '判断核心功能是否可用（主流程是否可走通）',
          '确认数据一致性是否受影响（有无数据损坏风险）',
          '评估收入/SLA 影响',
          '如果影响升级（如 P3 → P1），立即升级 Incident 级别',
          '如需升级通知，联系 Engineering Manager 和产品负责人',
        ],
        commands: [
          '# 查看错误率',
          'kubectl top pods -l app=' + serviceName,
          '# 查看 5xx 错误率（过去 15 分钟）',
          `# Prometheus 查询: rate(http_requests_total{service="${serviceName}",status=~"5.."}[5m])`,
        ],
        timeTarget: '10 分钟内完成评估',
        decisionPoints: [
          '用户影响 > 10%：升级为 P1，立即召集 War Room',
          '核心功能不可用：升级为 P1',
          '数据损坏风险：立即升级，暂停写入操作',
        ],
      },
      {
        index: 3,
        title: '应急处置：降级/回滚/限流（最快恢复业务）',
        description:
          '第一优先级是恢复业务，根因分析是第二步。宁可降级提供部分服务，不要让用户等待完整修复。',
        actions: [
          '降级策略：关闭非核心功能，保证主流程可用',
          '回滚策略：确认上次部署时间，评估回滚可行性',
          '限流策略：降低流量压力，保护核心服务',
          '扩容策略：如果是容量问题，临时扩容',
          '缓存策略：启用兜底缓存，减少后端压力',
          '执行应急操作，每个操作后验证效果',
        ],
        commands: [
          '# 快速回滚到上一个版本',
          `kubectl rollout undo deployment/${serviceName}`,
          `kubectl rollout status deployment/${serviceName}`,
          '# 临时扩容',
          `kubectl scale deployment/${serviceName} --replicas=10`,
          '# 开启降级开关（假设有 Feature Flag）',
          `curl -X POST https://feature-flags.internal/api/flags/${serviceName}_degraded_mode -d \'{"enabled":true}\'`,
        ],
        timeTarget: '20 分钟内完成应急处置，业务恢复',
        decisionPoints: [
          '回滚前确认：上个版本是否没有此问题？回滚是否会影响数据迁移？',
          '扩容前确认：是否是容量问题？扩容是否能解决根因？',
        ],
      },
      {
        index: 4,
        title: '根因分析：查日志/指标/链路追踪',
        description:
          '在业务恢复后，系统化分析故障根因，为永久修复提供依据。',
        actions: [
          '时间线梳理：故障最早出现时间（非告警时间）',
          '变更排查：故障时间点前后的代码/配置/基础设施变更',
          '日志分析：错误日志 → 堆栈跟踪 → 定位代码行',
          '指标分析：CPU/内存/连接池/GC → 识别资源瓶颈',
          '链路追踪：分布式 Trace 找到慢节点/失败节点',
          '提出根因假设并验证（在测试环境复现）',
        ],
        commands: [
          '# 查看故障时段的完整日志',
          `kubectl logs -l app=${serviceName} --since=2h > /tmp/${serviceName}-incident.log`,
          'grep -A 20 "ERROR\\|FATAL\\|panic" /tmp/' + serviceName + '-incident.log | head -200',
          '# 查看 Events（K8s 事件）',
          `kubectl get events --field-selector involvedObject.name=${serviceName} --sort-by=.lastTimestamp`,
        ],
        timeTarget: '1 小时内完成初步根因分析',
      },
      {
        index: 5,
        title: '修复上线：Hotfix PR → 快速 Review → 部署',
        description:
          '根因确认后，走紧急修复流程，比正常 PR 流程更快但不跳过关键检查。',
        actions: [
          '基于 main 分支创建 hotfix 分支：`git checkout -b hotfix/incident-xxxx`',
          '最小化改动：只修复根因，不做无关重构',
          '本地验证：在测试环境复现问题并确认修复',
          'PR 标题标注 [HOTFIX] 和 Incident 编号',
          '找 1 名工程师快速 Review（重点：不引入新问题）',
          '部署到 staging 验证后立即部署生产',
          '部署后持续观察 15 分钟，确认指标恢复正常',
        ],
        commands: [
          'git checkout -b hotfix/incident-' + Date.now(),
          '# 修复代码...',
          'npm run build && npm test',
          'git push origin hotfix/incident-...',
          '# 创建 PR 并请求紧急 Review',
        ],
        timeTarget: '根据严重程度：P1 1小时内，P2 4小时内',
      },
      {
        index: 6,
        title: 'Postmortem：时间线 / 根因 / 改进项（24h 内完成）',
        description:
          'Postmortem 是学习和改进的机制，不是追责工具。目标是防止同类故障再次发生。',
        actions: [
          '在 24 小时内组织 Postmortem 会议（趁记忆新鲜）',
          '完整时间线：从最早异常到完全恢复，每个关键操作打时间戳',
          '根因（5 Why）：递推到系统/流程层面的根本原因',
          '影响：受影响用户数、时长、SLA 损失',
          '改进项：每条 Action Item 有负责人和 Due Date',
          '发布 Postmortem 报告到团队共享文档',
          '跟踪改进项的完成情况',
        ],
        timeTarget: '24 小时内完成并发布',
      },
    ];

    const severityDefinition = {
      P1: {
        description: '全站不可用 / 核心功能中断 / 数据损坏风险 / 安全事件',
        responseTime: '立即响应（5 分钟内），War Room 模式',
        escalation: '立即通知 Engineering Manager + CTO',
      },
      P2: {
        description: '部分功能不可用 / 性能严重劣化（> 5x 正常延迟）/ 影响 > 10% 用户',
        responseTime: '15 分钟内响应',
        escalation: '通知 Engineering Manager',
      },
      P3: {
        description: '非核心功能异常 / 性能劣化（2-5x）/ 影响 < 10% 用户',
        responseTime: '1 小时内响应',
        escalation: '通知 Team Lead',
      },
      P4: {
        description: '轻微问题 / 不影响用户功能 / 监控误报',
        responseTime: '工作时间内处理',
        escalation: '无需升级',
      },
    };

    const postmortemTemplate = `# Postmortem: [故障标题]

**日期**: ${new Date().toISOString().split('T')[0]}
**服务**: ${serviceName}
**严重级别**: ${severity}
**值班工程师**: ${oncallEngineer}
**状态**: [Draft / Review / Published]

## 影响摘要

- **开始时间**: YYYY-MM-DD HH:MM UTC
- **结束时间**: YYYY-MM-DD HH:MM UTC
- **持续时长**: X 小时 Y 分钟
- **受影响用户**: ~X 用户
- **SLA 损失**: X.XX%

## 故障时间线

| 时间 | 事件描述 | 操作人 |
|------|---------|--------|
| HH:MM | 告警触发 | 监控系统 |
| HH:MM | 值班工程师确认 | ${oncallEngineer} |
| HH:MM | 开始应急处置 | ${oncallEngineer} |
| HH:MM | 业务恢复 | ${oncallEngineer} |
| HH:MM | 根因确认 | ${oncallEngineer} |
| HH:MM | Hotfix 上线 | ${oncallEngineer} |

## 根因分析（5 Why）

1. **Why**: [表象原因]
2. **Why**: [中间原因]
3. **Why**: [系统原因]
4. **Why**: [流程原因]
5. **Why**: [根本原因]

**根本原因**: [一句话总结]

## 改进项

| 行动项 | 负责人 | Due Date | 优先级 |
|--------|--------|----------|--------|
| [具体改进措施] | @engineer | YYYY-MM-DD | P1 |

## 经验教训

- **做得好的**: 
- **可以更好的**: 
- **需要改变的**: 
`;

    const diagnosticCommands = [
      `# 服务健康检查`,
      `curl -f http://${serviceName}/health`,
      ``,
      `# 查看 Pod 状态`,
      `kubectl get pods -l app=${serviceName}`,
      ``,
      `# 查看最近错误日志`,
      `kubectl logs -l app=${serviceName} --since=30m | grep -i "error\\|fatal"`,
      ``,
      `# 查看资源使用`,
      `kubectl top pods -l app=${serviceName}`,
      ``,
      `# 查看 K8s 事件`,
      `kubectl get events --field-selector involvedObject.name=${serviceName} --sort-by=.lastTimestamp | tail -20`,
      ``,
      `# 回滚到上一版本`,
      `kubectl rollout undo deployment/${serviceName}`,
      `kubectl rollout status deployment/${serviceName}`,
    ];

    return {
      success: true,
      data: {
        steps,
        severityDefinition,
        postmortemTemplate,
        diagnosticCommands,
      },
      duration: Date.now() - startTime,
      logs: [
        `[IncidentRunbook] 服务: ${serviceName}`,
        `[IncidentRunbook] 严重级别: ${severity}`,
        `[IncidentRunbook] 值班工程师: ${oncallEngineer}`,
        `[IncidentRunbook] 生成 ${steps.length} 步响应流程`,
      ],
    };
  },
};
