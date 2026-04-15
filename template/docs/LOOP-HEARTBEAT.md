# LOOP-HEARTBEAT.md — /loop 自动化心跳配置指南

**版本**: v1.0.0  
**适用**: EKET Master 和 Slaver 实例  
**依赖**: Claude Code `/loop` 内置命令

---

## 什么是 `/loop`？

`/loop` 是 Claude Code 的内置定时命令，可以让一个 Slash Command 按指定间隔重复执行，**无需人工干预**。

### 语法

```
/loop <interval> <slash-command>
```

| 参数 | 说明 | 示例 |
|------|------|------|
| `<interval>` | 执行间隔，支持 `s`（秒）、`m`（分钟）、`h`（小时） | `30m`, `10m`, `1h` |
| `<slash-command>` | 要循环执行的 Slash Command | `/heartbeat:master`, `/heartbeat:slaver` |

### 示例

```bash
# Master 每 30 分钟自动心跳检查
/loop 30m /heartbeat:master

# Slaver 每 10 分钟自动心跳自检
/loop 10m /heartbeat:slaver

# 临时加快频率（调试时）
/loop 5m /heartbeat:master

# 较慢频率（轻负载模式）
/loop 1h /heartbeat:master
```

---

## 推荐心跳间隔

### Master 心跳 (`/heartbeat:master`)

| 项目阶段 | 推荐间隔 | 说明 |
|---------|---------|------|
| 正常开发期 | **30 分钟** | 标准 Master 巡检频率 |
| 上线冲刺期 | 15 分钟 | 高强度期缩短间隔 |
| 轻负载/维护期 | 1 小时 | 无活跃 Slaver 时可降低频率 |
| 调试/排查期 | 5 分钟 | 快速定位积压或超时问题 |

### Slaver 心跳 (`/heartbeat:slaver`)

| 任务状态 | 推荐间隔 | 说明 |
|---------|---------|------|
| 正常执行中 | **10 分钟** | 标准 Slaver 活跃心跳 |
| 等待 PR Review | 5 分钟 | 缩短间隔，快速捕获 Review 反馈 |
| 复杂任务开发 | 15 分钟 | 减少中断，保持专注 |

> ⚠️ **重要**：Slaver 超过 30 分钟无心跳，Master 将触发超时告警。请确保 `/loop` 间隔不超过 25 分钟。

---

## 项目启动时的配置方式

### 推荐流程

**Step 1 — Master 实例启动**

```bash
# 初始化 EKET 项目
/eket-start

# 启动自动心跳（在 Master 实例执行）
/loop 30m /heartbeat:master
```

**Step 2 — Slaver 实例启动**

```bash
# 领取任务
/eket-claim <TICKET-ID>

# 启动自动心跳（在 Slaver 实例执行）
/loop 10m /heartbeat:slaver
```

### 多 Slaver 场景

每个 Slaver 实例独立启动各自的 `/loop`：

```bash
# Slaver A（frontend_dev）
/loop 10m /heartbeat:slaver

# Slaver B（backend_dev）
/loop 10m /heartbeat:slaver
```

---

## 与手动心跳检查的对比

| 维度 | 手动心跳检查 | `/loop` 自动心跳 |
|------|------------|----------------|
| **触发方式** | 人工提示"进行心跳检查" | 定时自动执行 |
| **可靠性** | 容易被遗忘，尤其在繁忙时 | 100% 按时执行，无遗漏 |
| **人力成本** | 每次需要人工介入 | 零干预，后台自动运行 |
| **发现超时** | 取决于人工提醒频率 | 间隔内必然发现 |
| **适用场景** | 临时排查、单次检查 | 长期运行的项目 |

---

## 心跳检查内容

### `/heartbeat:master` 执行的 4 项检查

1. **任务队列扫描** — 列出 `ready` 状态 ticket，识别积压
2. **Slaver 进度检查** — 查找超 30 分钟未更新的 Slaver
3. **Gate Review 卡点** — 检查 `gate_review` 状态超时
4. **Inbox 人类指令** — 检查 P0/P1/P2 未处理指令

### `/heartbeat:slaver` 执行的 3 项检查

1. **当前任务确认** — 确认 ticket ID 和状态正确
2. **依赖关系检查** — 检查 `blocked_by` 依赖是否已完成
3. **分支状态检查** — 确认未提交变更和待 PR 提交情况

---

## 常见问题

### Q: `/loop` 执行时会中断当前工作吗？

A: 不会。`/loop` 是定时任务，到达间隔时才触发。触发时 Master/Slaver 会暂时执行心跳检查，完成后继续之前的工作。

### Q: 如何停止 `/loop`？

A: 直接结束当前 Claude Code 会话，或在会话中使用 Ctrl+C 中断。

### Q: 可以同时运行多个 `/loop` 吗？

A: 不推荐在同一实例运行多个 `/loop`，会导致并发检查冲突。每个实例只运行一个 `/loop`。

### Q: 心跳检查会影响 Claude Code 的 context window 吗？

A: 会有少量 context 消耗。建议心跳命令保持简洁，避免在心跳中执行大量文件读取。

---

## 相关文档

- [`template/docs/MASTER-HEARTBEAT-CHECKLIST.md`](./MASTER-HEARTBEAT-CHECKLIST.md) — Master 完整心跳检查清单
- [`template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`](./SLAVER-HEARTBEAT-CHECKLIST.md) — Slaver 完整心跳自检清单
- [`template/.claude/commands/heartbeat-master.md`](../.claude/commands/heartbeat-master.md) — /heartbeat:master Slash Command
- [`template/.claude/commands/heartbeat-slaver.md`](../.claude/commands/heartbeat-slaver.md) — /heartbeat:slaver Slash Command
- [`template/docs/GATE-REVIEW-PROTOCOL.md`](./GATE-REVIEW-PROTOCOL.md) — Gate Review 超时处理协议

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-15
