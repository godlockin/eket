# EKET Agent Framework Commands

## `/eket-init`
EKET 项目初始化向导（首次启动时运行）

```bash
./.claude/commands/eket-init.sh
```

## `/eket-status`
查看当前智能体状态和任务列表

```bash
./.claude/commands/eket-status.sh
```

## `/eket-task [description]`
创建新任务或查看任务列表

```bash
./.claude/commands/eket-task.sh
```

## `/eket-review [task-id]`
请求对指定任务进行 Review

```bash
./.claude/commands/eket-review.sh
```

## `/eket-claim [task-id]`
领取指定任务

```bash
./.claude/commands/eket-claim.sh
```

## `/eket-help`
获取 EKET 帮助信息

```bash
./.claude/commands/eket-help.sh
```

---

## EKET 工作流程

1. **接收需求**: 检查 `inbox/human_input.md`
2. **分析拆解**: 将需求拆解为 tasks
3. **执行任务**: 领取任务 → 创建分支 → 开发 → 提交
4. **Review 流程**: 创建 Review 请求 → 等待反馈 → 修改/合并
5. **更新状态**: 完成任务后更新 Jira 状态

## 文件位置

| 位置 | 用途 |
|------|------|
| `inbox/human_input.md` | 人类需求输入 |
| `inbox/human_feedback/` | Review 反馈 |
| `outbox/review_requests/` | Review 请求 |
| `tasks/` | 任务定义 |
| `.eket/state/` | 状态文件 |

---

## 反馈机制（重要）

**每轮执行结束后**，必须在 `inbox/human_feedback/` 创建状态报告，等待人类确认后再继续。

### 状态报告模板

```markdown
# 任务状态报告

**任务 ID**: <task-id>
**时间**: YYYY-MM-DD HH:MM
**阶段**: <需求分析完成/开发完成/测试完成/请求 Review>
**状态**: `pending_confirmation`

## 本阶段成果

- [完成的工作和产出]

## 待确认问题

1. <问题描述>
   - 选项 A: [描述]
   - 选项 B: [描述]
   - **推荐**: [选项 + 理由]

## 下一步计划

- [计划继续执行的内容]
```

### 人类回复方式

人类在同一个文件中回复：
```markdown
## 人类反馈

- [x] 确认阶段成果
- [x] 同意推荐答案
- [ ] 需要修改：[具体说明]
```
