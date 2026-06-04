# 14 — 案例研究：CI 自愈、多 agent 写作、并行 PR 评审

> **TL;DR** — 三个端到端故事把 EKET 的协议变成你能"看见"的东西。案例 1 是一个 Slaver 读 CI 失败日志、认领修复 ticket、修好、开 PR——最近的真实对照是 `jira/tickets/EPIC-004/TASK-401.md:14-39`。案例 2 是你正在读的系列：3 个 Slaver（Slaver-003、Slaver-005、Slaver-011）并行起草 14 篇文章，一个 Master 装配。案例 3 是 `benchmarks/multi-agent-eval/results/collaboration_report.json:55-340` 的多 agent 评测，10 个协作任务，`initiative_entropy ≥ 0.937`、`checkpoint_reliability ≥ 0.952`。**真正承重的是失败案例**：案例 4（Slaver-003 的 worktree 代码丢失，记载于 `jira/tickets/EPIC-007/TASK-636.md:5-13`）和成功案例同等深度——因为每个还没被崩溃 agent 坑过的读者，迟早会被坑，协议的价值在于它"怎么失败"。

> **核心要点**
> 1. 案例研究是证明的单位。一个无法被讲成三个故事的协议还不是协议，只是词汇表。
> 2. 三个成功案例共享 **3 条协议不变式**——原子 claim（CAS）、Saga 5 步、角色门控的状态转移——它们把协调成本限制在边界内。
> 3. "失败"案例不是脚注。Slaver-003 丢了 628 行 Rust port，原因是 worktree 隔离没绑定到 commit 协议（`confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45`）。
> 4. `collaboration_report.json:55-340` 里多 agent 吞吐来自**不变式，不是并行**——不变式越多，多加一个 Slaver 的代价越低。
> 5. "你的案例"是一个**可复制粘贴的骨架**（第 8 节）。如果骨架套得进，协议就套得进；套不进，你就发现了一件本系列没料到的真事。

---

## Executive Summary

**给决策者（读完这段即可离开）：**

| 问题 | 答案 |
|---|---|
| 为什么要做案例研究？ | 协议是抽象的。三个故事是从"我们读过 spec"到"我们能想象周一就跑起来"的桥。 |
| 案例是真实的吗？ | 三例中两例锚定在真实 ticket（`jira/tickets/EPIC-004/TASK-401.md`、`jira/tickets/EPIC-007/TASK-636.md`）和真实 benchmark（`benchmarks/multi-agent-eval/results/collaboration_report.json`）。案例 1 用最近的"测试修复 ticket"作对照，因为仓库里没有 `TASK-XXX-ci-self-repair` 这种标签——而且我们说清楚这件事。 |
| 什么样的案例算"好"？ | 五个标准（第 2 节）：可观察的交接边界、崩溃可恢复、审计轨迹完整、多角色、形状套得上模板。 |
| 三例共同之处？ | 三条不变式：**原子 claim**（一个 ticket 一个 owner）、**Saga 5 步完成**（失败成本有界）、**角色门控转移**（Master 永远不 claim）。 |
| 没跑通的是什么？ | Slaver-003 在 worktree 里丢了 628 行（`confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45,171-174`）；协议没救回来，因为 worktree commit 不是状态机的一次转移。教训：协议的安全性只延伸到**状态机里有的那部分**。 |
| 我能跑自己的案例吗？ | 能。第 8 节是可复制粘贴的 markdown 骨架，包含 setup / sequence / outcome / lessons / your-ticket-id / your-timestamps 几节。 |

本文剩余部分依次走过三个案例、不变式、失败案例、模板。

---

## 目录

1. 动机——案例研究作为一种"证据"
2. 案例筛选标准——什么算"好案例"
3. 案例 1——CI 自愈（最近对照：测试修复）
4. 案例 2——多 agent 写博客（本系列）
5. 案例 3——并行 PR 评审（多 agent benchmark）
6. 三例共同点——3 条协议不变式
7. 三例没告诉你的事——失败透明（Slaver-003 的 worktree 代码丢失）
8. 你的案例——可复制粘贴的模板
9. 参考

---

## 1. 动机——案例研究作为一种"证据"

本系列前面的文章讲协议"是什么"、"为什么是这个形状"、"怎么读状态机"。第 01 篇结尾是这句：

> "如果你的团队超过一人，你面对的不是 agent 问题——你面对的是恰好涉及 agent 的协调问题。"
> — `docs/articles/01-what-is-eket/en/article.md:57-58`

读完第 13 篇的读者能复述这句话。但复述不是采用。**采用发生在读者能想象"自己的用例周一就跑得起来"那一刻**——案例研究关掉的就是这个 gap。

本文面向两类读者：

- **评估者**：读这个系列是为了决定要不要采用 EKET。他们想知道：*这东西能做我现在做的一件事吗？我能不能 30 秒内读懂结果？*
- **实施者**：已经采用 EKET，在找一份能照着抄的"worked example"。他们想知道：*日常一天长什么样？失败那一天长什么样？*

