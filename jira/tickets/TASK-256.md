# TASK-256: Ticket 关键节点时间戳补充（claimed_at / blocked_at / unblocked_at）

## 元数据
- **类型**: feature
- **优先级**: P2
- **状态**: todo
- **预估**: 0.5d
- **expertise**: rust,backend
- **来源**: DocuSeal 借鉴研究（2026-05-05）
- **参考**: DocuSeal Submitter 时间戳隐式状态机: declined_at/completed_at/opened_at/sent_at

## 背景

DocuSeal 的 Submitter 用 4 个时间戳字段替代显式 status 枚举的方案非常干净：
- 状态自带时间戳，无需额外字段
- 优先级用代码判断顺序表达
- 天然支持「在哪个状态停留了多久」的分析

EKET 当前 ticket 已有 `created_at`，但缺少 `claimed_at`（何时被领取）、`blocked_at`（何时被阻塞）、`unblocked_at`（何时解除阻塞）。这导致无法计算：
- **等待时长**：从创建到领取的 delta（队列健康度指标）
- **阻塞时长**：依赖阻塞消耗了多少时间（关键路径分析）
- **实际执行时长**：`completed_at - claimed_at`（去除等待时间的净工时）

## 需求

### 1. Schema 变更

```sql
-- Migration
ALTER TABLE tickets ADD COLUMN claimed_at    DATETIME;
ALTER TABLE tickets ADD COLUMN blocked_at    DATETIME;  -- 最近一次被阻塞时刻
ALTER TABLE tickets ADD COLUMN unblocked_at  DATETIME;  -- 最近一次解除阻塞时刻

-- 已有字段确认
-- created_at   DATETIME NOT NULL
-- completed_at DATETIME（已有）
-- declined_at  DATETIME（对应 DocuSeal declined_at，若 ticket 被拒绝/取消）
```

### 2. 写入时机

| 时间戳 | 写入时机 |
|--------|---------|
| `claimed_at` | `eket task:claim TASK-NNN` 原子领取成功时 |
| `blocked_at` | 发现新依赖未完成、ticket 进入 blocked 状态时 |
| `unblocked_at` | `task:complete` 触发依赖解除扫描，目标 ticket 被解锁时 |
| `completed_at` | `eket task:complete TASK-NNN` Saga Step 5 完成时（已有） |

### 3. 衍生指标计算

```rust
impl Ticket {
    /// 队列等待时长（从创建到被领取）
    pub fn queue_wait_duration(&self) -> Option<Duration> {
        self.claimed_at.map(|c| c - self.created_at)
    }

    /// 净执行时长（去除等待，从领取到完成）
    pub fn execution_duration(&self) -> Option<Duration> {
        match (self.claimed_at, self.completed_at) {
            (Some(c), Some(d)) => Some(d - c),
            _ => None,
        }
    }

    /// 阻塞持续时长（最近一次阻塞段）
    pub fn blocked_duration(&self) -> Option<Duration> {
        match (self.blocked_at, self.unblocked_at) {
            (Some(b), Some(u)) => Some(u - b),
            _ => None,
        }
    }
}
```

### 4. CLI 展示

```bash
eket task:progress --verbose
# TASK-254  in_progress  created:2026-05-05 09:00  claimed:09:15  wait:15m  exec:2h30m
# TASK-255  blocked      created:2026-05-04 14:00  blocked:14:30  blocked_for:19h30m
```

```bash
eket team:status --metrics
# 平均队列等待时长: 23min
# 平均执行时长: 4h12m
# 当前阻塞总时长（所有 blocked tickets）: 38h
```

## 验收标准

- [ ] `eket task:claim` 后 ticket 的 `claimed_at` 字段被写入
- [ ] 依赖解除时 `unblocked_at` 被写入，`blocked_at` 已在阻塞时写入
- [ ] `eket task:progress --verbose` 展示各时间戳和衍生时长
- [ ] `eket team:status --metrics` 展示平均等待 / 执行 / 阻塞时长
- [ ] 迁移脚本对已有 ticket 的 `claimed_at` 填 `NULL`（不假设历史数据）
- [ ] `cargo test -p eket-core -- ticket_timestamps` 全绿

## 依赖

建议在 TASK-255（source 枚举）同批次迁移，合并一次 schema migration。
