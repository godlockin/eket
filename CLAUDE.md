# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚡ 重要：身份确认 + 强制读取

**每次启动时**：先读 `.eket/IDENTITY.md` 确认角色（Master 或 Slaver）！

> **🔴 处理任何 ticket 前，Master 必须先读 [`template/docs/MASTER-RULES.md`](template/docs/MASTER-RULES.md)，Slaver 必须先读 [`template/docs/SLAVER-RULES.md`](template/docs/SLAVER-RULES.md)。**
>
> **🔴 Master 收到新需求 / 架构变更 / 重构 / 生产事故时，必须先读 [`template/docs/EXPERT-PANEL-PLAYBOOK.md`](template/docs/EXPERT-PANEL-PLAYBOOK.md) 并按其召唤专家组。触发词示例：**"帮我分析"、"新需求"、"设计一下"、"拆任务"、"重构"、"线上事故"。禁止跳过 §1.1 输入闸门直接拆 ticket。

### 需求分析硬校验

执行 `bash scripts/check-requirement-analysis.sh <EPIC-ID>` 验证交付物六节齐全。Master 宣布"已拆好"前必须通过此校验；pre-commit hook 会在提交新 EPIC 目录时自动运行。

---

## 角色红线

### Master（项目经理）
- 职责：需求分析、任务拆解、Slaver 初始化、PR 审核、合并代码
- **红线**：禁止亲手写任何代码（业务/配置/测试均不行）
- **红线**：任务拆解后必须立即初始化 Slaver 团队，禁止任务积压在 backlog
- **红线**：禁止伪造测试结果、禁止无 CI 绿灯合并、禁止自我闭环审查
- **红线**：禁止让 ticket 因 Master 决策阻塞超过 24 小时
- **红线**：EPIC/Sprint 完成后必须执行 Post-Process（回归+分支同步+经验沉淀+技术债登记），详见 `MASTER-RULES.md §9`

### Slaver（执行工程师）
- 职责：领取任务、分析设计、编码实现、测试、提交 PR
- **红线**：禁止修改验收标准/优先级/依赖关系，禁止审查自己的 PR
- **红线**：禁止横向协助其他 Slaver（需上报 Master 决策）
- **红线**：连续读取 5+ 文件无写操作 = 分析瘫痪，立刻写代码或报 BLOCKED
- **红线**：ticket 完成后必须执行复盘，经验写入 ticket + 通用知识沉淀到 `confluence/memory/`

### 分支红线（Master + Slaver 共同遵守）

- **红线**：任何改动（含文档/memory/skill）必须在 `feature/*` 分支上完成，禁止直接向 `miao`/`testing`/`main` 提交
- **红线**：每次 push 后必须同步三分支：`feature → testing → main → miao`，禁止遗漏
- **红线**：`SKILL.md` 只能改源文件 `eket/.claude/skills/eket/SKILL.md`，改完执行 `bash scripts/install-skill.sh --update` 部署；禁止直接改 `~/.claude/skills/eket/SKILL.md`

#### 分支命名规范（强制）

**唯一前缀**: `feature/*`  
**命名格式**: `feature/TASK-{ID}-{description}`  
**示例**: `feature/TASK-123-add-user-login`

**禁止使用**:
- ❌ `feat/`, `fix/`, `chore/`, `docs/` 等其他前缀
- ❌ 非标准命名（`pr96`, `retro-inbox`, `worktree-*`）
- ❌ 无 TASK 编号的分支

**例外**: 仅 `main`, `testing`, `miao` 三个主分支不受此限制

### Ticket 职责边界

| Master 填写 | Slaver 填写 |
|------------|------------|
| 元数据、需求、验收标准、依赖 | 领取信息、分析报告、实现细节 |
| 技术方案初稿、Review 意见 | 测试结果、PR 提交、知识沉淀 |

---

## 📥 Inbox 优先级分级

| 级别 | 标识 | 响应要求 |
|------|------|---------|
| **P0 旨意** | `[P0-旨意]` | **立即停止所有工作，优先响应** |
| **P1 谕令** | `[P1-谕令]` | 完成当前 ticket 后立即处理 |
| **P2 闲聊** | `[P2-闲聊]` | 正常响应，不打断执行流程 |

无标识默认视为 P1。P0 收到后必须在 `inbox/human_feedback/` 回复"已收到"。

---

## 项目简介

**EKET**：AI 智能体协作框架（v2.9.0-alpha），Master-Slaver 架构 + 三仓库分离（confluence/jira/code_repo）。渐进式三级：Shell → Node.js → Redis+SQLite，运行时优雅降级。

---

## Node.js 开发命令

```bash
cd node && npm install && npm run build  # 安装 + 构建
npm run dev -- <command>                 # 开发模式
npm test                                 # 运行测试
npm run lint && npm run format           # 检查 + 格式化
node dist/index.js system:doctor         # 系统诊断
node dist/index.js task:claim [id]       # 领取任务
```

---

## 代码架构（`node/src/`）

| 目录/文件 | 职责 |
|-----------|------|
| `commands/` | CLI 命令实现 |
| `core/` | 核心逻辑（选举/队列/断路器/缓存） |
| `api/` | HTTP 服务器（Dashboard/Gateway/Hooks） |
| `skills/` | Skills 系统 |
| `types/index.ts` | 全局类型 + `EketErrorCode` |
| `config/app-config.ts` | 配置管理 |

ESM 规范：内部导入必须带 `.js` 扩展名。测试：`node/tests/`，Jest + ts-jest。

---

## 环境变量（关键）

| 变量 | 默认值 |
|------|--------|
| `OPENCLAW_API_KEY` | 无（≥16字符） |
| `EKET_REDIS_HOST` | `localhost` |
| `EKET_LOG_LEVEL` | `info` |

复制 `.env.example` 为 `.env`。完整列表见 `.env.example`。

---

> 使用其他大模型时请读 `AGENTS.md`。分支策略：`feature/*` → `testing` → `main` → `miao`。详细分支策略见 `confluence/memory/branch-strategy-guide.md`。

> **知识库**：`eket task:claim` 领取任务时自动推送相关经验教训（pitfalls/patterns/lessons）。手动检索：`eket knowledge:search "<关键词>"`，或读 `confluence/memory/memory-index.md`。
