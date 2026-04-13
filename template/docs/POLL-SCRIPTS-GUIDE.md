# EKET 轮询脚本使用指南

**版本**: v2.1.4  
**创建日期**: 2026-04-11  
**目的**: 详细说明 Master 和 Slaver 轮询脚本的使用方法和配置选项

---

## 概述

EKET 框架为 Master 和 Slaver 实例提供了自动轮询脚本，用于定期检查系统状态、消息队列和任务进度。

| 脚本 | 用途 | 检查频率 |
|------|------|----------|
| `eket-master-poll.sh` | Master 实例轮询 | 空闲 10 分钟 / 工作 5 分钟 / 等待人类 10 秒 |
| `eket-slaver-poll.sh` | Slaver 实例轮询 | 空闲 10 秒 / 工作 5 分钟 |

---

## Master 轮询脚本

### 用途

Master 轮询脚本定期检查：
1. **PR 队列** - 待审核的 PR 请求
2. **仲裁请求** - Slaver 提交的 blocker 报告
3. **人类反馈** - 人类的决策和回复
4. **Slaver 状态** - 检查工作负载和心跳

### 使用方法

```bash
# 启动持续轮询
/eket-master-poll

# 指定轮询间隔（30 秒）
/eket-master-poll -i 30

# 只执行一次（不循环）
/eket-master-poll -o

# 查看帮助
/eket-master-poll -h
```

### 命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --interval <秒>` | 基础轮询间隔 | 10 秒 |
| `-o, --once` | 只执行一次 | - |
| `-h, --help` | 显示帮助 | - |

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_MASTER_POLL_INTERVAL` | 基础轮询间隔 | 10 |
| `EKET_MASTER_IDLE_POLL_INTERVAL` | 空闲时轮询间隔 | 600 (10 分钟) |
| `EKET_MASTER_WORK_POLL_INTERVAL` | 工作中轮询间隔 | 300 (5 分钟) |

### 动态频率调整

Master 轮询脚本根据状态自动调整检查频率：

| 状态 | 轮询间隔 | 说明 |
|------|----------|------|
| `idle` | 10 分钟 | 无待处理事项 |
| `working` | 5 分钟 | 有进行中的 Review 或仲裁 |
| `waiting_human` | 10 秒 | 等待人类决策 |

### 输出示例

```
[INFO] 2026-04-11 10:00:00 - Master 轮询脚本已就绪
[INFO] 2026-04-11 10:00:00 - Master 轮询启动
[INFO] 2026-04-11 10:00:00 - 轮询间隔：10 秒

════════════════════════════════════════════════════════════════
[INFO] 2026-04-11 10:00:00 - 轮询 #1 开始
════════════════════════════════════════════════════════════════

[CHECK] 2026-04-11 10:00:00 - 检查 PR 队列...
[INFO] 2026-04-11 10:00:00 - 发现 2 个待审核 PR

┌──────────────────────────────────────────────────────────────┐
│  待审核 PR 列表                                                 │
├──────────────────────────────────────────────────────────────┤
│  pr_FEAT-001_20260411.md                                     │
│    Ticket: FEAT-001                                          │
│  pr_FEAT-002_20260411.md                                     │
│    Ticket: FEAT-002                                          │
└──────────────────────────────────────────────────────────────┘

[CHECK] 2026-04-11 10:00:00 - 检查仲裁请求...
[INFO] 2026-04-11 10:00:00 - 无阻塞报告

[CHECK] 2026-04-11 10:00:00 - 检查人类反馈...
[INFO] 2026-04-11 10:00:00 - 无待处理的人类反馈

