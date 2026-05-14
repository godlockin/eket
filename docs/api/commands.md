# Commands Module API Documentation

## 概述

Commands 模块实现 EKET CLI 所有用户命令，涵盖任务管理、Agent 操作、知识库检索、部署流程等。

## 主要职责

- **任务生命周期管理**：claim、complete、status
- **知识库操作**：搜索、索引、验证
- **Agent 协作**：轮询、消息传递、状态同步
- **部署流程**：三分支同步、版本发布

---

## 核心命令

### ta- Slaver 领取 Jira 任务
- 角色匹配验证（frontend_dev/backend_dev/qa/devops）
- 生成持久化 Slaver ID
- 注入 Active Context（`.eket/ACTIVE_CONTEXT.md`）
- 创建 git worktree 隔离环境
- 发送 claim 消息到 Master

**执行流程**：
1. 加载配置，初始化 profile
2. 获取可用 tickets（状态 = `ready`）
3. 按角色过滤匹配任务
4. 用户选择或自动分配
5. 使用 TaskAssigner 原子分配
6. 创建 worktree（`feature/TASK-XXX`）
7. 注入 Active Context（ticket + rules + 经验）
8. 更新 ticket 状态 → `in_progress`
9. 发送 SSE 事件通知

**使用示例**：
```bash
# 交互式领取
eket task:claim

# 指定任务 ID
eket task:claim TASK-001

# 自动模式（第一个匹配任务）
eket task:claim --auto

# 指定角色
eket task:claim --role backend_dev
```

**关键功能**：
- **持久化 Slaver ID**：`${role}-${timestamp}-${shortHash}`
- **依赖检测**：检查 `blocked_by` 字段
- **经验注入**：自动搜索相关 pitfalls/patterns
- **Saga 事务**：失败时自动回滚（清理 worktree、恢复 ticket 状态）

**依赖**：
- `TaskAssigner`：智能任务分配
- `WorktreeManager`：隔离环境
- `SkillStacker`：技能叠加
- `EnvelopeManager`：消息发送

---

### task:complete (`complete.ts`)

**职责**：
- 完成任务并提交 PR
- 验收标准自动化检查（Nyquist Rule）
- PR 描述生成（包含 git diff）
- 创建 review request
- 清理 worktree（可选保留）

**执行流程**：
1. 验证所有验收标准命令通过（exit code = 0）
2. 运行 `check-pr-size.sh`（禁止 >500 行未批准 PR）
3. 生成 PR 描述（模板 + git diff + 验收输出）
4. Commit + push 到 feature 分支
5. 创建 `outbox/review_requests/pr-TASK-XXX.md`
6. 发送 `review_request` 消息
7. 更新 ticket 状态 → `review`
8. 可选：清理 worktree 或保留

**使用示例**：
```bash
# 完成任务
eket task:complete TASK-001

# 保留 worktree（不清理）
eket task:complete TASK-001 --keep-worktree

# 跳过验收检查（仅调试）
eket task:complete TASK-001 --skip-validation
```

**Nyquist Rule 强制要求**：
- 每条验收标准必须有 shell 命令
- 命令必须 60 秒内完成
- 客观可重复（无随机端口/时间戳比较）
- 违反 → PR 直接 reject

---

### task:status (`context-status.ts`)

**职责**：
- 显示当前 Agent 状态
- 列出可领取任务
- 显示 Active Context
- 检查 message queue

**使用示例**：
```bash
# 查看状态
eket task:status

# JSON 格式输出
eket task:status --json
```

---

### knowledge:search (`knowledge-search.ts`)

**职责**：
- 全文搜索 `confluence/memory/`
- 支持 patterns/pitfalls/glossary/best-practices
- Execution Proof 验证（只返回有 proof 的知识）
- 结果按相关性排序

**使用示例**：
```bash
# 搜索经验
eket knowledge:search "TypeDoc 配置"

# 搜索 pitfalls
eket knowledge:search --type pitfall "SSH push"

# 忽略 proof 检查（包含 legacy 文档）
eket knowledge:search "agent pool" --no-proof
```

**返回格式**：
```
📄 patterns/api-documentation-workflow.md (score: 95%)
   Source: TASK-611
   Proof: ✅ exit_code=0 (2026-05-10)

   TypeDoc 自动生成 + 手动补充 3 个核心模块...

---

📄 pitfalls/typedoc-tsconfig-conflict.md (score: 87%)
   Source: TASK-603
   Proof: ✅ exit_code=0 (2026-04-28)

   TypeDoc 编译选项与 tsconfig.json 冲突，导致生成失败...
```

