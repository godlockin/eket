# AGENT-MEMORY.md — Agent Memory 系统说明

**版本**: 1.0.0  
**适用框架**: EKET v2.1.33+（依赖 Claude Code v2.1.33+ 原生 Agent Memory 支持）  
**最后更新**: 2026-04-15

---

## 概述

Claude Code v2.1.33+ 原生支持 Agent Memory。在 `agent.yml` 中声明 `memory` 字段后，Agent 可以跨会话积累知识，而无需依赖外部数据库或手动注入 prompt。

**核心能力**：
- Agent 启动时：自动读取 `MEMORY.md` 前 200 行，注入系统提示
- 超出 200 行时：Agent 自动将内容迁移到主题子文件（如 `veto-patterns.md`、`anti-patterns.md`）
- 任务完成时：Agent 主动更新 `MEMORY.md`（需在 `agent.yml` 的 prompt 中明确要求）

---

## 三级存储

| 范围 | 声明方式 | 存储路径 | 版本控制 | 适用场景 |
|------|----------|----------|---------|---------|
| `user` | `memory: user` | `~/.claude/agent-memory/<agent-name>/` | ❌ 否 | 跨项目通用知识（个人习惯、通用编程约定） |
| `project` | `memory: project` | `.claude/agent-memory/<agent-name>/` | ✅ 是 | 团队共享的项目约定（代码规范、审查模式） |
| `local` | `memory: local` | `.claude/agent-memory-local/<agent-name>/` | ❌ 否 | 个人私有知识（本地实验、个人笔记） |

### 三级存储选择指南

```
我的知识是否应该共享给团队其他成员？
├── 是 → 使用 project（版本控制，可 code review）
└── 否 → 继续往下

这是个人跨项目通用知识？
├── 是 → 使用 user（所有项目共享，个人维度）
└── 否 → 使用 local（当前项目，个人私有，不追踪）
```

### EKET 框架中的配置

EKET 中所有 reviewer Agent 使用 `project` 级别（团队共享审查知识）：

```yaml
# gate_reviewer — 积累否决/批准模式
name: gate_reviewer
memory: project   # → .claude/agent-memory/gate-reviewer/MEMORY.md

# code_reviewer — 积累代码风格约定和反模式
name: code_reviewer
memory: project   # → .claude/agent-memory/code-reviewer/MEMORY.md
```

> **注意**：`.claude/agent-memory-local/` 已添加到 `.gitignore`，确保 local 级别不被追踪。

---

## 如何在 agent.yml 中激活 Memory

### 第一步：声明 memory 字段

```yaml
name: my_agent
memory: project   # 或 user / local
```

### 第二步：在 prompt 中添加 Memory 使用规范

在 `agent.yml` 的文档区域（或 `system_prompt` 字段）添加以下内容：

```markdown
## Memory 使用规范

- **启动时**：Review your memory in `.claude/agent-memory/<agent-name>/MEMORY.md`
  for historical patterns before starting each session.
- **完成后**：Update your memory with new patterns discovered in this session.
- **格式约定**：每条记忆条目需注明关联 ticket/PR ID 和日期，便于追溯。
```

### 第三步：创建初始 MEMORY.md（种子文件）

在与 `agent.yml` 相同目录下创建 `MEMORY.md`，用于存储初始种子知识。  
此文件会被 Agent 在运行时读取和更新。

---

## Memory 文件结构最佳实践

### 基本结构模板

```markdown
# <Agent Name> Memory

> **自动管理说明**：此文件由 <agent_name> 在每次任务后自动更新。
> 前 200 行会在每次启动时注入系统提示。超出后迁移到主题子文件。
> **格式约定**：每条记忆注明关联 ticket/PR ID（或 `[seed]`）和日期。

---

## <主题 1>（例：Veto Patterns）
<!-- Agent 自动追加 -->

### <子类别>
- **[ticket-id 或 seed] YYYY-MM-DD** — [知识条目描述]

---

## <主题 2>（例：Project-Specific Rules）
<!-- 手动维护 -->

---

## History Index（历史索引）
> 超出 200 行时迁移到子文件。

| ID | 结论 | 日期 | 摘要 |
|----|------|------|------|
```

### 设计原则

1. **可读性优先**：Memory 文件是给 AI 读的，但也要让人类能读懂并参与维护。
2. **可追溯性**：每条记忆注明来源（ticket ID / PR ID / `[seed]`）和日期，便于未来审计。
3. **分类明确**：用二级标题（`##`）分类，三级标题（`###`）分子类，便于 Agent 快速定位。
4. **避免冗余**：相同模式不重复记录，更新旧条目而非新增重复条目。
5. **200 行控制**：超出 200 行时，Agent 会将历史索引迁移到 `<topic>.md` 子文件，主文件保持精简。

### 禁止事项

- ❌ 在 MEMORY.md 中存储完整代码（只存模式描述，具体代码放 ticket/PR）
- ❌ 存储敏感信息（密码、API Key、个人数据）—— 尤其是 `project` 级别（会被版本控制）
- ❌ 手动截断 MEMORY.md（由 Agent 自动管理）

---

## EKET 中已配置 Memory 的 Agent

| Agent | 存储级别 | Memory 路径 | 积累内容 |
|-------|----------|-------------|---------|
| `gate_reviewer` | `project` | `.claude/agent-memory/gate-reviewer/MEMORY.md` | 否决/批准模式、项目特有规则 |
| `code_reviewer` | `project` | `.claude/agent-memory/code-reviewer/MEMORY.md` | 代码风格约定、反模式、测试覆盖要求 |

---

## 与 SQLite 知识库的关系

Agent Memory 和 SQLite 知识库（`core/knowledge-base.ts`）是**互补关系**，而非竞争关系：

| 维度 | Agent Memory | SQLite 知识库 |
|------|-------------|--------------|
| **主要使用者** | Agent（自动读取注入 prompt） | 人类/CLI（通过命令查询） |
| **查询方式** | 自动注入（启动时） | `node dist/index.js sqlite:search "<keyword>"` |
| **存储内容** | Agent 工作模式、审查经验 | 技术决策、架构 ADR、项目知识 |
| **版本控制** | project 级别：是；local 级别：否 | 否（运行时数据库） |
| **适合场景** | Agent 跨会话学习 | 人类知识沉淀和检索 |

**推荐使用策略**：
- Agent 发现的**审查模式** → 写入 Agent Memory（`MEMORY.md`）
- 重大**技术决策** → 写入 SQLite 知识库（`knowledge-base.ts` artifact/decision 类型）
- **两者互通**：复杂知识先沉淀到 SQLite，再由 Master 提炼摘要写入 `MEMORY.md`

---

## 故障排查

### Memory 文件未被 Agent 读取

1. 确认 `agent.yml` 中声明了 `memory: project`（或 user/local）
2. 确认 `MEMORY.md` 存在于对应路径（`.claude/agent-memory/<agent-name>/`）
3. 确认 `MEMORY.md` 不超过 200 行（超出时会自动迁移，但迁移失败会导致读取不完整）
4. 确认 `agent.yml` prompt 中包含 Memory 使用规范（否则 Agent 知道有文件但不知道何时读）

### Memory 被污染或有错误条目

1. 直接编辑 `MEMORY.md` 删除错误条目（文件是普通 Markdown，可手动编辑）
2. 若整体混乱，可从 `template/agents/<type>/<agent_name>/MEMORY.md` 重置为初始种子文件
3. 通过 git history 追溯是哪次 Agent 更新引入了错误

### local 级别 Memory 被意外追踪

确认 `.gitignore` 中包含：
```
.claude/agent-memory-local/
```
