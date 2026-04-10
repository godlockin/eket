# CLAUDE.md - EKET Agent Framework 项目指南

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

**版本**: v2.9.0-alpha
**最后更新**: 2026-04-10

## 重要：身份确认

**每次启动 Claude Code 时，请首先读取 `.eket/IDENTITY.md` 确认你的身份！**

该文件包含：
- 当前实例角色（Master 或 Slaver）
- 核心职责和禁止操作
- 启动检查清单
- 可用命令

> 如果使用其他大模型（Gemini、GPT、Cursor 等），请阅读 `AGENTS.md`，内容与本文件互补，覆盖通用行为规范。

---

## EKET Agent Framework

本项目使用 **EKET Agent Framework** 进行 AI 驱动的开发。Claude Code 作为智能体实例在此系统中运行。

---

## 核心工作流程

```
1. 监听输入 → inbox/human_input.md
       ↓
2. 需求分析 → 拆解为 tasks
       ↓
3. 执行任务 → 创建分支 → 开发 → 提交
       ↓
4. Review   → outbox/review_requests/
       ↓
5. 反馈循环 → inbox/human_feedback/ → 修改或完成
```

### 输入/输出位置

| 位置 | 用途 |
|------|------|
| `inbox/human_input.md` | 人类需求输入 |
| `inbox/human_feedback/` | Review 反馈 |
| `outbox/review_requests/` | Review 请求输出 |
| `tasks/` | 任务定义 |
| `.eket/state/` | 状态文件 |
| `.eket/logs/` | 日志 |
| `.eket/memory/` | 记忆存储 |

---

## 可用命令

### 通用命令

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导（首次启动运行） |
| `/eket-start` | 启动实例（自动检测 Master/Slaver） |
| `/eket-start -a` | 自动模式启动（Slaver 自动领取任务） |
| `/eket-role <role>` | 设置 Slaver 角色类型 |
| `/eket-status` | 查看智能体状态和任务列表 |
| `/eket-claim [id]` | 领取任务 |
| `/eket-submit-pr` | 提交 PR 请求审核（自动创建 PR 信息并通知 Master） |
| `/eket-help` | 显示帮助 |
| `/eket-ask` | 依赖追问（当缺少数据源/API/认证配置时） |

---

## 依赖追问机制

**触发条件**: 当检测到项目缺少必要依赖配置时自动触发

**依赖信息包括**:
- 数据源配置（数据库类型、连接方式）
- 外部 API（API 名称、认证方式、端点）
- 认证和密钥管理（API Key、OAuth 等）
- 基础设施（部署目标、域名、HTTPS）

**追问流程**:
```
1. 智能体分析需求
   ↓
2. 检测缺失依赖配置
   ↓
3. 创建 inbox/dependency-clarification.md
   ↓
4. 停止执行，等待用户填写
   ↓
5. 用户填写后运行 /eket-ask
   ↓
6. 继续项目构建
```

**相关文件**:
- `inbox/dependency-clarification.md` - 依赖追问文件
- `inbox/dependency-checklist.md` - 依赖检查清单（可选）
- `.eket/state/dependency-status.yml` - 依赖状态

### Master 专用命令

| 命令 | 功能 |
|------|------|
| `/eket-analyze` | 分析需求并拆解任务 |
| `/eket-review-pr` | 审核 Slaver 提交的 PR |
| `/eket-merge` | 合并 PR 到 main 分支 |
| `/eket-check-progress` | 检查 Slaver 任务进度 |

---

## 初始化后首次启动

当你初始化项目后首次打开 Claude Code，请运行：

```bash
/eket-init
```

这会触发以下流程：

1. **项目结构检查** - 验证所有必需文件和目录
2. **健康检查** - 运行 `.eket/health_check.sh`
3. **显示指南** - 快速开始说明
4. **显示输入状态** - 当前 `inbox/human_input.md` 内容

### 下一步

1. 编辑 `inbox/human_input.md` 描述你的需求
2. 保存并发送消息给 Claude
3. 智能体开始分析需求并创建任务
4. 在 `inbox/human_feedback/` 查看状态报告
5. 在同一个文件中回复确认或反馈

---

## Git 规范