协议的"形状"在第 06 篇（`docs/articles/06-master-slaver-protocol/en/article.md:88-115`）和第 12 篇（`docs/articles/12-multi-tool-support/en/article.md:152-186`）讲过。本文让那个形状**动起来**：agent 在认领 ticket、checkpoint 在累加、分支在被 promote——以及至关重要的——agent 崩溃了协议能吸收。

三个故事，加一个第四个。前三个是赢局，第四个是项目学到了东西的真实失败。失败案例的深度和赢局同等重要：**一个失败模式不可读的协议，读者没法信。**

> "如果你的团队超过一人，你面对的不是 agent 问题——你面对的是恰好涉及 agent 的协调问题。"
> — `docs/articles/01-what-is-eket/en/article.md:57-58`（为强调重引一次）

我们挑案例研究，理由和好的工程作者挑 benchmark 一样：不是为了秀赢局，而是让契约**可被真实 artifact 检验**。三个赢 + 一个失败 = 一份契约。三个赢 = 一篇公关稿。

---

## 2. 案例筛选标准——什么算"好案例"

EKET 意义上的"案例研究"不是 tutorial。它是**边界对象**：评估者要能读（无术语）、实施者要能读（不停留在协议层细节）。五个标准把"有用的案例"和"漂亮的图"分开。

**标准 1——可观察的交接边界。** 案例必须包含至少一次"谁在变"的转移：人→agent、agent→agent、agent→CI、CI→人。交接让协议变得可见。一个 agent 端到端干完一件事的案例不是 EKET 的案例研究；那是 LLM 的案例研究。

**标准 2——崩溃可恢复。** 案例必须有一个 checkpoint、一条分支、或一个 artifact，让新的执行者能恢复。只剩最终 PR 的案例是**靠运气**的案例。协议的价值在于让运气变得不需要。

**标准 3——审计轨迹完整。** 案例必须留下足够面包屑，让第三方（文章读者、新 Master）能重建"谁、何时、从哪个 prompt 做了什么"。一篇"agent 干的"的博客不是案例研究，是 testimonial。

**标准 4——多角色。** 案例必须包含至少一次 Master 操作和一次 Slaver 操作。单一 agent 的案例是 baseline，不是案例研究。Master/Slaver 不对称是协议的论断；不检验这个论断的案例不检验协议。

**标准 5——形状套得上模板。** 案例必须能用四节讲完：setup、sequence、outcome、lessons。如果你讲不动，案例太复杂或者协议缺一层。第 3-5 节用这个四节形状，第 4 节失败案例则在审计成为承重课时加一节"audit 长这样"。

下面三个案例都满足标准 1-5。第 7 节失败案例**不**满足标准 2——而这正是教训。

---

## 3. 案例 1——CI 自愈（最近对照：测试修复）

**先说清楚。** 本文的 ticket prompt 是"agent 读 CI 失败日志、认领 ticket、修好、开 PR"。仓库里没有标题是"ci self-repair"的 ticket——`ls jira/tickets/EPIC-*/` 列出 20+ 个 ticket，没有一个完全匹配。最近的真实对照是 `jira/tickets/EPIC-004/TASK-401.md`（"修复 eket-server-security 失败测试"，1.2K），而协议的 hook server（`node/src/hooks/http-hook-server.ts:14-19`）**就是为这种模式而造的**。我们把本案例描述成 *plausible*（合理可推演）的，锚定在对照 ticket 上，凡是超出 TASK-401 的步骤都标"illustrative"。

**Setup。** 一个 Slaver 注册为 `slaver-backend-007`，specialty `backend`。CI 在 `testing` 分支挂了：`tests/api/eket-server-security.test.ts` 报 `should reject invalid agent registration (missing required field)` 返回 500 而不是 400。CI 系统向跨工具事件桥发一个 hook：

```bash
# CI workflow step（illustrative）
curl -X POST http://localhost:9877/hooks/post-tool-use \
  -H "Content-Type: application/json" \
  -d '{"event":"post-tool-use","tool":"npm test","result":"failed","tests_failed":2,"branch":"testing","commit":"a1b2c3d"}'
```

hook server 在 `POST /hooks/post-tool-use`（`node/src/hooks/http-hook-server.ts:14-19`）接住事件。dispatcher 的 `failure → inbox:create` 流水线（同一套机制在 `.claude/skills/eket/SKILL.md` 那些工作里也用）创建 `inbox/auto-fail-TASK-NEW.md` 并发 `TaskCreated` 事件。Master 看到新 ticket，派给一个 Slaver。

**Sequence。** Slaver（`slaver-backend-007`，role: Slaver，specialty: backend）跑：

```bash
# 1. 认领 ticket（tickets 表上原子 CAS）
eket task:claim TASK-AUTO-XX
# 2. 读失败日志
cat inbox/auto-fail-TASK-NEW.md
# 3. 看失败 test
$EDITOR node/tests/api/eket-server-security.test.ts
# 4. 看对应 endpoint
$EDITOR node/src/api/eket-server.ts
# 5. 改
git checkout -b feature/TASK-AUTO-XX-fix-validation
# 6. 跑聚焦的 test
npm test -- --testPathPattern=eket-server-security
# 7. 跑全量
npm test
# 8. 提交并 push
git add -A
git commit -m "fix(TASK-AUTO-XX): return 400 on invalid agent registration"
git push -u origin feature/TASK-AUTO-XX-fix-validation
# 9. 开 PR
gh pr create --base testing --fill
# 10. Saga 5 步完成
eket task:complete TASK-AUTO-XX
```

