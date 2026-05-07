# TASK-221: step_snapshot P2修复 — FTS5触发器+in-memory+空查询+重复step ID+空模型

**状态**: done

**优先级**: P2
**类型**: Bugfix
**模块**: rust/crates/eket-engine/src/step_snapshot.rs, workflow.rs, node/src/core/model-provider.ts
**来源**: 红队审查 Linus#7 / Jeff P2 ×4
**工作量**: 1天

## 修复清单

### 1. FTS5 缺少 DELETE/UPDATE 触发器（step_snapshot.rs L83-89）
补充 DELETE 和 UPDATE 触发器，防止 GC 删除行后 FTS 索引残留：
```sql
CREATE TRIGGER wss_fts_delete AFTER DELETE ON workflow_step_snapshots
  BEGIN DELETE FROM workflow_step_snapshots_fts WHERE rowid=old.rowid; END;
CREATE TRIGGER wss_fts_update AFTER UPDATE ON workflow_step_snapshots
  BEGIN DELETE FROM workflow_step_snapshots_fts WHERE rowid=old.rowid;
        INSERT INTO workflow_step_snapshots_fts(rowid,summary,tags) VALUES(new.rowid,new.summary,new.tags); END;
```

### 2. in-memory SQLite 改为文件路径（step_snapshot.rs L44）
`StepSnapshotStore::new(db_path: &Path)` 支持文件路径；
`WorkflowEngine` 接受可选 `snapshot_db_path`，默认 `~/.eket/snapshots.db`。
`new_in_memory()` 保留，仅用于测试。

### 3. 空 FTS5 查询返回空列表（step_snapshot.rs L139）
```rust
if query.trim().is_empty() { return Ok(vec![]); }
```

### 4. 重复 step ID 注册时报错（workflow.rs L292）
```rust
let mut seen = HashSet::new();
for step in &def.steps {
    if !seen.insert(&step.id) {
        return Err(EketError::InvalidInput(format!("duplicate step id: {}", step.id)));
    }
}
```

### 5. 空 env model 字符串快速失败（model-provider.ts L98）
```typescript
if (!model || model.trim() === '') {
  throw new Error(`EKET model config error: empty model string for role '${role}'`);
}
```

## 验收标准
- [x] 所有5项修复实现
- [x] FTS5 触发器覆盖 INSERT/UPDATE/DELETE
- [x] 空查询返回 []，不返回错误
- [x] 重复 step ID 注册报错
- [x] 空 env model 启动时 throw（快速失败）
- [x] 全部测试通过
