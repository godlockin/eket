# TASK-269 复盘：Slaver 状态更新 Bug 修复

**Ticket**: TASK-269 — Bug: task:complete 后 slaver_instances 状态未更新（Rust + Node.js）  
**执行者**: slaver_1776695133821_534ccf79 (backend)  
**完成时间**: 2026-05-06  
**耗时**: 0.3d（实际）

---

## 完成了什么

### 核心修复

1. **新增 `set_status()` 方法** (`registry.rs`)
   - 更新 SQLite `slaver_instances.status`
   - 同步 Redis cache（更新 JSON 对象中的 status 字段）
   - 失败降级：warn only，不中断流程

2. **Rust `task:complete`** (`task_complete.rs`)
   - Saga Step 8 后调用 `registry.set_status(slaver_id, "idle")`
   - 错误处理：非致命，heartbeat 兜底

3. **Node.js 同步修复** (`complete.ts`)
   - `updateTicketStatus('done')` 之后同步逻辑
   - 兼容逐渐淘汰的 Node.js 版本

4. **测试覆盖**
   - `test_set_status_updates_db` — DB 写入验证
   - `test_set_status_idle_after_task_complete` — discover 立即可见性验证
   - 11/11 tests pass

### 影响范围

- registry.rs: +57 行（新方法 + 测试）
- task_complete.rs: +14 行
- complete.ts: +12 行

---

## 学到了什么

### 技术洞察

1. **状态语义区分**：`idle` vs `offline`
   - `idle`: 可接受新任务（正常完成后状态）
   - `offline`: 不可用（heartbeat 超时/主动下线）
   - 原 bug：完成后未设 `idle`，导致 90s 内无法 dispatch

2. **降级策略设计**
   - Primary path: `task:complete` 主动更新状态
   - Fallback: heartbeat_monitor 90s TTL 兜底
   - 失败处理：warn only，不阻塞 Saga

3. **Redis cache 一致性**
   - 不仅更新 SQLite，还需同步 Redis 中的 JSON
   - `serde_json::Value` 修改字段后重新序列化
   - TTL 保持 90s（HEARTBEAT_TTL_SECS）

### 流程洞察

1. **Shell 层降级**
   - Shell (`lib/`) 不走 SQLite，无此 bug
   - 分层降级设计的意外好处

2. **测试驱动验证**
   - 单元测试直接覆盖核心逻辑（DB 写 + cache 同步）
   - 集成测试场景：claim → complete → discover 立即可见

---

## 通用知识（可沉淀）

### Pattern: Saga 后处理清单

Saga 成功后，除了业务逻辑，需检查：
- [ ] 资源状态复位（如 slaver status）
- [ ] 缓存失效/同步（SQLite + Redis）
- [ ] 通知下游系统（webhook, event bus）
- [ ] 文档生成（retro, summary）

本次遗漏：slaver 状态未复位。

### Pattern: 双路径更新 SQLite + Redis

```rust
// SQLite
conn.execute("UPDATE table SET field = ?1 WHERE id = ?2", params![val, id])?;

// Redis cache 同步
if redis.is_available() {
    if let Ok(Some(cached)) = redis.get(&key).await {
        if let Ok(mut obj) = serde_json::from_str::<Value>(&cached) {
            obj["field"] = json!(val);
            redis.set(&key, &obj.to_string(), Some(ttl)).await;
        }
    }
}
```

### Pitfall: `mark_offline()` 存在但未被调用

代码存在 ≠ 实际使用。检查方法：
- Grep 调用点：`rg "mark_offline\("`
- LSP find references
- 单测覆盖率报告

---

## 改进建议

1. **静态分析辅助**
   - 添加 lint rule：unused public method 警告
   - CI 检查：新增 public API 必须有调用点或测试

2. **状态机显式建模**
   - Slaver 状态转换：todo → claim → busy → complete → idle
   - 用 enum + 状态机库（如 `sm`）显式表达合法转换

3. **E2E 测试补充**
   - 当前测试：单元（registry）
   - 缺失：E2E（task:claim → task:complete → master:discover）

---

## 相关 Ticket

- 发现源：Master 代码审查 PR #179（TASK-254~267 合并时）
- 后续：TASK-272（DB schema 统一）— 可能涉及 `slaver_instances` 重构

---

**结论**：修复完成，状态更新逻辑已完整。Node.js 版本虽逐渐淘汰，但已同步修复避免运行期不一致。