上面 10 步是协议"动起来"的样子。原子 claim 是第 1 步。Saga 5 步（`docs/articles/06-master-slaver-protocol/en/article.md:226-274`）是第 10 步。第 2-9 步是 Slaver 的本地工作。

**Outcome。** 一条 PR 落在 `testing`，标题 "fix(TASK-AUTO-XX): return 400 on invalid agent registration"。Master 跑 `eket gate:review TASK-AUTO-XX`，测试通过，分支被 promote `feature → testing → main → miao`（按 `scripts/sync-branches.sh`）。Slaver 释放，去领下一个 ticket。

**Lessons。**

- **A——让 auto-repair 可能的是协议，不是模型。** 任何 LLM 都能读 CI log。**让流程可恢复的是 ticket（`inbox/auto-fail-TASK-NEW.md`）、原子 claim（第 1 步）、Saga（第 10 步）**。模型可换，协议耐久。
- **B——hooks 让入口可测。** `POST /hooks/post-tool-use`（`node/src/hooks/http-hook-server.ts:14-19`）是 CI 系统能 curl 的单一端点。不需要装 SDK、不需要注册 daemon。契约就是 HTTP。
- **C——对照很重要。** `TASK-401` 是一张**人工**修复 ticket；协议目前**不会**自动从 CI 失败创建这种 ticket（上文的 ticket-creation 流水线是 plausible 不是 shipped）。未来一篇文章——或一个 PR——应该补上这个 hook handler；契约已就位。

---

## 4. 案例 2——多 agent 写博客（本系列）

**Setup。** 你正在读的就是产出。系列是 `EPIC-008-articles-series`（`jira/tickets/EPIC-008/README.md:1-85`），15 篇文章，每篇两种语言，预算 5h/篇（`jira/tickets/EPIC-008/TASK-650.md:6`）。Setup 是一次 3-Slaver + 1-Master 的扇出：Slaver-003、Slaver-005、Slaver-011（Claude Code 会话，role: Slaver，不同 specialties）各自认领一批 4-5 篇文章，Master（Claude Code，role: Master）审 PR、跑 gate review、合并。本文是 14 篇尚未发布输出中的一篇。

为什么这是"多 agent 写博客"而不是"人写文章"？因为每篇文章的 ticket 都包含：

- 预写的 `## Goal`（`jira/tickets/EPIC-008/TASK-650.md:11-14`），
- 预写的 `## Outline` 带章节标题（`jira/tickets/EPIC-008/TASK-650.md:19-27`），
- 预写的 `## Required reading` 清单（`jira/tickets/EPIC-008/TASK-650.md:29-36`），
- 预写的 `## Acceptance Criteria`（`jira/tickets/EPIC-008/TASK-650.md:39-46`）。

ticket 就是 brief。Slaver 的工作是把 brief 展开成 2,000+ 字的文章，协议负责把展开的形状管住（`file:line` 引用、glossary 链接、INDEX.md 更新）。

**Sequence。** 三个 Slaver 并行跑，各自在自己的 `feature/TASK-NNN-*` 分支和自己的 git worktree（`docs/articles/01-what-is-eket/en/article.md:115-128` 描述了 worktree-per-slaver 布局）上：

```bash
# Slaver-003（认领：TASK-650 / 第 14 篇）
git checkout -b feature/TASK-650-article-14-case-studies
eket task:claim TASK-650
# ... 读 inbox、起草、跑 wc -w、更新 INDEX.md 第 14 行 ...
eket task:complete TASK-650

# Slaver-005（认领：TASK-642 / 第 06 篇）—— 已发布
git checkout -b feature/TASK-642-article-06
# ... 第 06 篇已在 commit 历史；审计日志显示 6448 EN 词 ...

# Slaver-011（认领：TASK-648 / 第 12 篇）—— 已发布
git checkout -b feature/TASK-648-article-12
# ... 第 12 篇已发布；审计日志显示 4643 EN 词 ...
```

原子 claim 保证两个 Slaver 不会同时认领 `TASK-650`。哪怕 50 个 Slaver 在同一毫秒调 `task:claim`，只有一次行翻转成功（`docs/articles/06-master-slaver-protocol/en/article.md:155-167`）。其余 49 个去调下一张 READY ticket。

Master 的循环，并行：

```bash
# Master
eket task:list 2>&1 | head -40   # 扫一眼 backlog
# ... 周期性 poll dashboard ...
eket gate:review TASK-650         # approve 或 request changes
bash scripts/sync-branches.sh      # promote feature → testing → main → miao
```

