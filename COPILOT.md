# COPILOT.md

> GitHub Copilot CLI 专用入口 | EKET Framework

## 概述

Copilot CLI 不支持 Skills 和 Subagent，EKET 以**单 Agent 降级模式**运行。

## 身份确认

每次启动先读 `.eket/IDENTITY.md` 确认角色。

如不存在，创建并设置为 `Slaver`（单 Agent 模式下推荐）。

## 工作流程

### 单 Agent 模式（推荐）

同时承担简化版 Master + Slaver 职责：

```
1. 读取需求 → inbox/human_input.md
2. 分析并创建任务 → jira/tickets/TASK-xxx.md
3. 执行任务 → 编码、测试
4. 提交 PR → git push + gh pr create
5. 自我 Review → 检查代码质量
6. 完成 → 更新 ticket 状态
```

### 核心命令

```bash
# 任务管理（手动执行）
cat jira/tickets/                    # 查看任务列表
grep -l "status: ready" jira/tickets/*.md  # 查找可领取任务

# Git 工作流
git checkout -b feature/TASK-xxx    # 创建分支
git add . && git commit -m "..."    # 提交
gh pr create --title "..." --body "..."  # 创建 PR

# 测试
npm test                            # 运行测试
npm run lint                        # 代码检查
```

## 行为准则

1. **先读后改** - 编辑前必须先读取文件内容
2. **小步提交** - 每完成一个逻辑单元就提交
3. **分支隔离** - 所有改动在 `feature/*` 分支
4. **测试驱动** - 先写测试，再写实现

## 限制说明

| Claude Code 功能 | Copilot 替代方案 |
|------------------|------------------|
| `/eket-start` | 手动读 `.eket/IDENTITY.md` |
| `/eket-claim` | 手动编辑 ticket 的 `assigned_to` 字段 |
| Subagent 派发 | 人工开多个会话 |
| Skills 系统 | 读本文件 + `AGENTS.md` |
| Hooks | 无替代，依赖人工检查 |

## 项目结构

```
.eket/IDENTITY.md     # 角色身份
inbox/human_input.md  # 需求输入
jira/tickets/         # 任务卡片
confluence/memory/    # 知识库
```

## 详细规则

- 完整协作规范: `AGENTS.md`
- 反模式库: `.claude/skills/eket/references/anti-patterns.md`
- Master 规则: `template/docs/MASTER-RULES.md`
- Slaver 规则: `template/docs/SLAVER-RULES.md`
