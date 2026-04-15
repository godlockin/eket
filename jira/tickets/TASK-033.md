# TASK-033: Agent Memory 集成 — gate_reviewer 和 code_reviewer 跨会话记忆

**Ticket ID**: TASK-033
**标题**: 为 gate_reviewer 和 code_reviewer Agent 配置 Claude Code 原生 memory 字段，积累审查历史
**类型**: feature
**优先级**: P2

**状态**: pr_review
**创建时间**: 2026-04-15
**最后更新**: 2026-04-15
**started_at**: 2026-04-15
**completed_at**: 2026-04-15

**负责人**: backend_dev
**Slaver**: backend_dev-slaver

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-15 | backlog → ready |
| 领取 | backend_dev-slaver | 2026-04-15 | ready → in_progress |
| 完成 | backend_dev-slaver | 2026-04-15 | in_progress → pr_review |

---

## 1. 任务描述

### 背景

Claude Code v2.1.33+ 原生支持 Agent Memory，Agent 可以跨会话积累知识：

```yaml
---
name: gate-reviewer
memory: project   # 团队共享，版本控制
---
```

**三级存储**：
| 范围 | 路径 | 版本控制 | 适用场景 |
|------|------|---------|---------|
| `user` | `~/.claude/agent-memory/<name>/` | 否 | 跨项目通用知识 |
| `project` | `.claude/agent-memory/<name>/` | 是 | 团队共享的项目约定 |
| `local` | `.claude/agent-memory-local/<name>/` | 否 | 个人私有知识 |

**工作机制**：
1. Agent 启动时：自动读取 `MEMORY.md` 前 200 行注入系统提示
2. 超出 200 行时：Agent 自动将内容迁移到主题文件（如 `veto-patterns.md`）
3. 任务完成时：Agent 主动更新 MEMORY.md（需在 prompt 中明确要求）

### 目标效果

**gate_reviewer**（`memory: project`）：
- 积累历史否决模式（"缺少测试用例时否决"、"依赖未解决时否决"）
- 积累项目特有的 gate 规则（不同 ticket 类型的不同审查标准）
- 团队共享，版本控制，可以 code review

**code_reviewer**（`memory: project`）：
- 积累代码风格约定（"使用 Result<T> 而非 throw"、"ESM 必须带 .js 扩展名"）
- 积累历史 review 中发现的反模式
- 积累测试覆盖率要求和测试命名约定

### 改动范围

**Part A — `template/agents/reviewer/gate_reviewer/agent.yml` 更新**

在现有配置中新增 `memory: project` 字段，并在 prompt 中添加：
```markdown
## Memory 使用规范
- **启动时**：Review your memory in `.claude/agent-memory/gate-reviewer/MEMORY.md` for historical veto patterns.
- **完成后**：Update your memory with new patterns discovered in this review session.
```

**Part B — `template/agents/reviewer/gate_reviewer/MEMORY.md`（新建）**

初始 Memory 文件，包含：
```markdown
# Gate Reviewer Memory

## Veto Patterns（历史否决模式）
<!-- gate_reviewer 在每次 VETO 后自动更新 -->

## Approve Patterns（历史批准模式）
<!-- 记录常见的快速通过模式 -->

## Project-Specific Rules（项目特有规则）
<!-- 由 Master 手动维护 -->
```

**Part C — `template/agents/independent/code_reviewer/agent.yml`（新建或更新）**

为 code_reviewer Agent 添加 `memory: project`，并配置 Memory 使用 prompt。

**Part D — `template/agents/independent/code_reviewer/MEMORY.md`（新建）**

初始 Memory 文件，包含：
```markdown
# Code Reviewer Memory

## Code Style Conventions（代码风格约定）
- 使用 Result<T> 类型，不抛出异常
- ESM 导入必须带 .js 扩展名
- 错误码定义在 EketErrorCode 枚举中

## Anti-Patterns（已知反模式）
<!-- code_reviewer 在 review 中发现的反模式 -->

## Test Coverage Requirements（测试覆盖要求）
<!-- 各模块的测试覆盖率基线 -->
```

**Part E — `.gitignore` 更新**

确保 `local` 级别的 memory 目录不被追踪：
```
.claude/agent-memory-local/
```

**Part F — `template/docs/AGENT-MEMORY.md`（新建）**

说明 Agent Memory 系统：
- 三级存储语义和选择指南
- 如何在 prompt 中激活 Memory
- Memory 文件结构最佳实践
- 与 SQLite 知识库的关系（两者互补：Memory 给 Agent 用，SQLite 给 CLI 查询用）

---

## 2. 验收标准

