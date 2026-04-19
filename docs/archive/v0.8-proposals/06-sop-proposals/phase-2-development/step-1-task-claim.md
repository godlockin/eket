# Step 1: 领取任务 SOP

**版本**: 1.0.0
**最后更新**: 2026-03-23
**负责智能体**: 执行智能体

---

## 目标

领取适合的任务，启动计时器和心跳机制，加载对应的 Agent Profile。

---

## 输入

| 输入项 | 位置 | 说明 |
|--------|------|------|
| Jira tickets | `jira/tickets/` | 待领取的任务 |
| Agent Profile | `template/agents/` | 智能体配置 |

---

## 输出

| 输出项 | 位置 | 说明 |
|--------|------|------|
| 任务状态更新 | `jira/tickets/{type}/{ticket_id}.md` | 状态：in_progress |
| 计时器启动 | `.eket/state/active-tasks.log` | 任务计时记录 |
| Checkpoint | `.eket/state/checkpoints/` | task_start checkpoint |

---

## 前置条件

- [ ] 实例已启动（`/eket-start`）
- [ ] 角色已设置（`/eket-role <role>`）
- [ ] Agent Profile 已加载

---

## 详细步骤

### 1.1 查看任务列表

**命令**:
```bash
/eket-status
```

**输出示例**:
```
待领取任务 (status: ready/backlog):

  - FEAT-001: 用户注册功能 (priority: P1)
  - FEAT-002: 用户登录功能 (priority: P0)
  - BUGFIX-001: 修复登录页面崩溃 (priority: P0)
```

**任务筛选原则**:
1. **优先级优先**: P0 > P1 > P2 > P3
2. **依赖检查**: 无阻塞依赖
3. **角色匹配**: 任务标签与 Agent 角色匹配

**角色匹配表**:
| Agent 角色 | 匹配标签 |
|-----------|---------|
| `frontend_dev` | `frontend`, `ui`, `react`, `vue` |
| `backend_dev` | `backend`, `api`, `database` |
| `designer` | `design`, `ux` |
| `tester` | `test`, `qa` |
| `devops` | `devops`, `deploy`, `docker` |

---

### 1.2 检查任务状态

**命令**:
```bash
cat jira/tickets/feature/FEAT-001.md
```

**检查项**:
- [ ] 状态为 `ready` 或 `backlog`
- [ ] 无阻塞依赖
- [ ] 验收标准清晰
- [ ] 预估时间合理

**依赖检查**:
```bash
# 检查依赖任务状态
grep "^dependencies:" jira/tickets/feature/FEAT-001.md
# 输出：dependencies: FEAT-000

# 检查依赖任务是否完成
grep "^status:" jira/tickets/feature/FEAT-000.md
# 应输出：status: done
```

---

### 1.3 领取任务

**命令**:
```bash
/eket-claim FEAT-001
```

**执行流程**:
1. 更新任务状态为 `in_progress`
2. 设置负责人 (`assigned_to`)
3. 记录领取时间 (`claimed_at`)
4. 启动任务计时器
5. 创建 task_start checkpoint

**输出示例**:
```
✓ 已领取任务：FEAT-001
  状态已更新为：in_progress
  负责人：slave-004
  任务文件：jira/tickets/feature/FEAT-001.md

## v0.5: 启动任务计时器
启动任务计时器...
  - Ticket: FEAT-001
  - Slaver: slave-004
  - 开始时间：2026-03-23T10:30:00+08:00
  - 截止时间：2026-03-23T12:30:00+08:00
  - 预估时长：120 分钟

## v0.5: Slaver 权限配置
Slaver 权限控制已加载

## v0.5: 创建 Task Start Checkpoint
Checkpoint: task_start
✓ Checkpoint 已创建
```

---

### 1.4 验证任务状态

**命令**:
```bash
cat jira/tickets/feature/FEAT-001.md
```

**验证项**:
- [ ] `status: in_progress`
- [ ] `assigned_to: <your_agent_id>`
- [ ] `slaver: <your_slaver_name>`
- [ ] `claimed_at: <timestamp>`
- [ ] `开始时间：<timestamp>`
- [ ] `截止时间：<timestamp>`

---

### 1.5 记录心跳（周期性）

**目的**: 避免任务超时重置

**命令**:
```bash
./scripts/task-time-tracker.sh heartbeat FEAT-001 slave-004 "完成用户注册表单开发"
```

**心跳间隔**: ≤ 30 分钟

**心跳内容**:
- 当前进度
- 遇到的问题
- 下一步计划

---

## 常见问题处理

### 问题 1: 任务已被领取

**现象**:
```
⚠ 任务已被领取，当前状态：in_progress
```

**处理**:
1. 选择其他任务
2. 或联系当前负责人协调

### 问题 2: 依赖任务未完成

**现象**:
```
✗ 依赖任务 FEAT-000 未完成 (当前状态：ready)
```

**处理**:
1. 选择其他无依赖任务
2. 或联系 Master 协调依赖任务优先级

### 问题 3: 角色不匹配

**现象**: 任务标签与 Agent 角色不匹配

**处理**:
1. 选择匹配的任务
2. 或切换角色：`/eket-role <new_role>`

---

## 检查清单

领取任务前:
- [ ] 查看任务列表
- [ ] 检查任务状态
- [ ] 检查依赖关系
- [ ] 确认角色匹配

领取任务后:
- [ ] 状态已更新为 `in_progress`
- [ ] 计时器已启动
- [ ] Checkpoint 已创建
- [ ] 心跳机制已理解

---

## 相关文件

- [Phase 2 SOP](../phase-2-development/README.md)
- [任务时间追踪](../../../scripts/task-time-tracker.sh)
- [Slaver 权限控制](../../../scripts/slaver-permissions.sh)

---

**SOP 版本**: 1.0.0
**创建日期**: 2026-03-23
**维护者**: EKET Framework Team
