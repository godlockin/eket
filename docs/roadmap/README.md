# EKET Framework 路线图

> ⚠️ 本文档更新于 2026-04-26。历史规划文档已归档至 `docs/archive/roadmap-history/`。

---

## 当前状态（2026-04-26）

| 层级 | 状态 | 测试 |
|------|------|------|
| **Level 0 Shell** | ✅ 稳定 | — |
| **Level 1 Rust** (`eket` binary) | ✅ 迁移完成 | 253 passed |
| **Level 2 Node.js** (Web/LLM) | ✅ 保留精简 | 1519 passed |

**当前版本**：Rust 迁移后（TASK-198~221 完成，含红队修复 14 项）

---

## 已完成里程碑

| Round | 主题 | 版本 |
|-------|------|------|
| 1~9 | 初始构建 → 100% 测试 | v1.x ~ v2.6.0 |
| 10~19 | CLI / 文档 / 安全 / GSD 工程纪律 | v2.7.0 ~ v2.10.4 |
| 20~21 | Rust workspace 建立，eket-core/engine/server | — |
| 22~24 | 文档整理，协议规范化 | — |
| 25~26 | 跨项目研究借鉴（Archon/MemOS/context-mode 等） | — |
| 27 | openai-agents-python 借鉴 + GenericAgent + ContextBudget | — |
| 28 | 红队修复（TASK-214~221，P0×1 / P1×7 / P2×6） | — |

---

## 近期方向（未规划为正式 ticket）

- Rust `eket server` 与 Node.js Dashboard 完整对接
- eket-cli 高频命令实测（claim / complete / task:create）
- SDK 版本同步（Python / JS）

---

## 历史文档

- [`docs/archive/roadmap-history/v3.0-strategy.md`](../archive/roadmap-history/v3.0-strategy.md) — Round 13a 的 v3.0 战略（已超越）
- [`docs/archive/roadmap-history/EKET-ROADMAP-2026-Q2-Q4.md`](../archive/roadmap-history/EKET-ROADMAP-2026-Q2-Q4.md) — 2026-04-07 规划（Rust 迁移前）
- [`docs/archive/roadmap-history/v3-phase0.md`](../archive/roadmap-history/v3-phase0.md) — Phase 0 夯基路线图（Draft，已执行）
- [`RELEASE-POLICY.md`](RELEASE-POLICY.md) — 发布策略