┌──────────────────────────────────────────────────────────────┐
│  Master 轮询摘要                                              │
├──────────────────────────────────────────────────────────────┤
│  状态：working                                               │
│  PR 待审核：2 个                                               │
│  仲裁请求：0 个                                                │
│  人类反馈：0 个                                                │
│  轮询间隔：10 秒                                               │
└──────────────────────────────────────────────────────────────┘
```

### 心跳文件

轮询脚本会定期更新心跳文件：`.eket/state/master_heartbeat.yml`

```yaml
# Master 心跳
last_check: 2026-04-11T10:00:00+08:00
status: working
pending_prs: 2
pending_arbitrations: 0
pending_human_decisions: 0
```

---

## Slaver 轮询脚本

### 用途

Slaver 轮询脚本定期检查：
1. **当前任务状态** - 进行中的任务详情
2. **PR 反馈** - Master 的 Review 结果
3. **消息队列** - 新消息通知
4. **可领取任务** - ready 状态的任务
5. **人类反馈** - 人类的决策和回复

### 使用方法

```bash
# 启动持续轮询
/eket-slaver-poll

# 指定空闲时轮询间隔（30 秒）
/eket-slaver-poll -i 30

# 指定工作时轮询间隔（10 分钟）
/eket-slaver-poll -w 600

# 只执行一次（不循环）
/eket-slaver-poll -o

# 查看帮助
/eket-slaver-poll -h
```

### 命令行选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-i, --interval <秒>` | 空闲时轮询间隔 | 10 秒 |
| `-w, --work-interval <秒>` | 工作时轮询间隔 | 300 (5 分钟) |
| `-o, --once` | 只执行一次 | - |
| `-h, --help` | 显示帮助 | - |

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `EKET_SLAVER_IDLE_POLL_INTERVAL` | 空闲时轮询间隔 | 10 |
| `EKET_SLAVER_WORK_POLL_INTERVAL` | 工作时轮询间隔 | 300 |

### 动态频率调整

Slaver 轮询脚本根据状态自动调整检查频率：

| 状态 | 轮询间隔 | 说明 |
|------|----------|------|
| `idle` | 10 秒 | 无进行中的任务，快速响应新任务 |
| `working` | 5 分钟 | 有进行中的任务，专注开发 |
| `waiting_review` | 10 秒 | 等待 PR 反馈，快速响应修改要求 |

### 输出示例

```
[INFO] 2026-04-11 10:00:00 - Slaver 轮询脚本已就绪
[INFO] 2026-04-11 10:00:00 - Slaver 轮询启动
[INFO] 2026-04-11 10:00:00 - 角色配置：frontend_dev

════════════════════════════════════════════════════════════════
[INFO] 2026-04-11 10:00:00 - 轮询 #1 开始
════════════════════════════════════════════════════════════════

[CHECK] 2026-04-11 10:00:00 - 检查当前任务状态...
[INFO] 2026-04-11 10:00:00 - 当前任务：FEAT-001

┌──────────────────────────────────────────────────────────────┐
│  任务详情：FEAT-001
├──────────────────────────────────────────────────────────────┤
│  状态：in_progress                                           │
│  优先级：P1                                                  │
│  负责人：slaver_frontend_20260411                            │
└──────────────────────────────────────────────────────────────┘

[CHECK] 2026-04-11 10:00:00 - 检查 PR 反馈...
[INFO] 2026-04-11 10:00:00 - 无待处理的 PR 反馈

[CHECK] 2026-04-11 10:00:00 - 检查消息队列...
[INFO] 2026-04-11 10:00:00 - 发现 1 条新消息

┌──────────────────────────────────────────────────────────────┐
│  新消息列表                                                   │
├──────────────────────────────────────────────────────────────┤
│  msg_20260411100000.json                                     │
│    类型：task_assigned | 来自：master | 时间：2026-04-11T10:00:00+08:00 │
└──────────────────────────────────────────────────────────────┘

[CHECK] 2026-04-11 10:00:00 - 检查可领取的任务...
  ✓ FEAT-005 - 优先级：P1, 角色：frontend_dev
  ✓ FEAT-007 - 优先级：P2, 角色：fullstack

[INFO] 2026-04-11 10:00:00 - 共 2 个 ready 任务
建议：运行 /eket-claim <ticket-id> 领取任务

┌──────────────────────────────────────────────────────────────┐
│  Slaver 轮询摘要                                              │
├──────────────────────────────────────────────────────────────┤
│  状态：working                                               │
│  当前任务：FEAT-001                                          │
│  PR 反馈：0 个                                                 │
│  新消息：1 条                                                  │
│  Ready 任务：2 个                                               │
│  轮询间隔：10 秒 (空闲) / 300 秒 (工作中)                      │
└──────────────────────────────────────────────────────────────┘
```

