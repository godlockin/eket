# TASK-255: Ticket source 枚举 — 任务来源追踪

## 元数据
- **类型**: feature
- **优先级**: P1
**状态**: in_progress
- **预估**: 0.5d
- **expertise**: rust,backend
- **来源**: DocuSeal 借鉴研究（2026-05-05）
- **参考**: DocuSeal `Submission#source` enum: invite/bulk/api/embed/mcp/link

## 背景

DocuSeal 的 `source` 字段（6 种枚举）从 Day 1 就内置渠道追踪，使得后续数据分析、差异化限流、漏斗分析都有据可查。

EKET 当前 ticket 无来源字段，无法区分「Master 拆解创建」vs「API 直接创建」vs「依赖自动解除触发」vs「手动 CLI 创建」。随着使用规模增长，这个字段的缺失会让运营数据分析盲飞。

## 需求

### 1. Source 枚举定义

```rust
// rust/crates/eket-core/src/types.rs
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, sqlx::Type)]
#[sqlx(rename_all = "snake_case")]
pub enum TaskSource {
    Master,       // Master 拆解创建（expert panel 或 heartbeat 派发）
    Api,          // HTTP API 调用创建
    Dependency,   // 依赖解除后自动触发创建（blocked_by 全完成）
    Cli,          // 用户手动 `eket task:create` 创建
    Bulk,         // 批量导入（CSV / JSON 批量创建）
    Mcp,          // MCP / AI Agent 工具调用创建（预留）
}

impl Default for TaskSource {
    fn default() -> Self { TaskSource::Cli }
}
```

### 2. 数据库 Schema 变更

```sql
-- Migration
ALTER TABLE tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'cli';
CREATE INDEX idx_tickets_source ON tickets(source);
```

### 3. 写入点

| 创建路径 | source 值 |
|---------|-----------|
| `eket task:create` CLI | `cli` |
| `eket master:heartbeat` 派发 | `master` |
| `POST /api/v1/tasks` | `api` |
| 依赖解除自动创建 | `dependency` |
| 批量导入 | `bulk` |
| MCP tool call（预留） | `mcp` |

### 4. CLI 显示

```bash
eket task:progress
# 输出增加 source 列：
# TASK-254  todo    rust    cli     HTTP Webhook Job
# TASK-255  todo    rust    master  Ticket source 枚举
```

### 5. 统计命令

```bash
eket team:status --breakdown source
# 输出：
# source      count   completed   pending
# master      42      38          4
# cli         15      12          3
# api         8       8           0
# dependency  5       3           2
```

## 验收标准

- [ ] `eket task:create` 创建的 ticket 中 `source = cli`
- [ ] `master:heartbeat` 派发的 ticket 中 `source = master`
- [ ] `POST /api/v1/tasks` 创建的 ticket 中 `source = api`
- [ ] `eket task:progress` 输出包含 source 列
- [ ] `eket team:status --breakdown source` 输出来源统计
- [ ] 数据库迁移脚本对已有 ticket 默认填 `cli`，不破坏历史数据
- [ ] `cargo test -p eket-core -- task_source` 全绿

## 依赖

无（独立功能，可并行开发）

## 分析记录

**领取时间**: 2026-05-05T12:21:14.297745+00:00
**执行者**: slaver_1776695133821_534ccf79

TODO: 填写分析结论
