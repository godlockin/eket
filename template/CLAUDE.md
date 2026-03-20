# CLAUDE.md - EKET Agent Framework 项目指南

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

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

| 命令 | 功能 |
|------|------|
| `/eket-init` | 初始化向导（首次启动运行） |
| `/eket-status` | 查看智能体状态和任务列表 |
| `/eket-task <desc>` | 创建新任务 |
| `/eket-review [id]` | 请求 Review |
| `/eket-claim [id]` | 领取任务 |
| `/eket-help` | 显示帮助 |

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

**提交信息**: Conventional Commits
```
<type>(<scope>): <description>
```
类型：`feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**主分支**: `main`

---

## PR 描述模板

```markdown
## 关联任务
<task-id>

## 变更内容
-

## 验收标准
- [ ]

## 测试
- [ ] 单元测试通过
- [ ] 手动测试完成
```

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
${PROJECT_NAME}/
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