- [x] `template/agents/reviewer/gate_reviewer/agent.yml` 包含 `memory: project` 字段；验证：`grep -c "memory: project" template/agents/reviewer/gate_reviewer/agent.yml`
- [x] `template/agents/reviewer/gate_reviewer/MEMORY.md` 存在，包含 Veto Patterns 和 Approve Patterns 章节；验证：`grep -c "Veto Patterns\|Approve Patterns" template/agents/reviewer/gate_reviewer/MEMORY.md`
- [x] `.gitignore` 包含 `agent-memory-local` 排除规则；验证：`grep -c "agent-memory-local" template/.gitignore`（应 ≥ 1）
- [x] `template/docs/AGENT-MEMORY.md` 存在，包含三级存储说明；验证：`grep -c "user\|project\|local" template/docs/AGENT-MEMORY.md`（应 ≥ 3）
- [x] `npm test` 全量通过；验证：`cd node && npm test 2>&1 | tail -3`

---

## 3. 技术方案

纯配置/文档改动，无 TypeScript 变更。

1. 修改 gate_reviewer 的 agent.yml，添加 memory 字段和 prompt 说明
2. 创建 gate_reviewer 的初始 MEMORY.md
3. 创建或更新 code_reviewer 的 agent.yml 和 MEMORY.md
4. 更新 .gitignore
5. 新建 AGENT-MEMORY.md 文档

---

## 4. 影响范围

- `template/agents/reviewer/gate_reviewer/agent.yml` — 新增 memory 字段
- `template/agents/reviewer/gate_reviewer/MEMORY.md` — 新建初始 Memory
- `template/agents/independent/code_reviewer/agent.yml` — 新建或更新
- `template/agents/independent/code_reviewer/MEMORY.md` — 新建初始 Memory
- `template/.gitignore` — 新增 agent-memory-local 排除
- `template/docs/AGENT-MEMORY.md` — 新建文档

---

## 5. blocked_by

无依赖，可立即执行。与 TASK-030/031/032/034 完全并行。

---

## 6. 实现记录（Slaver 填写）

**分析报告**：纯配置/文档改动，无 TypeScript 变更，影响面有限，直接进入实现。

### 实现细节

**Part A — gate_reviewer/agent.yml**  
在 YAML 配置块中新增 `memory: project` 字段（版本升级至 1.1.0），在文档区域新增"Memory 使用规范"章节，审查工作流增加第 0 步（读取 memory）和第 7 步（更新 memory）。

**Part B — gate_reviewer/MEMORY.md**  
创建初始种子文件，包含：
- Veto Patterns：验收标准类（2条）、技术方案类（2条）、依赖类（2条）、工时估算类（2条）
- Approve Patterns：纯文档类、小任务类、有先例的重复型任务、降级强制通过（共 4 条）
- Project-Specific Rules：EKET 框架特有规则（5条）、分支与 PR 规则（2条）
- Review History Index（空表，供 Agent 运行时填充）

**Part C — code_reviewer/agent.yml**  
新建 `template/agents/independent/code_reviewer/agent.yml`，参照 gate_reviewer 格式，定义：
- `memory: project` 字段
- review_checklist（must_check 6条 + should_check 4条）
- Memory 使用规范（启动时/完成后）
- 代码审查工作流（8步）
- 审查报告模板

**Part D — code_reviewer/MEMORY.md**  
创建初始种子文件，包含：
- Code Style Conventions：TypeScript/ESM 规范（3条）、错误处理约定（3条）、命名规范（3条）、文件组织（3条）
- Anti-Patterns：错误处理（3条）、TypeScript 类型（3条）、ESM 导入（2条）、测试（3条）、安全（3条）
- Test Coverage Requirements：整体要求（2条）、核心模块专项要求（7个模块）、测试文件命名约定（3条）
- Review History Index（空表）

**Part E — .gitignore**  
在末尾追加 `.claude/agent-memory-local/` 排除规则，附注释说明三级存储关系。

**Part F — docs/AGENT-MEMORY.md**  
新建 1.0.0 版本文档，包含：三级存储选择指南（含决策树）、激活方式（3步骤）、Memory 文件结构最佳实践（模板 + 设计原则 + 禁止事项）、EKET 中已配置的 Agent 列表、与 SQLite 知识库的关系说明、故障排查（3个场景）。

### 验收标准执行结果

```
AC1: grep -c "memory: project" template/agents/reviewer/gate_reviewer/agent.yml
→ 1 ✅

AC2: grep -c "Veto Patterns\|Approve Patterns" template/agents/reviewer/gate_reviewer/MEMORY.md
→ 2 ✅

AC3: grep -c "agent-memory-local" template/.gitignore
→ 1 ✅

AC4: grep -c "user\|project\|local" template/docs/AGENT-MEMORY.md
→ 18 ✅（≥3）

AC5: grep -c "memory: project" template/agents/independent/code_reviewer/agent.yml
→ 1 ✅

AC6: grep -c "Code Style Conventions\|Anti-Patterns\|Test Coverage" template/agents/independent/code_reviewer/MEMORY.md
→ 3 ✅

npm test 全量执行结果：
Test Suites: 49 passed, 49 total
Tests:       1132 passed, 1132 total
Snapshots:   0 total
Time:        11.252 s
✅ 全部通过
```
