# Requirement Analysis: EPIC-003

**Epic**: main↔miao 50-commit 历史欠债回灌专项
**创建时间**: 2026-04-29
**Master**: master-001
**expert_panel**: required
**专家组记录**: [confluence/memory/main-miao-debt-investigation.md](../../../confluence/memory/main-miao-debt-investigation.md)（TASK-229 调研报告）

---

## 1. 原始诉求（原文引用）

> 同意，继续

承上文：EPIC-002 收尾推 main → miao 时发现 miao 比 main **超前 50 commits**（含 RUST-GAP / TASK-115~221 实质生产价值），main 同时独立演化 17 commits。TASK-229 调研推荐 **方案 B（rebase + 拆 8 主题 PR）**，本 EPIC 即将该方案落地实施。

诉求拆解：
1. **回灌**：把 miao 上 50 commit 的实质内容按主题拆分回灌到 main，**0 commit 丢弃**
2. **对齐**：完工后 `git diff origin/main origin/miao` 为空树（或仅剩元数据 ticket）
3. **治理**：建立机制防止再次出现 50-commit 欠债（CI alert + pre-receive hook + 周对账）

---

## 2. 受益人 × 场景矩阵

| Persona | 触发场景 | 当前痛点（证据） | 期望结果 |
|---------|---------|-----------------|---------|
| Master Agent | 推 main → miao | PR #143 失败：`refusing to merge unrelated histories`，分叉无法 ff | 回灌后 miao 永远 = main，下游推送是纯 ff |
| Slaver Agent | 在 main 上开发新功能 | main 缺 Rust workspace / TASK-115~122 基础设施，新 feature 无依赖可用 | main 拥有完整 Rust + Node 双栈基础设施 |
| Reviewer (Master) | 审 50-commit 大 PR | PR #143 单 PR 22k 行 + 780 文件，超 GitHub UI 折叠上限 | 8 个主题 PR 平均 3k 行 / 100 文件，每个可独立审 |
| 外部消费者 | 拉 main 当稳定基线 | main 落后 miao 一大截，"main 是生产分支"语义不成立 | main = miao - testing 缓冲，分支策略恢复语义 |
| 项目所有者 | 复盘技术债 | 50 commit 欠债无人记账，今天才发现 | 治理机制让欠债 ≤ 5 commit 即报警 |

## 3. 验收标准（Given-When-Then）

- **AC-1**: Given EPIC-003 启动, When 全部 8 个 follow-up ticket (TASK-230~237) 合入 main, Then `git rev-list --count origin/main..origin/miao` ≤ 1（仅剩 EPIC-003 收尾 ticket 本身或 0）
- **AC-2**: Given Rust 17 commit (RUST-GAP + Phase 1-5), When TASK-230 PR 合入 main, Then `cd rust && cargo test --workspace` 在 main 上 296 tests 全绿
- **AC-3**: Given Node 系列 (TASK-115~122/197~213/214~221), When TASK-232~234 顺序合入 main, Then `cd node && npm test` 1403+ tests 全绿，`node/src/{api/eket-server.ts, commands/claim.ts, core/sqlite-client.ts}` 三处冲突解决无回归
- **AC-4**: Given docs / Confluence 重组 (12 commit), When TASK-231 + TASK-235 合入, Then `docs/reference/EKET-PROTOCOL.md` 唯一存在（解决 add/add 冲突），归档路径 `docs/archive/roadmap-history/` 与 miao 一致
- **AC-5**: Given EPIC-003 完工, When 跑 `bash scripts/check-branch-drift.sh`（新脚本，TASK-237 交付）, Then main↔miao drift = 0，testing↔miao drift ≤ 5
- **AC-6**: Given 治理脚本上线, When CI 检测到 `origin/main..origin/miao > 5 commit`, Then GitHub Actions workflow 输出 alert 注释到 PR（非阻塞 warn）
- **AC-7**: Given 每个 follow-up PR, When base 不是 `testing` 而是 `main` 或 `miao` 直接 PR, Then pre-receive hook（或 PR template checklist）拒绝合并

## 4. 非目标（Out of Scope）

