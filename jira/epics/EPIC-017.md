# EPIC-017: DAG 任务编排引擎

**创建时间**: 2026-06-01  
**状态**: in_progress  
**优先级**: P0  
**预估工时**: 8d (Phase 1) + 8d (Phase 2)  
**来源**: Master-Slaver 脑爆（复杂任务自动编排）

---

## 背景

复杂 EPIC（≥5 子任务、深度≥3）需要自动构建 DAG 执行图，让专家/专家组按依赖顺序推进。
避免手动排序、减少阻塞等待。

## 设计原则

### 降级策略（与 EKET 四级架构一致）

```
Rust (L1) → Node.js (L2) → Shell (L0)
  │              │              │
  │              │              └── 串行执行，文件锁
  │              └── Promise 并发，EventBus
  └── tokio 高性能调度，SQLite 状态机
```

- **Rust 优先**：检测 `eket dag:health` 可用
- **Node fallback**：Rust 不可用时降级
- **Shell 兜底**：任何 POSIX 环境可用

### 统一 DAG 定义（YAML）

三层引擎读同一个 `dag.yml`，执行能力不同：
- Rust: 真并发 + 细粒度调度 + checkpoint
- Node: Promise.allSettled + EventBus 状态广播
- Shell: 拓扑排序串行执行（max_parallel 忽略）

## Ticket 清单

### Phase 1: MVP (已完成 ✅)

| Ticket | 标题 | 依赖 | 状态 | 工时 |
|--------|------|------|------|------|
| TASK-631 | DAG YAML Schema + 验证器 | - | ✅ done | 1d |
| TASK-632 | Shell DAG Runner (L0 兜底) | 631 | ✅ done | 1.5d |
| TASK-633 | Node.js DAG Executor (L2 fallback) | 631 | ✅ done | 2d |
| TASK-634 | Rust DAG Engine 核心 (L1 首选) | 631 | ✅ done | 2.5d |
| TASK-635 | 降级检测 + 自动路由 | 632,633,634 | ✅ done | 1d |

### Phase 2: 修复 + 增强

| Ticket | 标题 | 依赖 | 优先级 | 工时 |
|--------|------|------|--------|------|
| TASK-636 | Node.js resume dagPath 持久化修复 | 633 | P1 | 0.5d |
| TASK-637 | DAG Schema 安全加固 | 631 | P2 | 0.5d |
| TASK-638 | DAG 日志脱敏 | 633,634 | P2 | 0.5d |
| TASK-639 | DAG 可视化 (ASCII + Mermaid) | 635 | P1 | 1.5d |
| TASK-640 | DAG 自动复杂度检测 | 631 | P1 | 1d |
| TASK-641 | DAG 条件分支 + 动态节点 | 634 | P2 | 2d |
| TASK-642 | DAG 与 Master-Slaver 协作整合 | 635,640 | P0 | 2d |

## DAG 依赖图

```
TASK-631 (Schema)
    │
    ├──→ TASK-632 (Shell)  ──┐
    ├──→ TASK-633 (Node)   ──┼──→ TASK-635 (Router)
    └──→ TASK-634 (Rust)   ──┘
```

## 验收标准

### Phase 1 (已完成)
- [x] **AC1**: `dag.yml` schema 定义完成，支持 nodes/deps/settings
- [x] **AC2**: `scripts/dag-runner.sh` 串行执行 + ASCII 进度
- [x] **AC3**: `node/src/core/dag-executor.ts` 并发执行 + EventBus
- [x] **AC4**: `rust/crates/eket-engine/src/dag/` 高性能调度
- [x] **AC5**: `eket dag:run EPIC-NNN` 自动检测层级并执行
- [x] **AC6**: 降级日志清晰：`[DAG] Using L1 Rust engine` / `[DAG] Fallback to L0 Shell`

### Phase 2 (进行中)
- [ ] **AC7**: DAG 可视化 (ASCII + Mermaid)
- [ ] **AC8**: 自动复杂度检测 + DAG 生成
- [ ] **AC9**: 与 Master-Slaver 协作整合
- [ ] **AC10**: 条件分支 + 动态节点支持

## 技术细节

### dag.yml 示例

```yaml
version: "1.0"
epic: EPIC-017
nodes:
  - id: TASK-631
    script: "eket task:execute TASK-631"
    deps: []
  - id: TASK-632
    script: "eket task:execute TASK-632"
    deps: [TASK-631]
settings:
  max_parallel: 3
  retry_count: 2
  timeout_seconds: 3600
```

### SQLite 表结构

```sql
-- dag_runs: 执行记录
CREATE TABLE dag_runs (
  id TEXT PRIMARY KEY,
  epic_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  started_at INTEGER,
  finished_at INTEGER,
  engine_level INTEGER  -- 1=Rust, 2=Node, 0=Shell
);

-- dag_node_states: 节点状态
CREATE TABLE dag_node_states (
  run_id TEXT,
  node_id TEXT,
  status TEXT DEFAULT 'pending',
  started_at INTEGER,
  finished_at INTEGER,
  error_msg TEXT,
  PRIMARY KEY (run_id, node_id)
);
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 EPIC，脑爆定稿 | Master |
| 2026-06-01 | Phase 1 完成 (631-635)，专家组评审通过 | Team |
| 2026-06-01 | 创建 Phase 2 tickets (636-642) | Master |