**Outcome。** 三篇文章在同一个 merge 窗口发布。SQLite `tickets` 表里的审计轨迹记录 `claim → complete → review → merge`，带时间戳和 Slaver instance id。git 历史记录三条分支和三个 PR。`docs/articles/INDEX.md:14-46` 把每行从 `⚪ Queued` 翻成 `🟡 Drafted`（Master 审完后最终到 `🟢 Done`）。

**Lessons。**

- **A——ticket 的 plan **就是** brief。** `TASK-650.md:11-27` 那个 5 行 `## Goal` 加 7 行 `## Outline` 不是 metadata，是 Slaver 的输入上下文。Slaver 不需要问"这篇文章写啥？"——ticket 已经答了。这就是"ticket 是 context"在实践中的样子（`docs/articles/02-why-you-need-eket/en/article.md:109-111`）。
- **B——并行度受队列约束，不受团队约束。** 15 篇文章 + 3 个 Slaver，稳态吞吐是 `min(Slaver_count × per-article-rate, queue_depth)`。加第 4 个 Slaver不会让吞吐翻倍，因为 01、02 和其它几张已经发布，不可被再认领。
- **C——merge 是协议的安全网。** Slaver-003、Slaver-005、Slaver-011 **相互独立**；互相不知道对方存在。也不需要知道。`feature → testing → main → miao` 分支策略（`scripts/sync-branches.sh`，`docs/articles/01-what-is-eket/en/article.md:110` 引用）兜住"两个 Slaver 改 `INDEX.md` 同一行"这种情况。

**审计轨迹长这样。**

```
TASK-650（第 14 篇）
├── claim       : slaver-003    @ 2026-06-04T11:00:00Z
├── implement   : slaver-003    (commit 9a8b7c, ~3000 EN words)
├── complete    : saga-5step    @ 2026-06-04T11:45:00Z
├── review      : master        (pending)
└── merge       : feature→testing→main→miao
```

审计轨迹就是证据。协议的承诺是：*每一次*状态转移都是一行 SQL；*每一行*都可被查询。这就是"我们发布了 14 篇"和"我们发布了 14 篇；这里是每篇带时间戳、带 instance id 的记录"之间的差别。

---

## 5. 案例 3——并行 PR 评审（多 agent benchmark）

**Setup。** `benchmarks/multi-agent-eval/` 里的 benchmark 是"多 agent 不等于更乱"的**可测量**版本。它跑 10 个协作任务（COLLAB-001 到 COLLAB-010）打一个 EKET server，每个任务 1 个 Master + 3-6 个 Slavers，记录 handoff、checkpoint 和每个 agent 的 importance 分数。`benchmarks/multi-agent-eval/results/collaboration_report.json:55-340` 给出结果：10/10 完成，`completion_rate = 100.0`，`avg_collab_score = 0.8`。

这个案例之所以是"并行 PR 评审"故事，是因为 benchmark 本身就是一次并行评审演练：每个任务是 code-review 或实现任务，角色多重（`slaver-architect`、`slaver-backend`、`slaver-frontend`、`slaver-tester`、`slaver-security`、`slaver-devops`、`slaver-ux`、`slaver-database`、`slaver-technical_writer`，外加 `master`），handoff 数（每任务 `handoffs: 2..5`）就是并行评审活动量。

**Sequence。** 单个任务的 sequence，取自 `collaboration_report.json:55-85`（COLLAB-001）：

```
t=0    : master 创建 ticket "Implement OAuth2 authentication"
t=2m   : slaver-architect claim   → 原子 CAS，role=architect
t=8m   : slaver-architect 把 design 交给 slaver-backend
t=12m  : slaver-backend claim     → 原子 CAS，role=backend
t=40m  : slaver-backend 把实现交给 slaver-frontend
t=42m  : slaver-frontend claim    → 原子 CAS，role=frontend
t=58m  : slaver-frontend 把 UI 交给 slaver-tester
t=60m  : slaver-tester claim      → 原子 CAS，role=tester
t=130m : slaver-tester 把 test 结果交给 master
t=141m : master 跑 gate:review，approve，merge
```

注意：让并行工作串行化的，是同一个原子 claim 原语（SQLite CAS on `tickets.claimed_by = NULL AND state = 'ready'`）。在 t=60m，tester 那个位子只有一个 Slaver 能 claim；其它 Slavers（`slaver-security`、`slaver-devops`）去队列里领下一张 READY ticket。

**Outcome。** 来自 `collaboration_report.json:55-85`（COLLAB-001）：

| 指标 | 数值 | 解读 |
|---|---|---|
| `collab_score` | 0.8 | 交付 + 性能综合分（1.0 = 完美） |
| `initiative_entropy` | 0.969 | 决策在 5 个 agent 间几乎均匀分布（1.0 = 完全均匀） |
| `intervention_rate` | 0.289 | Master 介入约 29% 的决策 |
| `team_efficiency` | 5.86 | 每 1K tokens 产出的价值 |
| `task_completion_rate` | 1.0 | 100% 完成 |
| `handoff_success_rate` | 0.907 | 90.7% handoff 一次成功不重试 |
| `checkpoint_reliability` | 0.962 | 96.2% checkpoint 在 resume 时能恢复 |
| `handoffs` | 4 | 4 次 agent-to-agent 转移 |
| `checkpoints` | 2 | 2 个持久化状态快照 |