### 心跳文件

轮询脚本会定期更新心跳文件：`.eket/state/slaver_heartbeat.yml`

```yaml
# Slaver 心跳
last_check: 2026-04-11T10:00:00+08:00
status: working
current_ticket: FEAT-001
pending_pr_feedback: 0
new_messages: 1
ready_tasks: 2
```

---

## 使用场景

### Master 轮询场景

| 场景 | 推荐配置 |
|------|----------|
| 开发期间持续监控 | `/eket-master-poll` (默认) |
| 等待人类决策 | `/eket-master-poll` (自动 10 秒间隔) |
| 低优先级后台运行 | `/eket-master-poll -i 60` |
| 一次性状态检查 | `/eket-master-poll -o` |

### Slaver 轮询场景

| 场景 | 推荐配置 |
|------|----------|
| 等待任务领取 | `/eket-slaver-poll` (10 秒空闲间隔) |
| 专注开发中 | `/eket-slaver-poll` (自动 5 分钟间隔) |
| 等待 PR 反馈 | `/eket-slaver-poll` (10 秒快速响应) |
| 一次性状态检查 | `/eket-slaver-poll -o` |

---

## 后台运行

### tmux 后台运行

```bash
# Master 轮询后台运行
tmux new -d -s master-poll "/eket-master-poll"

# Slaver 轮询后台运行
tmux new -d -s slaver-poll "/eket-slaver-poll"

# 查看日志
tmux attach -t master-poll
tmux attach -t slaver-poll

# 停止轮询
tmux kill-window -t master-poll
tmux kill-window -t slaver-poll
```

### nohup 后台运行

```bash
# Master 轮询
nohup /eket-master-poll > master-poll.log 2>&1 &

# Slaver 轮询
nohup /eket-slaver-poll > slaver-poll.log 2>&1 &

# 查看日志
tail -f master-poll.log
tail -f slaver-poll.log

# 停止轮询
pkill -f "eket-master-poll"
pkill -f "eket-slaver-poll"
```

---

## 与其他命令的集成

### Master 轮询 + 主动工作

Master 轮询期间会自动执行主动工作（v2.1.4 新增）：
- 同步 roadmap
- 规划下阶段任务
- 拆解新需求
- 标记 Ticket 优先级

### Slaver 轮询 + 自动领取

Slaver 轮询检测到 ready 任务时，会提示运行：
```bash
/eket-claim <ticket-id>
```

---

## 故障排除

### 轮询不启动

**问题**: 脚本报错 "实例配置文件不存在"

**解决**:
```bash
# 检查实例配置
cat .eket/state/instance_config.yml

# 如未初始化，运行
/eket-start
```

### 轮询频率过高

**问题**: 轮询过于频繁，影响开发

**解决**:
```bash
# 增加轮询间隔
/eket-master-poll -i 60  # 60 秒
/eket-slaver-poll -w 600  # 工作时 10 分钟
```

### 心跳文件不更新

**问题**: 心跳文件时间戳未更新

**解决**:
```bash
# 检查轮询脚本是否运行
ps aux | grep eket-poll

# 重启轮询
pkill -f "eket-master-poll"
/eket-master-poll &
```

---

## 相关文档

- [`MASTER-HEARTBEAT-CHECKLIST.md`](./MASTER-HEARTBEAT-CHECKLIST.md) — Master 心跳检查清单
- [`SLAVER-HEARTBEAT-CHECKLIST.md`](./SLAVER-HEARTBEAT-CHECKLIST.md) — Slaver 心跳检查清单
- [`MASTER-PR-WAIT-WORK.md`](./MASTER-PR-WAIT-WORK.md) — Master 等待 PR 期间的主动工作
- [`COMMUNICATION-PROTOCOL.md`](./COMMUNICATION-PROTOCOL.md) — 消息队列通信协议

---

**维护者**: EKET Framework Team  
**版本**: v2.1.4  
**最后更新**: 2026-04-11
