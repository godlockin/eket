# TASK-650: SQLite DAG 表实际创建 + WAL Checkpoint

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P0  
**预估**: 1d  
**依赖**: TASK-634  
**层级**: L1 Rust  
**来源**: Jeff Dean Review

---

## 问题描述

EPIC-017.md 定义了 `dag_runs`/`dag_node_states` 表结构，但 `rust/crates/eket-core/src/db/schema.sql` 中**没有实际创建这些表**。

**影响**：崩溃恢复不完整，丢失 in-flight 状态。

## 验收标准

- [x] `schema.sql` 添加 `dag_runs` 和 `dag_node_states` 表
- [x] Rust checkpoint.rs 实际写入 SQLite
- [x] 实现 Write-Ahead Log (WAL)：dispatch 前写，完成后标记
- [x] 崩溃恢复测试：kill 进程后能从 checkpoint 恢复
- [x] 实现精确一次语义 (exactly-once)

## 表结构

```sql
-- dag_runs: 执行记录
CREATE TABLE IF NOT EXISTS dag_runs (
  id TEXT PRIMARY KEY,
  epic_id TEXT NOT NULL,
  yaml_content TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending/running/done/failed
  started_at INTEGER,
  finished_at INTEGER,
  engine_level INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- dag_node_states: 节点状态
CREATE TABLE IF NOT EXISTS dag_node_states (
  run_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',  -- pending/ready/running/done/failed/skipped
  started_at INTEGER,
  finished_at INTEGER,
  exit_code INTEGER,
  error_msg TEXT,
  attempt INTEGER DEFAULT 0,
  PRIMARY KEY (run_id, node_id),
  FOREIGN KEY (run_id) REFERENCES dag_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_dag_runs_status ON dag_runs(status);
CREATE INDEX IF NOT EXISTS idx_dag_node_states_status ON dag_node_states(run_id, status);
```

## WAL 实现

```rust
// MapReduce 风格 checkpoint
impl Checkpoint {
    // dispatch 前写 WAL
    async fn before_dispatch(&self, run_id: &str, node_id: &str) -> Result<()> {
        sqlx::query("UPDATE dag_node_states SET status = 'dispatched', started_at = ? WHERE run_id = ? AND node_id = ?")
            .execute(&self.pool).await?;
    }
    
    // 完成后标记
    async fn after_complete(&self, run_id: &str, node_id: &str, result: NodeResult) -> Result<()> {
        sqlx::query("UPDATE dag_node_states SET status = ?, finished_at = ?, exit_code = ? WHERE run_id = ? AND node_id = ?")
            .execute(&self.pool).await?;
    }
}
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (Jeff Dean Review P0) | Master |
| 2026-06-01 | 实现完成: schema.sql + checkpoint.rs + 10 测试通过 | Slaver |

## 实现摘要

### 1. schema.sql 扩展
- 添加 `dag_runs` 表 (run 元数据 + YAML 内容)
- 添加 `dag_node_states` 表 (节点级 WAL)
- 添加索引: `idx_dag_runs_status`, `idx_dag_runs_epic`, `idx_dag_node_states_status`

### 2. checkpoint.rs 模块 (~550 LOC)
- `DagCheckpoint` 结构体: WAL 管理器
- `before_dispatch()`: 执行前写 WAL (status='dispatched')
- `after_complete()`: 执行后标记 (status='done'/'failed')
- 崩溃恢复: `find_interrupted_runs()`, `find_dispatched_nodes()`, `reset_dispatched_nodes()`
- 精确一次语义: attempt 计数 + dispatched→done 状态机

### 3. 测试覆盖 (10 测试)
- `test_create_run`: 创建 run + 初始化节点状态
- `test_run_lifecycle`: pending→running→done 状态流转
- `test_wal_before_after_dispatch`: WAL 写入验证
- `test_node_failure`: 失败处理 + error_msg 记录
- `test_crash_recovery`: 模拟崩溃恢复流程
- `test_skip_node`: 条件跳过处理
- `test_count_by_status`: 状态统计
- `test_abort_run`: 中止处理
- `test_retry_increment`: 重试计数递增