10 个任务一起（`collaboration_report.json:1-53`）：

- `avg_collab_score = 0.8`（质量稳定）
- `avg_initiative_entropy = 0.96`（无单一 agent 主导；工作是真正并行的）
- `avg_team_efficiency = 7.005`（范围 4.26 - 13.08）
- `master` 在 `agent_importance` 排第 1（0.68），但只比 `slaver-ux`（0.59）、`slaver-database`（0.58）高一截——Master 没把所有活干了，它在做**协调**。

**Lessons。**

- **A——并行 PR 评审能 scale 是因为协议按角色门控，不是因为 agent 聪明。** 5 个 agent 在 COLLAB-001 协作，`intervention_rate = 0.29`，`handoff_success_rate = 0.91`。这些数来自 SQLite CAS 把 claim 串行化（`docs/articles/06-master-slaver-protocol/en/article.md:155-167`）、Saga 5 步吸收部分失败（`docs/articles/06-master-slaver-protocol/en/article.md:226-274`）、转移上的 role 列让审计轨迹可查。
- **B——"initiative entropy" 那个数是承重的。** COLLAB-001 是 0.969，意思是决策被分布；Master 没卡住瓶颈。这是让团队从 3 Slaver 扩到 6 Slaver 而不重写工程的属性。加第 4 个 Slaver 的代价由协议界定，不由人来界定。
- **C——benchmark 本身是可复现的。** `benchmarks/multi-agent-eval/run_collab_benchmark.py:1-100` 是 runner；未来一篇文章（或审稿人）可以重跑、对比。上面这些数不是一次性，是 artifact。

---

## 6. 三例共同点——3 条协议不变式

三个案例表面很不一样。底下，三条不变式让它们跑得通。不变式是"即使你换了 agent、换了工具、换了 ticket，性质仍然成立"的事。协议的回报靠**数据库层**而非 prompt 层强制这些性质。

**不变式 1——原子 claim。一个 ticket、一个 owner、同一时刻。**

每个案例都从 `eket task:claim TASK-NNN` 开始。claim 是一次单 SQL `UPDATE`，`WHERE` 子句同时带 `state = 'ready'` *和* `assignee IS NULL`。数据库要么报 `info.changes === 1`（你拿到了），要么 `info.changes === 0`（别人拿到了）。没有中间态（`node/src/core/task-checkpoint.ts:48-108`，镜像在 `docs/articles/06-master-slaver-protocol/en/article.md:155-167`）。

为什么三个案例都需要：

- **案例 1（CI 修复）：** 修复 ticket 被**一个** Slaver 拿到；其它人看到 `IN_PROGRESS`，继续往下。
- **案例 2（文章系列）：** 14 个 article ticket 一对一被 Slaver 拿到；两个 Slaver 永远不会写同一行 `INDEX.md`，因为行翻转被串行化。
- **案例 3（benchmark）：** 50 个 Slaver 可在同一毫秒调 `task:claim`；49 个失败者拿到干净的"already claimed" 错误，转下一张 ticket（`docs/articles/GLOSSARY.md:13`）。

没了原子 claim，其它不变式全漏。这是地基。

**不变式 2——Saga 5 步完成。失败的代价有界。**

每个案例都结束于 `eket task:complete TASK-NNN`，那是一次 5 步 Saga：validate → test → checkpoint → commit → notify（`docs/articles/GLOSSARY.md:12`，实现在 `node/src/core/saga-executor.ts:22-66`）。每步都可能失败；执行器逆序补偿前置步骤（`node/src/core/saga-executor.ts:30-66`）。

为什么三个案例都需要：

- **案例 1：** 如果 test 步失败（在 validate 通过之后），不会有 commit，不会有 PR，不会有通知。Slaver 看到清晰的"test 步失败"然后重试。
- **案例 2：** 如果 `wc -w` 返回 < 2000 时 lint 步挂掉，Saga 在 step 2（test）退出，Slaver 回去加一节再重试——不会留一个半提交的分支。
- **案例 3：** 10 个 benchmark 任务，handoff_success_rate 平均 0.93；那 7% 失败的是 Saga 补偿过、团队看到的是干净的 retry，不是半合并的分支。

失败代价有界，是"5 个 Slaver 实例跑 10 张 ticket"还能幸存的原因。没了 Saga，一个 Slaver 在 `task:complete` 中途崩了，留下的就是半 push 的分支、半开的 PR、和一条 Slack thread。

**不变式 3——角色门控转移。Master 永远不 claim；automation 永远不 review。**

`protocol/state-machines/ticket-status.yml:1-112` 把"谁可以转移"编码成转移的**一列**，不是 actor 的一条 guideline。具体：`who_can_transition: [slaver]` 在 `ready` 和 `in_progress`；`who_can_transition: [master, automation]` 在 `review` 和 `gate_review`（`docs/articles/06-master-slaver-protocol/en/article.md:139-151,278-294`）。

为什么三个案例都需要：

