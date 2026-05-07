# TASK-230: Rust workspace + Phase 1-5 + RUST-GAP 回灌 main

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P0
- **agent_type**: rust
- **estimate_hours**: 4
- **parent_epic**: EPIC-003
- **创建时间**: 2026-04-29
- **依赖**: 无（首发）
- **assigned_experts**: tech-architect, rust-engineer

## 背景

EPIC-003 第 1 步。miao 上 17 个 Rust commit（RUST-GAP sprint + Phase 1-5 + TASK-123~138 + TASK-151/152）必须回灌到 main。`rust/` 子树在 main 上**完全不存在**，所以这批回灌**零冲突纯新增**，是最适合先做的"开胃菜"。

## 详细描述

回灌范围（17 commit，按 hash 顺序）：
- `a0af3662` Phase 1 scaffold (eket-core + eket-cli)
- `eb3c6322` Phase 2 (CircuitBreaker / MessageQueue / MasterElection)
- `47e4d6fd` Phase 3 (task:claim / task:complete)
- `10b69812` Phase 4 (EventBus / WorkflowEngine / Agent)
- `efc70ec4` Phase 5 (端到端 smoke test)
- `24bacf41`~`3bea9e7c` TASK-123~137 模块实现
- `0e099b9a` TASK-151,152 (Rust 安装环境检查 + CLI 命令签名对齐)
- `ee15b7d6` RUST-GAP sprint (296 tests 全绿)
- `4098f7bf` / `ad81481e` / `050d9e50` P0 修复
- `b7e942c5` `.gitignore`
- `7a3517d3` retro 文档
- `d136a6f2` / `f02adee2` / `ebbfd82d` jira 卡

## 实施步骤

1. 从 testing 拉新分支 `feature/epic-003-rust-backport`
2. 按时间顺序 cherry-pick 17 commit（保留原 author / commit message）
3. 验证 `cd rust && cargo test --workspace` 296 tests 全绿
4. 验证 `cd rust && cargo build --release` 无 warning
5. PR base = testing，CR 通过后 → main → miao

## 验收标准

- [ ] AC-1: 17 commit 全部 cherry-pick 到 testing，无丢失
- [ ] AC-2: `cd rust && cargo test --workspace` 在 testing 上 296 tests 全绿
- [ ] AC-3: `cd rust && cargo build --release` 无 warning
- [ ] AC-4: PR body 列出原始 17 个 commit hash 索引
- [ ] AC-5: 合入 main 后 `git ls-tree origin/main rust/` 非空

## observability
- logs: ["epic003.rust.backport_completed"]
- metrics: ["rust.test.pass_count", "rust.commit.backport_count"]

## rollback_plan

PR 单一回灌，revert PR 即可彻底移除 `rust/` 子树。Rust 子树独立于 Node 主代码，rollback 不影响 Node 业务。

## test_strategy
- unit: cargo test --workspace 296 tests
- integration: cd rust && cargo test --release --tests
- regression: Node 侧 npm test 不受影响（无交叉依赖）

---

**类型**: Feature (回灌)
**技能要求**: Rust / cargo / git cherry-pick
**依赖**: 无
**assigned_experts**: tech-architect, rust-engineer

<!-- machine-readable fields -->
agent_type: rust
estimate_hours: 4