**分支命名**: `feature/<task-id>-<description>`

**Task ID 格式**: `{PREFIX}-{SEQ}` (如：`FEAT-001`, `FIX-001`, `TASK-001`)

**提交信息**: Conventional Commits
```
<type>(<scope>): <description>
```
类型：`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**主分支**: `main`

---

## Ticket 编号规则

| 类型 | 前缀 | 示例 | 用途 |
|------|------|------|------|
| 功能需求卡 | `FEAT` | `FEAT-001` | 功能开发任务 |
| 任务卡 | `TASK` | `TASK-001` | 一般任务（文档/重构等） |
| 缺陷修复卡 | `FIX` | `FIX-001` | Bug 修复任务 |
| 测试卡 | `TEST` | `TEST-001` | 测试编写任务 |
| 产品需求卡 | `PRD` | `PRD-001` | 产品需求文档 |
| UI/UX设计卡 | `U-DESIGN` | `U-DESIGN-001` | UI/UX 设计任务 |
| 技术设计卡 | `T-DESIGN` | `T-DESIGN-001` | 技术设计任务 |
| 部署卡 | `DEPL` | `DEPL-001` | 部署任务 |
| 文档卡 | `DOC` | `DOC-001` | 文档编写任务 |
| 用户调研卡 | `USER-RES` | `USER-RES-001` | 用户调研任务 |
| 数据分析卡 | `DATA-ANALYSIS` | `DATA-ANALYSIS-001` | 数据分析任务 |
| 合规审查卡 | `COMPLIANCE` | `COMPLIANCE-001` | 合规审查任务 |

---

## PR 描述模板

```markdown
# PR 请求：FEAT-001

**提交者**: slaver
**分支**: feature/FEAT-001-user-login
**目标分支**: testing
**创建时间**: 2026-03-27T10:30:00+08:00

---

## 关联 Ticket

- FEAT-001

## 变更摘要

 src/components/Login.tsx       | 150 +++++++++++
 src/hooks/useAuth.ts           |  80 ++++++
 tests/Login.test.tsx           | 120 +++++++++

## 变更详情

<!-- 详细描述变更内容 -->

## 验收标准

- [ ] 代码符合项目规范
- [ ] 测试覆盖关键逻辑
- [ ] 文档已更新（如需要）

## 测试情况

- [ ] 单元测试通过
- [ ] 手动测试完成（如需要）

## 注意事项

<!-- 列出需要 Reviewer 特别注意的内容 -->

---

## 状态：pending_review

**等待 Master 审核**
```

### 分析报告流程（领取任务后必须先执行）

**Slaver 领取任务后，不可直接开发，必须先提交分析报告给 Master 审批。**

流程如下：

1. **领取任务** → Ticket 状态变为 `in_progress`
2. **进行任务分析** → 理解需求、设计技术方案、拆解子任务、评估风险
3. **创建分析报告** → `jira/tickets/<ticket-id>/analysis-report.md`（模板见下方）
4. **更新 Ticket 状态** → 改为 `analysis_review`
5. **发送审批请求消息** → 类型为 `analysis_review_request`，发送到 `shared/message_queue/inbox/`
6. **等待 Master 审批**：
   - **批准** → 状态变为 `approved`，Slaver 开始开发
   - **驳回** → Slaver 重新分析，更新报告后再次提交
   - **需升级** → Slaver 拆分任务或调整方案后重新提交

#### 分析报告模板

创建 `jira/tickets/<ticket-id>/analysis-report.md`：

```markdown
# 任务分析报告：<ticket-id>

**Slaver**: <slaver_id>
**分析时间**: YYYY-MM-DD HH:MM
**预计工时**: X 小时

## 1. 需求理解
<简述任务的核心目标和验收标准>

## 2. 技术方案
<描述实现方案>

## 3. 影响面分析
| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| <module> | 高/中/低 | <具体影响> |

## 4. 任务拆解
| 子任务 | 预估工时 | 优先级 |
|--------|----------|--------|
| <子任务 1> | 2h | P0 |

## 5. 风险评估
| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| <风险> | 高/中/低 | 高/中/低 | <方案> |
```

---

### PR 提交流程

运行 `/eket-submit-pr` 后，脚本会自动：

1. **提交代码变更** 到远程仓库
2. **创建 PR 描述文件** 到 `outbox/review_requests/`
3. **发送 Review 请求消息** 到 `shared/message_queue/inbox/`
4. **更新 Ticket 状态** 为 `review`
5. **通知 Master** 进行审查

Master 收到请求后会：
1. 读取 PR 描述文件
2. 检查代码变更和测试
3. 提供审核意见（批准/需要修改）
4. 合并到 main 分支（如批准）

---

## 决策规则

**自主决策**: 任务拆解、实现细节、测试结构、文档、常规技术选择

**上报人类**: 重大方向变更、显著成本影响、任务冲突、人类明确要求参与

---

## 反馈机制

每轮执行结束后，在 `inbox/human_feedback/` 创建状态报告文件，等待人类确认。

### 状态报告格式

```markdown
# 任务状态报告

**任务 ID**: <task-id>
**时间**: YYYY-MM-DD HH:MM
**阶段**: <当前阶段，如：需求分析完成/开发完成/测试完成>
**状态**: `pending_confirmation`

---

## 本阶段成果

- [列出完成的工作和产出]

## 待确认问题

1. <问题描述>
   - 选项 A: [描述]
   - 选项 B: [描述]
   - **推荐**: [选项 + 理由]

2. <问题描述>
   - **推荐**: [答案 + 理由]

## 下一步计划

- [描述计划继续执行的内容]

---

**请在 `inbox/human_feedback/` 中回复此文件确认或提供反馈**
```

### 文件命名

- 需求分析完成：`inbox/human_feedback/analysis-<task-id>-<timestamp>.md`
- 开发完成：`inbox/human_feedback/dev-<task-id>-<timestamp>.md`
- 测试完成：`inbox/human_feedback/test-<task-id>-<timestamp>.md`
- 请求 Review：`inbox/human_feedback/review-<task-id>-<timestamp>.md`

---

## 项目结构

```
{{PROJECT_NAME}}/
├── .claude/                  # Claude Code 配置
│   ├── commands/             # 自定义命令
│   └── settings.json         # 权限配置
├── .eket/                    # EKET 框架
│   ├── config.yml            # Agent 配置
│   ├── state/                # 运行状态
│   ├── logs/                 # 日志
│   └── memory/               # 记忆存储
├── inbox/                    # 输入
│   ├── human_input.md        # 人类需求
│   └── human_feedback/       # Review 反馈
├── outbox/                   # 输出
│   └── review_requests/      # Review 请求
├── tasks/                    # 任务定义
└── src/                      # 源代码（按需创建）
```

---

## 配置

编辑 `.eket/config.yml` 配置 Agent 行为：
- 运行模式：`claude_code` 或 `standalone`
- 启用的能力
- 任务并发限制
- Git 和 PR 自动化设置
- Review 工作流配置

---

## Agent 快速决策树

遇到问题时，按以下流程快速决策：

```
我是谁？
├── Master → 查看 docs/MASTER-WORKFLOW.md
└── Slaver → 继续往下

当前状态？
├── 刚启动 → 运行 /eket-start，读取 .eket/IDENTITY.md
├── 有任务 → 查看 jira/tickets/<id>/，执行当前状态对应操作
└── 无任务 → 运行 /eket-status，查看可领取任务

任务执行中遇到问题？
├── 技术问题（<30分钟） → 自行解决
├── 技术问题（>30分钟） → 写入 outbox/tasks/<id>/blocker-report.md，通知 Master
├── 需求不清晰 → 运行 /eket-ask，追问相关方
└── 发现冲突/矛盾 → 上报 Master

完成当前阶段？
├── 完成分析 → 写分析报告 → 更新状态为 analysis_review → 等待 Master
├── 完成开发 → 提交 PR → 写 pr-request.md → 更新状态为 review → 等待 Master
└── 任务完成 → 写 completion-notice.md → 更新状态为 done → 领取下一个任务
```

> **参考**：完整工作流见 `docs/SLAVER-AUTO-EXEC-GUIDE.md` 和 `docs/MASTER-WORKFLOW.md`
