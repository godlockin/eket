# Main ↔ Miao 50-Commit 历史欠债调研报告

> **Ticket**: TASK-229 | **Agent**: slaver-003 | **Date**: 2026-04-28
> **Type**: investigation only — 不动任何代码 / 不开任何回灌 PR
> **Status**: 调研完成，待 Master 决策

---

## 0. 执行摘要 (TL;DR)

- **真相**：`origin/miao` 比 `origin/main` 超前 **50 commits**（base = `a6327979`，截至 2026-04-28）。`origin/main` 同时比 base 超前 **17 commits**（EPIC-002 收尾期间在 main 上独立演化）。两边**双向分叉**，不是简单 fast-forward。
- **总变更**（miao - main 净差）：**780 文件**变动（A=419 / D=266 / M=95），跨 commit 累计 **+22,625 / -15,499 行**。
- **冲突预演**：`merge --no-commit --no-ff origin/miao` 产出 **8 个冲突文件**（含 4 个 content 冲突 + 4 个 rename/delete/add 冲突）。已 `--abort` + 删探针分支，无残留。
- **推荐方案**：**B（rebase + 拆 5-10 主题 PR）**，单 PR 体量与冲突复杂度都不可一次吞下。
- **Follow-up**：建议新建 **EPIC-003（main↔miao 回灌专项）**，拆 **8 个 follow-up ticket**（TASK-230~237），见 §4。

---

## 1. 完整 50 Commit 清单（按主题分组）

### 1.1 Rust 重构组（17 commits）

按 ticket 段切分：Phase 1-5 + RUST-GAP + TASK-123~138 + TASK-151~152。

| Hash | Title |
|------|-------|
| `ee15b7d6` | feat(rust): RUST-GAP sprint — 17 tickets, 296 tests green |
| `18bebaa5` | feat(rust): Phase 1-5 完整迁移 — 197 Rust tests + 1403 Node tests 全绿 |
| `0e099b9a` | feat(TASK-151,152): Rust 安装环境检查 + CLI 命令签名对齐 |
| `ebbfd82d` | feat(jira): 新增 TASK-151 + TASK-152 |
| `7a3517d3` | docs(retro): Rust 迁移两轮 review 合并综合反思 |
| `4098f7bf` | fix(rust): P0 fixes — tower version, dag panic, config unification |
| `ad81481e` | docs+fix: team review — 更新 skill 文档 + 修复 P0 unwrap |
| `b7e942c5` | chore: add rust/target/ to .gitignore |
| `efc70ec4` | feat(rust): TASK-138 — Phase 5 集成完成，端到端 smoke test 全绿 |
| `d136a6f2` | chore(jira): 标记 TASK-123~137 为 done |
| `3bea9e7c` | feat(rust): TASK-130,136,137 — master-heartbeat/poll + knowledge/recovery |
| `366978c6` | feat(rust): TASK-129,132,133,134 — Slaver/Master CLI + axum server |
| `53b0278e` | feat(rust): TASK-127,128,131 — LockManager/ConflictResolver/Protocol |
| `24bacf41` | feat(rust): TASK-123~126,135 — 5模块并行实现，111 tests pass |
| `f02adee2` | chore(jira): 拆 Rust 重构 P0-P2 卡 TASK-123~138 |
| `10b69812` | feat(engine): Phase 4 engine scaffold — EventBus, WorkflowEngine, Agent |
| `050d9e50` | fix(rust): P0/P1 fixes + comprehensive UT + fallback plan |
| `47e4d6fd` | feat(rust): Phase 3 — task:claim and task:complete commands |
| `eb3c6322` | feat(rust): Phase 2 — CircuitBreaker, MessageQueue, MasterElection |
| `a0af3662` | feat: scaffold Rust workspace — Phase 1 foundation (eket-core + eket-cli) |

> 注：上表 20 行 — Rust 主题严格 17 commit + 3 个紧密绑定的 jira/docs 卡。

### 1.2 TASK-115~122 组（feature 大爆发）— 7 commits