---

### knowledge:index (`knowledge-index.ts`)

**职责**：
- 重建知识库索引（SQLite FTS）
- 验证所有文档 front-matter
- **Execution Proof 强制检查**（新文档必须有 proof）
- 统计覆盖率

**使用示例**：
```bash
# 重建索引
eket knowledge:index

# 严格模式（拒绝无 proof 文档）
eket knowledge:index --strict

# 检查特定目录
eket knowledge:index --path confluence/memory/patterns
```

**Proof 元数据格式**：
```yaml
---
title: API 文档补充流程
proof:
  task_id: TASK-614
  exit_code: 0
  timestamp: 2026-05-10T12:00:00Z
  tool_name: typedoc
---
```

---

### deploy:sync-branches (`sync-branches.ts`)

**职责**：
- 三分支同步（feature → testing → main → miao）
- 冲突检测与解决
- 版本号自动递增
- Changelog 生成

**使用示例**：
```bash
# 同步分支
eket deploy:sync-branches feature/TASK-001

# 自动解决冲突（选择 theirs）
eket deploy:sync-branches --auto-resolve theirs
```

---

#询（新任务、PR 反馈、消息队列）
- 间隔：30 秒 - 5 分钟可配置
- 后台运行（daemon 模式）

**使用示例**：
```bash
# Master 轮询
eket agent:poll --role master --interval 60

# Slaver 轮询
eket agent:poll --role slaver --interval 30 --daemon
```

---

### alerts:list (`alerts.ts`)

**职责**：
- 列出所有告警（blocked/timeout/error）
- 按优先级排序
- 自动触发升级流程

**使用示例**：
```bash
# 查看告警
eket alerts:list

# 仅显示 critical 级别
eket alerts:list --severity critical
```

---

## 命令开发规范

### 1. 命令注册（`index.ts`）

```typescript
import { Command } from 'commander';

export function registerCommands(program: Command): void {
  program
    .command('task:claim [ticketId]')
    .description('Claim a task')
    .option('-r, --role <role>', 'Agent role')
    .option('--auto', 'Auto mode')
    .action(async (ticketId, options) => {
      const { claimTask } = await import('./commands/claim.js');
      await claimTask(ticketId, options);
    });
}
```

### 2. 错误处理

```typescript
import { printError, logSuccess } from '../utils/error-handler.js';

try {
  await someOperation();
  logSuccess('Operation completed');
} catch (error) {
  printError({
    code: 'OPERATION_FAILED',
    message: 'Failed to complete operation',
    causes: ['Network timeout', 'Invalid configuration'],
    solutions: ['Check network', 'Validate config.yml'],
    quickFix: 'eket config:validate'
  });
  process.exit(1);
}
```

### 3. 进度提示（ora）

```typescript
import ora from 'ora';

const spinner = ora('Loading tickets...').start();

try {
  const tickets = await loadTickets();
  spinner.succeed('Loaded 5 tickets');
} catch (error) {
  spinner.fail('Failed to load tickets');
}
```

### 4. SSE 事件发送

```typescript
import { sseBus } from '../core/sse-bus.js';

sseBus.emit({
  type: 'task_claimed',
  payload: {
    ticketId: 'TASK-001',
    agent: 'slaver-001',
    timestamp: new Date().toISOString()
  }
});
```

---

## 测试策略

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { claimTask } from './claim.js';

describe('task:claim', () => {
  beforeEach(() => {
    // Setup test fixtures
  });

  it('should claim task with matching role', async () => {
    const result = await claimTask('TASK-001', { role: 'backend_dev' });
    expect(result.success).toBe(true);
  });

  it('should reject task with mismatched role', async () => {
    await expect(
      claimTask('TASK-001', { role: 'frontend_dev' })
    ).rejects.toThrow('R---|------|---------|
| 4.3 | 2026-05 | claim 集成 TaskAssigner，分布式任务分配 |
| 4.0 | 2026-04 | knowledge 模块 Execution Proof 强制要求 |
| 3.5 | 2026-03 | deploy 三分支同步自动化 |
| 3.0 | 2026-02 | SSE 事件总线集成 |

---

**更多信息**：参见 [TypeDoc 自动生成文档](./index.html)
