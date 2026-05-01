# EKET Round 25 Gap 修复方案 — 专家组综合决策书

**创建**: 2026-04-21
**专家组**: Rust 专家 (aea3fae6) · 架构师 (ab5287da) · 后端专家 (a837744c) · 测试专家 (a7a89809)
**关联 ticket**: TASK-139, TASK-140, TASK-141, TASK-142

---

## 一、关键分歧点 + 投票结论

### 分歧 1：Hook Server 全 Rust 化 vs 混合代理（TASK-139）

| 专家 | 立场 | 关键论据 |
|---|---|---|
| 架构师 | **全 Rust 化** (ADR-001) | 控制面统一、p99<100ms 唯一可达路径 |
| Rust 专家 | 中立偏全 Rust | 可行（7 人日），但需先画"必要 5 种 vs 可选 23 种"边界，否则范围爆炸 |
| 后端专家 | **混合代理** | 28 事件全迁 ROI 低，PermissionChecker 走 Rust，其余 Node 代理 |
| 测试专家 | 看决策 | 强调 contract test 字节级 1:1 是合并门禁 |

**🗳️ 决策**：**两阶段方案** — Phase 1 混合代理（后端专家方案）→ Phase 2 视使用情况评估 ADR-001 全 Rust 化。
- 立刻收益：PermissionChecker 进 Rust 满足 100ms SLA
- 风险隔离：23 种低频事件留在 Node，避免一次性大爆炸
- 决策窗口：Phase 1 上线 8 周后用 Prometheus 数据复盘（hook QPS 分布、p99 漂移）

### 分歧 2：DAG 中间件做不做（TASK-140）

| 专家 | 立场 |
|---|---|
| 架构师 | 做（与 WorkflowEngine 分层并存） |
| Rust 专家 | 做（5 人日，并入 eket-engine） |
| 后端专家 | **YAGNI，暂缓** — 当前无 in-use pipeline |
| 测试专家 | 假定要做 |

**🗳️ 决策**：**暂缓但保留设计** — 不写代码，但产出 ADR-003《Middleware DAG vs WorkflowEngine 边界》锁定未来重建时的接口契约。条件：等 TASK-139 Phase 2 真正需要 PreToolUse pipeline 时立刻启动。**TASK-140 状态改为 backlog + blocked-by-real-use-case**。

### 分歧 3：Redis 去留（TASK-142）

| 专家 | 立场 |
|---|---|
| 架构师 | SQLite-first，Redis opt-in (cargo feature) |
| Rust 专家 | 同上，先出 ADR |
| 后端专家 | 同上，写 ADR + 删 default deps + 留 5 测试 |
| 测试专家 | testcontainer + toxiproxy 测降级 |

**🗳️ 决策**：**全票通过** — ADR-002《SQLite as SSoT, Redis Opt-in》。`task:resume` 不再有 fallback 分支，但保留 5 个测试覆盖 Redis 缺失/损坏路径。

### 共识 4：SSE 5态先做（TASK-141）

四票全过，**P0 优先级**。理由：infra 已就绪，2-3 天可交付，Dashboard 实时性是用户感知最强的改进。

---

## 二、执行节奏（最终）

```
Sprint 1 (Week 1)：定调 + 解锁 Dashboard
  Day 1     : ADR-002 (Redis opt-in) — 0.5d，由 142a 子卡承载
  Day 1-3   : TASK-141 SSE 实现（events.rs + axum SSE + replay）
  Day 1-2   : TASK-139 Phase 1 ADR（混合代理边界文档）
  Day 4-5   : TASK-141 测试 + 文档 + master_heartbeat 接入
  Week 1 末 : Sprint 1 demo（Dashboard 切到 SSE）

Sprint 2 (Week 2-3)：PermissionChecker Rust 化 + 测试补完
  Week 2    : TASK-139 Phase 1 实现（PermissionChecker + 5 端点 Rust 化）
              TASK-142 测试补完（5 个单测，无 fallback 代码）
  Week 3    : TASK-139 集成测试（contract fixture 字节级 diff）
              ADR-003 (DAG vs Workflow 边界) 草案

Backlog（不进 Sprint）：
  TASK-140 DAG middleware 重建 — blocked-by 真实 use case
  TASK-139 Phase 2 全 Rust 化 — blocked-by Phase 1 上线 8 周观测
```

---

## 三、合并门禁（测试专家强约束）

每张卡合并必须满足：

| 卡 | 强门禁 |
|---|---|
| **TASK-141** | Last-Event-ID 重连测试不丢不重 + SSE Lagged 计数器断言 + master_heartbeat 订阅替代 ≥1 处轮询 |
| **TASK-139 Ph1** | Contract test 100% pass（100 条线上 fixture 字节级 diff vs Node）+ p99<100ms perf 门禁 |
| **TASK-142** | ADR-002 已合并 + 5 单测覆盖 5 个 Redis/checkpoint 故障场景 |
| **TASK-140** | （暂缓）ADR-003 草案审过即可，无代码 |

---

## 四、必补测试基础设施（合入 Sprint 1）

由测试专家清单收敛：
- `testcontainers-rs`（Redis 7 + tmpfs SQLite）
- `wiremock-rs`（mock Claude Code hook caller）
- `eventsource-client`（SSE e2e 断言）
- `insta`（hook payload contract 快照）
- `proptest`（DAG/事件序列化 property test）
- CI: `cargo nextest` + `cargo llvm-cov` 覆盖率门禁 ≥80%（核心模块 ≥90%）

---

## 五、需要 Master 在 Sprint 启动前确认的开放问题

1. **Phase 2 触发条件量化**：8 周 / 8000 hook QPS / 用户投诉 ≥3 单 — 三选一 / 全选 / 自定义？
2. **Hook payload 100 条 fixture 来源**：要求 Slaver 上线 audit 抓取 7 天，还是用现有测试用例兜底？
3. **TASK-140 是否进 backlog 留卡**？还是直接关 won't-fix，需要时新建？
4. **Redis Sprint 1 是否直接从 default features 移除**？还是先标 deprecated 一个 release 再删？

---

**专家组签名**:
- Rust 专家 · agentId: aea3fae6e1d7c4138
- 架构师   · agentId: ab5287da59a545ba2
- 后端专家 · agentId: a837744ca7b2493d5
- 测试专家 · agentId: a7a89809df838f2b1