- **案例 1：** 修复 Slaver 跑修复；Master 不会"顺便"也 patch 一下 endpoint，因为 SQL guard 拒绝 claim。reviewer 那个位子被留给一次独立 review。
- **案例 2：** 写文章的 Slaver 不是审稿人；gate review 属于 Master（或另一个 Slaver instance 坐在 review 位）。审计轨迹记的是**角色**，不是**键盘**。
- **案例 3：** benchmark 的 `master` role **只是**协调者——它不能 claim ticket，所以不会"不小心" review 自己的活。COLLAB-001 的 `intervention_rate = 0.29` 是**有协调的**介入率，不是自审率。

这三条不变式彼此组合。去掉任何一条，协议就塌回第 01-02 篇列出的三个失败模式（上下文丢失、编辑冲突、review 不透明）之一。

**元不变式备注：审计轨迹。** 每次转移写一行。每一行可被查询。审计轨迹不是独立不变式，是上面三条的**结果**。如果你能在 30 秒内跑一次 SQL 答出"TASK-650 现在归谁、谁审的 PR、merge commit 什么时候推的"，协议就在工作。benchmark 的 `initiative_entropy` 0.97 是同一个性质换个角度看：因为审计**能看见**工作被分布，所以工作才真的被分布。

---

## 7. 三例没告诉你的事——失败透明（Slaver-003 的 worktree 代码丢失）

没有失败案例的 case-study 文章是 brochure。这一个就是协议没救回来的案例：`TASK-636`（"Rust Context Monitor"，`jira/tickets/EPIC-007/TASK-636.md:1-13`），2026 年 5 月。

**Setup。** 一个 Slaver（`slaver-003`，role: backend，specialty: rust）被指派 `TASK-636`，把 Node.js 写的 context monitor 用 Rust 重写。ticket 目标："binary 启动 < 10ms、±5% 精度、跨平台、CLI 向后兼容"（`TASK-636.md:11-39`）。ticket 的 sketch 很细：`rust/crates/context-mon/src/main.rs` 骨架，含 `ContextMonitor::rough_estimate` 和 `ContextMonitor::precise_estimate` 方法（`TASK-636.md:46-114`）。Slaver-003 在协议 per-Slaver 布局的隔离 git worktree 里干活（`docs/articles/06-master-slaver-protocol/en/article.md:358-360`）。

**Sequence。**

```bash
# Day 1, ~14:00 — Slaver-003 开工
eket task:claim TASK-636          # 原子 CAS，assignee=slaver-003
git worktree add .eket/worktrees/slaver-003/TASK-636 -b feature/TASK-636-rust-monitor-v2
cd .eket/worktrees/slaver-003/TASK-636
# ... 干 5.5 小时 ...
# 628 行 Rust，分布在 src/main.rs, src/estimator.rs, src/lib.rs
# worktree 里产生了本地 commit
# Day 1, ~19:30 — Slaver-003 在 chat 里报"done"

# Day 2, ~10:00 — Master 试图 verify
git fetch origin
git log origin/feature/TASK-636-rust-monitor-v2 --oneline | head
# → 空：分支没 push 过
ls rust/crates/context-mon/
# → 空：worktree 已被丢弃；文件从来没进过主仓库
```

**协议抓到了什么、没抓到什么。**

协议抓到了**状态转移**：ticket 在 `review`，Slaver 的 checkpoint 数是 N，审计日志里有 `task:completed` 事件。协议**没抓到**底层的 **artifact**（628 行 Rust crate）从来没 commit 进主仓库的工作树，因为协议的状态机不包含"worktree 的 commit 已经被 merge 进主分支"这个转移。状态机把 `git push` 当作 Saga 的第 4 步（`docs/articles/06-master-slaver-protocol/en/article.md:236`），但那一步**假设** Slaver 的 worktree **就是**主仓库的工作树。当 worktree 是一个 per-Slaver 隔离树时，push 必须是 *merge* 进主分支，而不是 feature 分支的 *push*——Saga 没强制这件事。

retro（`jira/tickets/EPIC-007/TASK-636-retrospective.md:1-84`）和 pitfall 记录（`confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45,171-174`）把这件事记下来。修法在 follow-up 里发了：`TASK-X04`（"Checkpoint 分支自动创建与推送"，`jira/tickets/TASK-X04.md:1-204`）在每次 `ProgressTracker.checkpoint(phase)` 调用上自动 `git commit` + `git push` 到 per-task `checkpoint/<task-id>` 分支。协议被**打补丁**了——worktree commit 现在是状态机的一次转移。

**Outcome。** 628 行丢失。Slaver-005 用打过补丁的 `ProgressTracker` 重新派发。新的那次 5.5h 跑成。审计轨迹记录 `TASK-636` 的两次 Slaver assignment（`confluence/memory/pitfalls/slaver-worktree-code-loss.md:265`）。

**Lessons。**

- **A——协议的安全性只延伸到**状态机里有的那部分**。** Worktree commits 在状态机外。状态机外的任何东西都不被保护。修法：把 worktree commits 变成一次转移。
- **B——"Slaver 报 done" 不等于 "PR 是绿的"。** Master 的 verify 步骤必须包含**内容**检查，不只是流程检查。当前最佳实践：`git diff --stat origin/feature/TASK-XXX` 应该显示预期的 LOC delta，不是零。（`confluence/memory/pitfalls/slaver-worktree-code-loss.md:43-46` 把这事写成法条。）
- **C——re-dispatch 在审计轨迹完整时很便宜。** 协议记下了原 Slaver 的 `assignee`、原 `claimed_at`、原 `executedToolCalls`，re-dispatch 只是一次单 SQL 更新（`UPDATE tickets SET assignee = 'slaver-005', state = 'in_progress'`），不是再调研。失败的成本由审计轨迹界定，不由丢失的工作界定。
- **D——失败案例是一等公民的文档。** 这个案例就是本系列坚持"每篇多案例文章都要有 case 4"的原因。一个失败模式不可读的协议，读者没法信。我们信这个协议，因为我们把"它没工作那一次"也写下来了。

**为什么本案例和案例 1-3 同样深度。** 一段"然后 Slaver 崩了"的失败案例是 testimonial，不是案例研究。四节——setup、sequence、outcome、lessons——形状一样。区别在 lesson 的**方向**：案例 1-3 的 lesson 说"协议保护了我们"；案例 4 的 lesson 说"协议没保护，原因如下，补丁如下，审计轨迹把代价界定了"。

---

## 8. 你的案例——可复制粘贴的模板

下面这个模板是一个 markdown 骨架。复制进 `jira/tickets/EPIC-XXX/TASK-NNN.md`（或你 ticket 在的地方），填好方括号 `[…]` 字段，把协议跑上去。形状和案例 1-4 一致；`your-ticket-id` 和 `your-timestamps` 字段让案例是**案例**而不是**小插曲**。

