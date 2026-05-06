# Archive Index — 已归档 Tickets

**生成时间**: 2026-05-05
**归档原因分类**: dropped（已废弃）/ superseded（被新任务取代）/ closed（主动关闭）

## 归档原则

- `dropped`：需求取消、方向变更、重复
- `superseded`：被更新版本任务取代（原任务 ID 保留在 archive/）
- `closed`：人工关闭，非完成状态

## 归档列表

| Ticket | 原状态 | 说明 |
|--------|--------|------|
| TASK-013 | dropped | GitHub Actions CI — 已有其他方案替代 |
| TASK-014 | dropped | 健康检查端点 — dropped |
| TASK-015 | dropped | Roadmap 修正 — dropped |
| TASK-024 | dropped | PR Review Checklist — dropped |
| TASK-025 | dropped | Slaver 偏差处理协议 — dropped |
| TASK-027 | dropped | ACI 接口白名单 — dropped |
| TASK-031 | dropped | settings.json 权限强制 — dropped |
| TASK-032 | dropped | 动态 Shell 注入 — dropped |
| TASK-035 | dropped | Layer 3b Hook 骨架 — dropped |
| TASK-037 | dropped | Layer 1 CLAUDE.md 拆分 — dropped |
| TASK-039 | dropped | Layer 2 进度上报模板 — dropped |
| TASK-050 | superseded | superseded |
| TASK-051 | superseded | superseded |
| TASK-052 | superseded | superseded |
| TASK-053 | closed | closed |
| TASK-054 | dropped | dropped |
| TASK-055 | superseded | superseded |
| TASK-056 | superseded | superseded |
| TASK-057 | dropped | dropped |
| TASK-061 | dropped | dropped |
| TASK-062 | dropped | dropped |
| TASK-063 | dropped | dropped |
| TASK-072 | superseded | 被 TASK-141 取代 |
| TASK-076~083 | superseded | 断路修复系列 — 被统一重构取代 |
| TASK-105a | superseded | WorktreeManager — 被 Rust 实现取代 |
| TASK-105b | superseded | worktree claim 集成 — 被 Rust 实现取代 |
| TASK-193 | dropped | dropped |
| TASK-202~204 | dropped | dropped |
| TASK-252 | closed | ruflo 借鉴研究 — closed |

## DB 同步记录

- **同步时间**: 2026-05-05
- **同步方式**: 手动执行 Python 批量 `INSERT OR REPLACE` 到 `ticket_index`
- **修正前**: done=144, todo=136（严重失真）
- **修正后**: done=158, todo=82, dropped=38, inprogress=4
- **完成率**: 59% → 70%
- **根本原因**: `node/src/commands/ticket-index.ts` `syncToSqlite()` 空实现，见 TASK-268