- ❌ 重写 miao 上已有的 Rust / Node 代码（仅做 rebase / 冲突解决，不改业务逻辑）
- ❌ 改动 miao 现有功能行为（回灌 = 把 miao 已稳定运行的内容搬到 main，不带新需求）
- ❌ 引入 EPIC-002 之外的新 expert / skill 模板修改
- ❌ 修改三仓分离架构（confluence / jira / code_repo 不动）
- ❌ 解决 TASK-223 P3 hotfix（MemoryMonitor 噪音 / doctor Redis 风暴 — 另开 ticket）
- ❌ 迁移历史 Master/Slaver 经验文档（仅同步 miao 上已存在的 confluence/memory）

## 5. 未知与假设

| ID | 类型 | 内容 | 阻塞级别 | 解除方式 |
|----|------|------|---------|---------|
| U-1 | 未知 | TASK-232 node/src 三文件冲突解决方案是否需要专家组 | P0 | 由 TASK-232 主理 slaver 评估冲突复杂度，超 4h 升级 Master |
| U-2 | 未知 | Rust workspace 在 main 上独立编译（无 miao 上的隐式依赖）是否真的零冲突 | P0 | TASK-230 启动前先在 probe 分支验证 `cargo test`（非阻塞探测） |
| U-3 | 未知 | docs rename/rename 冲突是否需保留 main 还是 miao 的归档路径 | P1 | 默认采用 miao 归档结构（更新），main 上的归档视为 outdated |
| U-4 | 未知 | EPIC-002 期间 main 上 17 commit 是否会 break miao 上某些 commit 的前置假设 | P1 | TASK-232~234 期间逐 ticket 验证 |
| A-1 | 假设 | miao 上 50 commit 内部依赖顺序与 git log 顺序一致 | P0 | 已通过 TASK-229 §1 主题分组验证 |
| A-2 | 假设 | 8 个主题 PR 之间依赖链单线无环 | P0 | TASK-230 → TASK-231 → TASK-232~234 → TASK-235~236 → TASK-237 |
| A-3 | 假设 | 平均每 PR 可在 1-2 天内 review + merge | P1 | 若卡 reviewer 可并行 235/236 |
| A-4 | 假设 | rebase 后 commit hash 变化不影响下游消费者（miao 上无 tag/release 引用 50 commit 中的 hash） | P1 | TASK-230 启动前跑 `git tag --contains <hash>` 校验 |

## 6. 风险与缓解

| 风险 | 可能性 H/M/L | 影响 H/M/L | 缓解策略 |
|------|--------------|-----------|---------|
| TASK-232 node/src 三文件冲突解决错误，引入 SQLite trace / claim 流程回归 | M | H | 解决冲突后必须跑 `npm test` 全量 + integration tests；CR 必须 SQLite 熟人 |
| Rust workspace 在 main 上 cargo test 偶发失败（CI 环境差异） | L | M | TASK-230 PR 必须本地 + CI 双绿才合 |
| 回灌期间 miao 上有新 commit 进来（emergency hotfix） | M | M | 启动 EPIC-003 前与团队约定 freeze miao；如必须 hotfix，走 hotfix/* → main → miao 标准流程 |
| 8 个 PR 串行合并周期 ≈ 1.5-2 周，期间 main 上又有新 commit 拖累 rebase | M | M | 每个 ticket 内 rebase 一次 testing 最新；TASK-237 收尾时再做一次最终 reconcile |
| 治理脚本（check-branch-drift / pre-receive hook）误报阻塞正常开发 | L | M | 先 warn 模式跑 1 周，confirmed 后再切 enforce |
| TASK 拆分后 commit history 不再线性，难以追溯原始 commit 作者 | L | L | rebase 时保留原 author + 原 commit message + 在 PR body 列出原 hash 索引 |

---

## 完成度自检（Master 在召集专家组前自填）

- [x] §1 原始诉求 — 已附原文 + 拆解
- [x] §2 受益人 5 行 — Master / Slaver / Reviewer / 外部消费者 / 项目所有者
- [x] §3 AC 全部 GWT 句式 — 7 条
- [x] §4 非目标 — 6 条
- [x] §5 未知/假设 — 4 未知 + 4 假设
- [x] §6 风险 — 6 项 + 缓解