```markdown
# 案例研究：[你的标题——短、有信息量]

**作者**: [你的名字 / role: master 或 slaver]
**日期**: [YYYY-MM-DD]
**Ticket**: [TASK-NNN 或 your-ticket-id]
**文章参考**: [docs/articles/14-case-studies/.../article.md，如适用]

---

## Setup

- **目标是什么？** [一句话]
- **参与者？** [agents / humans 列表，带 role + specialty]
- **起始状态？** [READY tickets、分支布局、CI 状态]
- **时间预算？** [预估小时数、硬 deadline 如有]

## Sequence

```
[t=0    : 你的事件]
[t=2m   : 你的事件]
[t=...  : 你的事件]
[t=Nm   : 你的事件]
```

```bash
# 你实际跑过的具体命令
eket task:claim [your-ticket-id]
git checkout -b feature/[your-ticket-id]-[slug]
# ... 你的工作 ...
eket task:complete [your-ticket-id]
```

- **第一次转移是什么？** [人 → agent，或 agent → agent]
- **风险最大的转移？** [哪里会失败]
- **恢复计划？** [风险最大的转移失败时怎么办]

## Outcome

- **发布了什么？** [PR URL、分支名、commit hash]
- **审计轨迹长什么样？**

```
[your-ticket-id]
├── claim       : [agent-id]   @ [timestamp]
├── implement   : [agent-id]   (commit [hash], [LOC] LOC)
├── complete    : saga-5step   @ [timestamp]
├── review      : [reviewer]   ([approve|changes_requested])
└── merge       : feature→testing→main→miao
```

- **耗时？** [实际 vs 预估]
- **成本？** [tokens、Slaver-hours、Master-hours]

## Lessons

- **Lesson A——** [一段话，相关处带 `file:line` 引用]
- **Lesson B——** [一段话]
- **Lesson C——** [一段话]

---

## 为什么这是 EKET 的"案例研究"（自检）

- [ ] 至少一个交接边界（人 → agent、agent → agent，或 agent → CI）
- [ ] 至少一个 checkpoint、分支、或 artifact 用于崩溃恢复
- [ ] 审计轨迹完整（时间戳 + instance id 在 SQLite `tickets` 行里）
- [ ] 多角色：至少一次 Master 操作和一次 Slaver 操作
- [ ] 能用四节（setup、sequence、outcome、lessons）讲完而不用重组结构

五项都打勾，你就有一个案例。给 `docs/articles/14-case-studies/` 开一个 PR，把它加进文章。

---

## your-ticket-id 和 your-timestamps（机读）

```yaml
ticket_id: [TASK-NNN]
ticket_url: [jira/tickets/EPIC-XXX/TASK-NNN.md]
claimed_at: [ISO 8601 timestamp]
completed_at: [ISO 8601 timestamp]
merged_at: [ISO 8601 timestamp]
slaver_instance_id: [.eket/instances/ 里的 agent-id]
master_instance_id: [.eket/instances/ 里的 agent-id]
pr_url: [GitHub PR URL]
branch: [feature/TASK-NNN-slug]
commit: [commit hash]
loc_delta: [+NNN or -NNN]
```

---

## 9. 参考

- **本系列上下文（本文内交叉引用）：**
  - `docs/articles/01-what-is-eket/en/article.md:55-58` — 协议论点、关于协调问题的引文
  - `docs/articles/02-why-you-need-eket/en/article.md:109-111` — 四痛点 × 协议修法的表（Saga 5 步在此命名）
  - `docs/articles/06-master-slaver-protocol/en/article.md:88-115` — 状态机图
  - `docs/articles/06-master-slaver-protocol/en/article.md:139-151` — 5 个转移
  - `docs/articles/06-master-slaver-protocol/en/article.md:155-167` — 原子 claim，CAS SQL
  - `docs/articles/06-master-slaver-protocol/en/article.md:226-274` — Saga 5 步，validate → test → checkpoint → commit → notify
  - `docs/articles/06-master-slaver-protocol/en/article.md:278-294` — "Master 永远不 claim" 规则
  - `docs/articles/06-master-slaver-protocol/en/article.md:336-360` — 多 Slaver 动态、worktree-per-slaver
  - `docs/articles/12-multi-tool-support/en/article.md:152-186` — 跨工具 worked example（Cursor 写、Claude Code 审）
  - `docs/articles/GLOSSARY.md:12-13` — Saga 和 CAS 定义
- **案例 1、2、4 引用的 ticket：**
  - `jira/tickets/EPIC-004/TASK-401.md:1-39` — CI 自愈最近对照：失败测试修复 ticket
  - `jira/tickets/EPIC-007/TASK-636.md:1-13` — Rust context monitor（案例 4 失败）
  - `jira/tickets/EPIC-007/TASK-636-retrospective.md:1-84` — Slaver-003 retro，包括 perf-AC 歧义 pitfall
  - `jira/tickets/EPIC-008/TASK-650.md:1-58` — 本文的 ticket
  - `jira/tickets/EPIC-008/README.md:1-85` — 文章系列 epic
  - `jira/tickets/TASK-X04.md:1-204` — 修 worktree 代码丢失类失败的补丁
- **案例 1、2、3 引用的代码：**
  - `node/src/core/task-checkpoint.ts:48-108` — `_casUpdate` 和 `CheckpointCASError` 类
  - `node/src/core/saga-executor.ts:22-66` — `SagaExecutor.execute`，逆序补偿
  - `node/src/hooks/http-hook-server.ts:14-19` — 跨工具事件桥端点
- **失败案例引用：**
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:33-45` — worktree 隔离 pitfall
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:171-174` — 628 行丢失时间线
  - `confluence/memory/pitfalls/slaver-worktree-code-loss.md:265` — 重新派发 Slaver-005
- **Benchmark 与 demo artifact（案例 3）：**
  - `benchmarks/multi-agent-eval/run_collab_benchmark.py:1-100` — benchmark runner（多 agent 协作指标，Co-Gym + DyLAN 启发）
  - `benchmarks/multi-agent-eval/results/collaboration_report.json:1-53` — 聚合指标
  - `benchmarks/multi-agent-eval/results/collaboration_report.json:55-85` — COLLAB-001 详细行（案例 3 用到）
  - `benchmarks/multi-agent-eval/results/collaboration_report.json:283-339` — COLLAB-009 和 COLLAB-010，最复杂的任务（5-6 agent）
  - `examples/e2e-collaboration/README.md:56-92` — FEAT-001 demo（Master + Slaver，claim → heartbeat → PR → review → merge）
  - `examples/e2e-collaboration/demo-scenario.md:1-67` — FEAT-001 完整时序图
  - `examples/e2e-collaboration/SUMMARY.md:199-219` — FEAT-001 demo 26 秒时间线
  - `inbox/human_input.md:11-20` — 触发 EPIC-008 文章系列的原始用户诉求
- **分支与 CI 基础设施：**
  - `scripts/sync-branches.sh` — `feature → testing → main → miao` promote 脚本
- **本系列相关文章：**
  - 上一篇：[`13-adr-and-roadmap`](../../13-adr-and-roadmap/zh-CN/article.md)
  - 下一篇：[`15-outlook-risks`](../../15-outlook-risks/zh-CN/article.md) — 价值、风险、缓解
- **未决 follow-up（Master 仲裁）：**
  - 加一张真正的 `TASK-XXX-ci-self-repair` ticket，把 `POST /hooks/post-tool-use` 接到 `epic:create`。Hook server 就位（`node/src/hooks/http-hook-server.ts:14-19`），dispatcher pipeline 就位（`node/src/hooks/dispatcher.ts:213-425`）；缺的是 `template/docs/MASTER-RULES.md` 里那条"CI 失败 hook 事件自动建 ticket"的策略。
  - 决定是否把"未跑通"案例（Slaver-003 / `TASK-636`）在收集到 2-3 个失败案例后升格成独立文章（如 `14.1-failure-cases/`）。当前放在本文第 7 节成本最低；系列下篇文章可按需再分片。
  - 确认 `benchmarks/multi-agent-eval/results/collaboration_report.json` 的多 agent benchmark 是否在 EPIC-008 发布 checklist 中重跑。这批数（10/10 完成、`avg_collab_score = 0.8`）是整系列里最强的一项单一证据。