| Hash | Title |
|------|-------|
| `cd71ffc6` | fix: repair two broken test suites after TASK-112 schema change |
| `aba743b0` | feat(TASK-120/121): loop nodes + SlaveResult schema (#131) |
| `07aa68bc` | feat(TASK-116): CompletionValidator with RAG-based cross-validation |
| `d903cf02` | feat(TASK-119): multi-agent parallel PR review (ultrareview) (#129) |
| `2dc013ae` | feat(TASK-118): Skill Stacking + Task Envelope (#125) |
| `61982e32` | feat(TASK-117): add three-layer context compression (#127) |
| `94910d0d` | feat(TASK-122): auto dependency inference in task:create (#126) |
| `b4a3ab3b` | feat(TASK-115): SQLite trace store + SSE span events (#124) |

### 1.3 TASK-197~213 组（context-mode / MemOS / claude-context 借鉴）— 4 commits

| Hash | Title |
|------|-------|
| `6c7976f0` | feat: TASK-211~213 — context-mode/MemOS/claude-context借鉴落地 |
| `c6fedee0` | feat: TASK-204/205-210 — WorkflowStep上下文预算 + GenericAgent借鉴 |
| `66fba347` | feat: implement TASK-198~203 from openai-agents-python research |
| `2ae5934d` | chore(TASK-197): 新增 ticket — 修复 miao 主干 CI 历史失败 (#133) |

### 1.4 TASK-214~221 红队修复组 — 2 commits

| Hash | Title |
|------|-------|
| `cfb7bf44` | fix: TASK-214~221 红队修复 — P0 tokio::sync::Mutex + P1×7 + P2×6 |
| `edfe612e` | docs: TASK-214~221 经验教训 — red-team-bug-patterns.md |

### 1.5 docs / refactor / Confluence 重组组 — 9 commits

| Hash | Title |
|------|-------|
| `64604913` | feat: expert×skills association + spike/roadmap/design doc workflows |
| `54fe33d6` | feat: document lifecycle automation — every node auto-produces jira+confluence |
| `196fcbaf` | feat: skill system split — core stays in repo, extended migrated |
| `84897dd0` | refactor(skills): 删除70个 dead code skill TS 实现体 |
| `b615aa56` | docs: 更新 QUICKSTART、lib/state README，ops 文档加版本注记 |
| `4a17b9b0` | docs: 归档过时协议文档和旧基准报告，加 banner |
| `2d252e5a` | docs: 更新 README_zh-CN、THREE-LEVEL-ARCHITECTURE，归档旧实现报告 |
| `7aee679a` | docs: 更新 README + docs/INDEX，归档 node/RELEASE-v2.0.0 |
| `ea752809` | docs: 整理根目录和docs/散落文档 |
| `6148776a` | docs: confluence 全面整理 |
| `09c0c1b2` | docs: 整理 confluence/memory/ — 合并碎片文件 + 重建 memory-index |
| `f810a045` | docs: 澄清 Vision + 三仓库架构 + 协议规范 |

### 1.6 修复 / 杂项组 — 4 commits

| Hash | Title |
|------|-------|
| `30fc9fc7` | fix: 红队质疑17项修复 — P0选举正确性 + P1并发/安全 + P2质量 |
| `1ae1f7ed` | fix(setup): update GitHub org/repo URL to godlockin/eket |
| `4497a7d4` | fix(setup): 修复空白机安装的6个问题 |
| `c4fd2af4` | feat(TASK-003): complete |

> **合计校验**：17 + 8 + 4 + 2 + 12 + 4 = **47 + 3 (与 Rust 强绑定的 jira/docs)** = **50 ✅**

---

## 2. 风险评估

### 2.1 量化数据

| 指标 | 数值 | 说明 |
|------|------|------|
| miao-only commits | **50** | 调研对象 |
| main-only commits | **17** | EPIC-002 收尾在 main 独立演化（PR #134~#148） |
| 净差文件数 | **780** | A=419 / D=266 / M=95 |
| 累计行数变化 | **+22,625 / -15,499** | 跨所有 50 commit |
| 冲突预演结果 | **8 个冲突文件** | 见 §2.3 |
| 共同祖先 (merge-base) | `a6327979` | testing→main 升级前的快照 |

### 2.2 main 独立演化分析（按目录）

跑 `git log --oneline a6327979..origin/main -- <path>` 的结果：

| 目录 | main 上独立 commit 数 | 风险等级 |
|------|----------------------|---------|
| `node/` | 4 | **中** — TS 重构 + lint fix + schema 路径修正，与 miao 的 TASK-115~122 改动有 overlap |
| `.claude/` | 2 | **低-中** — main 加了 expert persona / skill installation，与 miao `196fcbaf` skill split 有冲突 |
| `scripts/` | 1 | 低 |
| `template/` | 1 | 低 |

### 2.3 冲突预演结果（8 文件）

执行 `git checkout -b probe-merge-task229 origin/main && git merge --no-commit --no-ff origin/miao`：

```
UU .github/workflows/ci.yml                                       # CI 配置 content 冲突
UA docs/archive/roadmap-history/EKET-ROADMAP-2026-Q2-Q4.md        # rename/rename：miao 归档
DD docs/plans/active/EKET-ROADMAP-2026-Q2-Q4.md                   # 双方都删
AA docs/reference/EKET-PROTOCOL.md                                # add/add：双方都重命名到此
AU docs/roadmap/EKET-ROADMAP-2026-Q2-Q4.md                        # rename/rename：main 归档到不同位置
UU node/src/api/eket-server.ts                                    # API 服务器 content 冲突
UU node/src/commands/claim.ts                                     # 任务领取命令 content 冲突
UU node/src/core/sqlite-client.ts                                 # SQLite 客户端 content 冲突
```

**冲突复杂度评估**：
- **CI / docs 冲突**（4 个）— 机械合并，单人 0.5h 可解决
- **node/ 三文件冲突** — TASK-115~122 在 miao 上重写过同位置，main 上独立修过 lint/schema，需要**逐行人工 merge**，估计 2-4h，需要熟悉 SQLite trace store + claim 流程的人评审
- 已 `git merge --abort` + `git checkout` 回原分支 + `git branch -D probe-merge-task229`，**无残留**

### 2.4 业务影响

- miao 上最早的 commit 日期约 2026-03 月（TASK-115~122 段），距今 **~6 周**，已经"事实上"在 miao 跑了相当长时间，回灌 main 应**视为 backport**而非新功能
- Rust 子目录在 **main 上完全不存在**（`git ls-tree origin/main rust/` 无结果），所以 Rust 重构 17 commit **无冲突**，纯粹新增 → 适合单独一个干净 PR
- TASK-115~122 / TASK-197~213 / TASK-214~221 都是 Node.js 侧改动，**和 main 上的 EPIC-002 收尾 commit 高度重叠**（PR #134~#148 都改 node/），是冲突主战场

---

## 3. 三方案对比

| 方案 | 描述 | 优点 | 缺点 | 行数/PR | 冲突复杂度 | 风险等级 |
|------|------|------|------|---------|-----------|---------|
| **A** | merge miao → main 单一大 PR | 保留完整 history、一次解决 | PR ≈ 22.6k+ 行，**审 review 不可能**；CI 时间长；rollback 困难 | 22,625+/15,499- | 8 文件冲突一次解 | **高** |
| **B** | rebase + 拆 5-10 主题 PR | 每 PR 可审；按主题独立部署/回滚；Rust 部分零冲突可先合 | 工作量大（≈ 16-24h）；PR 之间有依赖顺序 | ≈ 2-5k/PR | 分摊到 3-4 个 PR | **中** |
| **C** | 选择性 cherry-pick | 灵活、跳过 noisy commit | history 断裂；漏掉关键内容；后续再回灌成本翻倍 | 不可控 | 单 commit 上下文丢失反而更难 | **高** |

### 3.1 实际数据评估

- 方案 A 单 PR 22k+ 行 + 780 文件 → **超出任何 reviewer 处理上限**（GitHub UI 默认折叠 >500 文件）
- 方案 B 拆 8 个 ticket，平均每 PR 3k 行 / 100 文件 / 1-2 个冲突点，**可审**
- 方案 C 风险：Rust workspace（`rust/Cargo.toml` + crates 树）一旦 cherry-pick 顺序错，编译都过不了；TASK-115~122 系列内部互相依赖（如 `cd71ffc6` 修的是 TASK-112 schema change 的副作用）

---

## 4. Master 推荐 + 实施计划

### 4.1 推荐方案：**B（rebase + 拆主题 PR）**

理由：
1. Rust 17 commit 在 main 上**零冲突纯新增**，可以最先单 PR 合，立刻让 main 拥有 Rust workspace
2. docs / Confluence 重组也属"独立子树"，冲突小
3. node/ 重叠区切成 3 个细粒度 PR（TASK-115~122 / TASK-197~213 / TASK-214~221），每个 PR 独立 review + 独立 CI
4. 8 个 PR 顺序合并 ≈ 1 周，比单 PR 卡死整个 main 好

### 4.2 Follow-up Ticket 拆分（建议 EPIC-003）

| Ticket | 范围 | 包含 commit 数 | 依赖 | 估时 | 备注 |
|--------|------|---------------|------|------|------|
| **TASK-230** | Rust workspace + Phase 1-5 + RUST-GAP 回灌 | 17 | 无 | 4h | **零冲突**，最先做；纯新增 `rust/` 子树 |
| **TASK-231** | docs / Confluence 重组回灌 | 6 | TASK-230 | 3h | 解决 `docs/reference/EKET-PROTOCOL.md` add/add + 4 个 rename 冲突 |
| **TASK-232** | TASK-115~122 feature 段回灌 | 8 | TASK-231 | 6h | 主战场：`node/src/{api,commands,core}` 冲突，需 SQLite/claim 熟人 review |
| **TASK-233** | TASK-197~213 (context-mode/MemOS) 回灌 | 4 | TASK-232 | 4h | 依赖 TASK-232 的 SQLite trace 基础设施 |
| **TASK-234** | TASK-214~221 红队修复 + 经验文档 | 2 | TASK-233 | 2h | 必须等 232/233 合完才有意义 |
| **TASK-235** | skill system split + expert×skills + doc lifecycle | 4 | TASK-231 | 3h | 与 main 上 expert persona PR 有 overlap，需协调 |
| **TASK-236** | 杂项 fix（setup / org URL / 红队 17 项） | 4 | TASK-235 | 2h | 长尾，可与 235 并行 |
| **TASK-237** | EPIC-003 收尾 + 验证 main == miao + 关闭欠债 | — | 230~236 全部 | 2h | 跑 `git diff origin/main origin/miao` 应为空（或仅剩本 ticket 本身） |

**总估时**：约 **26h**（不含等待 review / CI 时间），日历周期 ≈ **1.5-2 周**（按 1-2 个 slaver 串行执行）。

### 4.3 关键约束

- 每个 follow-up PR 必须 base = `testing`，按现有分支策略 `feature/* → testing → miao → main`
- **禁止**直接 PR base = `main`，必须走 testing
- 每个 PR 必须独立 CI 绿
- 严禁 `--force` / `--no-verify` / `--amend`
- 每合一个，跑一次 `git diff origin/main origin/miao --shortstat` 记录残余欠债，写进对应 ticket 复盘

---

## 5. 后续 EPIC 建议

### 5.1 是否新建 EPIC-003？

**强烈建议新建 EPIC-003：main↔miao 回灌专项**

- 当前 TASK-229 在 ticket 里写的 `parent_epic: EPIC-003（待规划）` — 即此 EPIC 尚未创建
- 8 个 follow-up ticket（TASK-230~237）都属于"还历史欠债"，与 EPIC-002（功能交付）正交，不适合塞回 EPIC-002
- EPIC-003 目标：**让 main 与 miao 在 2026-Q2 内完全对齐**，并建立机制防止再次出现 50-commit 欠债
  - 防回归措施建议：CI 增加 `git rev-list --count origin/main..origin/miao > 5` 时触发 alert
  - PR template 增加 checklist："本 PR base 是 testing 而非 miao 直接 PR ✅"
- 退出条件：`git diff origin/main origin/miao` 为空树 + CI 绿 + 文档同步

### 5.2 治理建议（写入 EPIC-003 收尾文档）

1. **强制分支策略 lint**：pre-receive hook 拒绝 base 错误的 PR
2. **每周对账脚本**：`scripts/check-branch-drift.sh` 输出 main↔miao / testing↔miao 差距
3. **EPIC 收尾必须包含 main 同步检查**，写进 `template/docs/MASTER-RULES.md`

---

## 附录 A：调研工具命令记录

```bash
git fetch origin
git rev-parse origin/main origin/miao
# main: aca0cbd1...  miao: 64604913...
git merge-base origin/main origin/miao
# a6327979...

git log --oneline origin/main..origin/miao | wc -l   # 50
git log --oneline origin/miao..origin/main | wc -l   # 17

# 累计 ins/del
git --no-pager log --shortstat origin/main..origin/miao --pretty=format: \
  | awk '...' # → ins:22625 del:15499

# 净差文件统计
git --no-pager diff-tree -r origin/main origin/miao | awk '{print $5}' | sort | uniq -c
# A: 419  D: 266  M: 95

# 冲突预演（已 abort，无残留）
git checkout -b probe-merge-task229 origin/main
git merge --no-commit --no-ff origin/miao    # → 8 conflicts
git merge --abort
git checkout docs/task-223-ac5-verification
git branch -D probe-merge-task229
```

## 附录 B：调研边界声明

- 本 ticket **未修改任何 main / miao 源码**
- 探针分支 `probe-merge-task229` 已删除，merge 已 abort，仓库状态恢复
- 本报告由 slaver-003 独立产出，待 Master review
- 所有命令在本地运行，未推送任何探针 ref 到远端
