# POLL-001: 创建 Master 和 Slaver 轮询脚本

**类型**: feature  
**优先级**: P1  
**状态**: done  
**适配角色**: master, slaver  

---

## 需求描述

为 Master 和 Slaver 实例创建自动轮询脚本，用于定期检查系统状态、消息队列和任务进度，无需手动运行检查命令。

---

## 验收标准

- [x] Master 轮询脚本支持检查 PR 队列、仲裁请求、人类反馈、Slaver 状态
- [x] Master 轮询支持动态频率调整（空闲/工作/等待人类）
- [x] Slaver 轮询脚本支持检查当前任务、PR 反馈、消息队列、可领取任务
- [x] Slaver 轮询支持动态频率调整（空闲/工作/等待 PR）
- [x] 两个脚本都支持命令行参数和环境变量配置
- [x] 两个脚本都支持一次性执行和持续轮询模式
- [x] 轮询期间更新心跳文件
- [x] 创建完整的使用文档

---

## 实现内容

### 创建的文件

| 文件 | 用途 |
|------|------|
| `.claude/commands/eket-master-poll.sh` | Master 轮询脚本 |
| `.claude/commands/eket-slaver-poll.sh` | Slaver 轮询脚本 |
| `docs/POLL-SCRIPTS-GUIDE.md` | 轮询脚本使用指南 |

### 更新的文件

| 文件 | 变更 |
|------|------|
| `CLAUDE.md` | 添加 `/eket-master-poll` 和 `/eket-slaver-poll` 命令 |

---

## Master 轮询脚本功能

### 检查项目

1. **PR 队列检查**
   - 统计待审核 PR 数量
   - 检测超时 PR（>30 分钟）

2. **仲裁请求检查**
   - 检查 blocker 报告
   - 检测超时仲裁（>30 分钟）

3. **人类反馈检查**
   - 检查人类回复的决策请求
   - 检查新需求输入

4. **Slaver 状态检查**
   - 检查空闲 Slaver
   - 检测无响应的 Slaver（>30 分钟）

5. **项目状态更新**
   - 每 10 分钟更新 ticket 索引
   - 每 10 分钟生成项目状态报告

### 动态频率

| 状态 | 轮询间隔 |
|------|----------|
| idle（空闲） | 10 分钟 |
| working（工作中） | 5 分钟 |
| waiting_human（等待人类） | 10 秒 |

### 使用方法

```bash
# 持续轮询（默认）
/eket-master-poll

# 指定间隔
/eket-master-poll -i 30

# 只执行一次
/eket-master-poll -o
```

---

## Slaver 轮询脚本功能

### 检查项目

1. **当前任务状态**
   - 显示任务详情
   - 检查阻塞关系

2. **PR 反馈检查**
   - 检查 Master Review 结果
   - 显示审核结果（approved/changes_requested/rejected）

3. **消息队列检查**
   - 显示新消息列表
   - 识别任务分配消息

4. **可领取任务检查**
   - 显示 ready 状态任务
   - 角色匹配检查

5. **人类反馈检查**
   - 检查最新人类反馈
   - 识别 Slaver 相关内容

### 动态频率

| 状态 | 轮询间隔 |
|------|----------|
| idle（空闲等待） | 10 秒 |
| working（工作中） | 5 分钟 |
| waiting_review（等待 PR） | 10 秒 |

### 使用方法

```bash
# 持续轮询（默认）
/eket-slaver-poll

# 指定空闲间隔
/eket-slaver-poll -i 30

# 指定工作间隔
/eket-slaver-poll -w 600

# 只执行一次
/eket-slaver-poll -o
```

---

## 心跳文件

### Master 心跳文件

位置：`.eket/state/master_heartbeat.yml`

```yaml
last_check: 2026-04-11T10:00:00+08:00
status: working
pending_prs: 2
pending_arbitrations: 0
pending_human_decisions: 0
```

### Slaver 心跳文件

位置：`.eket/state/slaver_heartbeat.yml`

```yaml
last_check: 2026-04-11T10:00:00+08:00
status: working
current_ticket: FEAT-001
pending_pr_feedback: 0
new_messages: 1
ready_tasks: 2
```

---

## 环境变量配置

### Master 环境变量

```bash
export EKET_MASTER_POLL_INTERVAL=10          # 基础轮询间隔
export EKET_MASTER_IDLE_POLL_INTERVAL=600     # 空闲时轮询间隔
export EKET_MASTER_WORK_POLL_INTERVAL=300     # 工作中轮询间隔
```

### Slaver 环境变量

```bash
export EKET_SLAVER_IDLE_POLL_INTERVAL=10      # 空闲时轮询间隔
export EKET_SLAVER_WORK_POLL_INTERVAL=300     # 工作中轮询间隔
```

---

## 后台运行示例

### tmux 方式

```bash
# Master 轮询
tmux new -d -s master-poll "/eket-master-poll"

# Slaver 轮询
tmux new -d -s slaver-poll "/eket-slaver-poll"

# 查看日志
tmux attach -t master-poll
tmux attach -t slaver-poll
```

### nohup 方式

```bash
# Master 轮询
nohup /eket-master-poll > master-poll.log 2>&1 &

# Slaver 轮询
nohup /eket-slaver-poll > slaver-poll.log 2>&1 &

# 查看日志
tail -f master-poll.log
tail -f slaver-poll.log
```

---

## 相关文档

- [`POLL-SCRIPTS-GUIDE.md`](./POLL-SCRIPTS-GUIDE.md) — 轮询脚本完整使用指南
- [`MASTER-HEARTBEAT-CHECKLIST.md`](./MASTER-HEARTBEAT-CHECKLIST.md) — Master 心跳检查清单
- [`SLAVER-HEARTBEAT-CHECKLIST.md`](./SLAVER-HEARTBEAT-CHECKLIST.md) — Slaver 心跳检查清单
- [`COMMUNICATION-PROTOCOL.md`](./COMMUNICATION-PROTOCOL.md) — 消息队列通信协议

---

**创建者**: Master Agent  
**创建时间**: 2026-04-11  
**完成时间**: 2026-04-11
