# CODEX.md

> OpenAI Codex CLI 专用入口 | EKET Framework

## 概述

Codex CLI 不支持 Skills 和 Subagent，EKET 以**单 Agent 降级模式**运行。

## 身份确认

每次启动先读 `.eket/IDENTITY.md` 确认角色。

## 工作模式

### 推荐：Slaver 模式

Codex 擅长代码生成，推荐作为 Slaver 执行具体任务：

```
1. 读取已分配的任务 → jira/tickets/TASK-xxx.md
2. 理解需求和验收标准
3. 编码实现
4. 编写测试
5. 提交 PR
```

### 任务文件格式

```yaml
# jira/tickets/TASK-001.md
---
id: TASK-001
title: 实现用户登录
status: ready | in_progress | review | done
assigned_to: codex-agent
priority: P1
---

## 需求
...

## 验收标准
- [ ] 标准 1
- [ ] 标准 2

## 技术方案
...
```

## 核心命令

```bash
# 查找任务
find jira/tickets -name "*.md" -exec grep -l "status: ready" {} \;

# 领取任务（修改 status 和 assigned_to）
# 手动编辑 ticket 文件

# Git 流程
git checkout -b feature/TASK-001
# ... 编码 ...
git add -A && git commit -m "feat(TASK-001): 实现用户登录"
git push -u origin feature/TASK-001
gh pr create --title "feat(TASK-001): 实现用户登录"
```

## 行为准则

1. **理解优先** - 先完整理解需求再动手
2. **增量实现** - 分小步完成，每步可验证
3. **测试覆盖** - 核心逻辑必须有测试
4. **代码质量** - 遵循项目现有风格

## Codex 特有优势

- 擅长代码补全和生成
- 适合处理明确定义的编码任务
- 可快速生成样板代码和测试

## 限制与替代

| 功能 | 状态 | 替代方案 |
|------|------|----------|
| Skills | ❌ | 读 `AGENTS.md` |
| Subagent | ❌ | 人工多会话 |
| Slash Commands | ❌ | 手动执行 bash |
| Hooks | ❌ | 人工检查 |
| 自动任务派发 | ❌ | 人工分配 |

## 多 Agent 协作

如需多 Codex 实例协作：

1. 每个实例设置不同的 `agent_id`（在 `.eket/IDENTITY.md`）
2. 通过 ticket 的 `assigned_to` 字段分配任务
3. 使用 Git 分支隔离各自工作
4. 人工协调 PR review 和合并

## 参考文档

- `AGENTS.md` - 完整协作规范
- `template/docs/SLAVER-RULES.md` - Slaver 行为规则
- `.claude/skills/eket/references/anti-patterns.md` - 反模式
