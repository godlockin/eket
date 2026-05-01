**Ticket ID**: TASK-230
**标题**: [P0] File 级 Master 续约 renewal loop
**类型**: feature
**优先级**: P0

**状态**: done
**创建时间**: 2026-04-26T23:30:00Z
**最后更新**: 2026-04-26T23:45:00Z
**started_at**: 2026-04-26T23:35:00Z
**completed_at**: 2026-04-26T23:45:00Z

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

**负责人**:
**执行 Agent**:
**所属 Epic**: RUST-GAP
**所属 Sprint**: sprint-rust-gap-1
**适配角色**: backend_dev
**assigned_experts**: backend

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 创建 | Master | 2026-04-26T23:30:00Z | backlog → ready |

---

## 1. 任务描述

`election.rs` File 级 Master 无续约，TTL 到期被覆盖。

实现 `FileMaster::start_renewal_loop()`：
- interval 30s，`fs::write(.eket/master.lock, self.id)` 刷新 mtime
- 写失败（磁盘满/权限）时 resign() + 触发重选

复用 TASK-223 相同模式（SQLite/File 接口对称）。

## 2. 验收标准

- [ ] File master 持续 120s 不被抢占；验证：`cargo test -p eket-core -- file_master_renewal`
- [ ] 写失败时主动 resign；验证：`cargo test -p eket-core -- file_master_resign`

## 3. 依赖关系
### 3.1 前置：TASK-223（参照 SQLite 实现）
### 3.2 阻塞：无

## 4. 时间追踪
| 预估时间 | 360 分钟 |

## 5. 执行日志
**deferred_issues**:
