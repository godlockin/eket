# 红队审查 — Bug 模式与修复经验

**创建时间**: 2026-04-26
**来源**: TASK-214~221（红队发现 14 项，P0×1 / P1×7 / P2×6，全部修复）
**适用范围**: Rust async 开发、Node.js Result 类型、tokio 并发、SQLite FTS5

---

## 1. Rust Async — tokio 线程阻塞

### 1.1 std::sync::Mutex 不能在 async 代码中跨 `.await` 持有

**问题**：在 `tokio::spawn` 内对 `std::sync::Mutex` 调用 `.lock()` 后跨越 `.await` 点，会阻塞整个 OS 线程，导致 tokio 运行时停转。

**规则**：async 代码中凡是需要跨 `.await` 持有锁的，**必须用 `tokio::sync::Mutex`**；仅在同步代码块内瞬时加锁才允许 `std::sync::Mutex`。

**反例**：
```rust
// ❌ 阻塞 tokio 线程
let guard = std::sync::Mutex::lock(&self.store).unwrap();
let result = some_async_fn().await; // 持锁跨 await
```

**修复**：
```rust
// ✓ 非阻塞
let guard = self.store.lock().await; // tokio::sync::Mutex
let result = some_async_fn().await;
```

---

## 2. tokio 并发 — 任务生命周期管理

### 2.1 drop(JoinHandle) 不取消任务

**问题**：`JoinPolicy::Any` 第一个分支完成后，用 `let _ = remaining` 丢弃剩余句柄，任务在后台继续运行，资源泄漏 + 结果写回 `inst.context`。

**规则**：tokio task 必须显式 `abort()`。需要"赢一个就停其余"时，**提前收集 `AbortHandle`，在条件满足后调用 `abort()`**。

**反例**：
```rust
// ❌ 仍在后台跑
let (winner, _, rest) = select_all(handles).await;
drop(rest); // 不取消！
```

**修复**：
```rust
// ✓ 先收集 abort handle，再 abort
let abort_handles: Vec<_> = futs.iter().map(|h| h.abort_handle()).collect();
let (winner, _, _rest) = select_all(futs).await;
for ah in abort_handles { ah.abort(); }
```

---

## 3. 状态机 — 步骤顺序与写回

### 3.1 archive-before-insert 数据丢失

**问题**：工作流步骤完成时，先调用 `archive_and_compress_context()` 再向 `inst.context.data` 插入本步输出，快照永远不含当前步骤结果。

**规则**：**先写数据，再归档**。顺序：`data.insert(step.output)` → `archive()` → 推进到下一步。

### 3.2 预算裁剪必须写回

**问题**：`apply_budget()` 对局部克隆的 `ctx` 操作，`inst.context` 未更新，裁剪形同虚设。

**规则**：context budget 裁剪后，**必须将结果写回 `inst.context.data`**，且在步骤完成的两条分支（`Some(next)` 和 `None`）都要写。

### 3.3 EscalateToMaster 超时必须终结工作流

**问题**：等待人工裁决超时后直接 `return false`，工作流停在 `Paused` 状态，`finished_at` 为空，成为 zombie。

**规则**：任何"等待外部决策"超时路径都必须设 `status = Failed`、填写 `error` 和 `finished_at`，然后再返回。

---

## 4. 字段过滤 — 白名单保护元数据

### 4.1 include_fields 会误删系统字段

**问题**：`include_fields` 白名单过滤时，`task_id / step_id / instance_id / workflow_id` 等系统元数据字段不在用户白名单中，被 `data.retain()` 一并删除，下游步骤找不到上下文定位信息。

**规则**：任何白名单过滤逻辑都必须豁免 `METADATA_KEYS` 常量中的系统字段。

```rust
const METADATA_KEYS: &[&str] = &["task_id", "step_id", "instance_id", "workflow_id"];
data.retain(|k, _| fields.contains(k) || METADATA_KEYS.contains(&k.as_str()));
```

---

## 5. 去重算法 — 相似度比较的作用域

### 5.1 non-consecutive 去重扩大作用域导致误删

**问题**：`.rev().find(|m| m.from == msg.from)` 找的是"该发送者历史上最后一条消息"，而非"紧邻的上一条消息"，导致跨对话的消息被误判为重复而丢弃。

**规则**：连续去重只能与 `result.last()` 比较（当前已输出序列的末尾），不能向更早历史搜索。

### 5.2 Levenshtein 大字符串 OOM

**问题**：4000 字符 × 4000 字符 payload 分配 128MB 矩阵，多条消息并发时内存爆炸。

**规则**：
- 字符串 >500 字符时改用 hash 相等判断（完全一致才去重）
- 长度比例 >1.2x 直接跳过（不可能相似）
- 矩阵改用 2-row 滚动数组，空间 O(min(m,n))

---

## 6. SQLite FTS5 — 触发器完整性

### 6.1 只有 INSERT 触发器导致 GC 后幽灵 rowid

**问题**：外部内容表只建了 INSERT 触发器，DELETE/UPDATE 时 FTS 索引不同步，GC 删除原始行后 FTS 中残留幽灵 rowid，搜索返回无效结果。

**规则**：FTS5 外部内容表必须同时建 **INSERT + DELETE + UPDATE** 三个触发器。

```sql
-- 缺一不可
CREATE TRIGGER ... AFTER INSERT ON source_table ...
CREATE TRIGGER ... AFTER DELETE ON source_table ...
CREATE TRIGGER ... AFTER UPDATE ON source_table ...
```

### 6.2 生产环境不能用 in-memory SQLite

**问题**：`WorkflowEngine::new()` 默认调用 `StepSnapshotStore::new_in_memory()`，进程崩溃后快照全丢，无法恢复。

**规则**：生产代码用 `new(db_path: &Path)`，`new_in_memory()` 仅限测试。用文件名或函数签名显式区分。

### 6.3 FTS5 拒绝空查询字符串

**问题**：`SELECT ... WHERE fts MATCH ''` 返回解析错误（不是空结果）。

**规则**：FTS 搜索入口加 `if query.trim().is_empty() { return Ok(vec![]); }` 早返回。

---

## 7. API 契约 — 异常 vs Result

### 7.1 抛异常的实现违反 Result 签名

**问题**：`saveCheckpoint(): Result<void>` 签名，但内部遇到 CAS 冲突时 `throw new CheckpointCASError()`，调用方按 Result 处理，错误被吞掉。

**规则**：**签名是 Result，实现就必须 return Result，禁止 throw**。CAS 冲突等可预期失败路径全部 `catch` 后转成 `{ success: false, ... }` 返回。

**补充**：Result 类型不允许携带额外字段（如 `casConflict`）时，用 `as unknown as Result<T>` 类型断言，保持运行时数据完整。

---

## 8. 配置校验 — Fast-Fail 原则

### 8.1 空 model 字符串在 API 调用时才报错

**问题**：`EKET_MODEL_MASTER=""` 被接受写入配置，运行时调用 LLM API 时报 cryptic error，难以定位来源。

**规则**：**配置构建时就校验**，`model.trim() === ''` 立即 throw，不等到运行时。参考 CLAUDE.md "Fail Fast" 原则。

---

## 9. 注册/初始化 — 重复 ID 静默覆盖

### 9.1 HashMap::collect() 静默丢失重复 key

**问题**：WorkflowDefinition 中两个步骤使用同一 `id`，`collect::<HashMap>()` 静默覆盖其中一个，运行时跳步但无任何报错。

**规则**：凡是"唯一 ID 注册"场景，**必须在 `register_definition` 时用 `HashSet` 显式校验唯一性**，发现重复立即返回 `Err`。

---

## 10. 红队审查方法论

### 10.1 红队"没找到问题"不代表没有问题

本轮红队（Linus + Jeff Dean 人格）共发现 14 项真实 bug（1 P0 + 7 P1 + 6 P2），其中：
- 3 项是单元测试已覆盖但逻辑错误未被测试发现（测试断言不够严格）
- 4 项是正确性问题（archive 顺序、写回遗漏）在集成测试前无法暴露
- 7 项是边界条件（空字符串、重复 ID、超时路径）

**规律**：红队最有效的发现集中在：**状态机边界**、**并发生命周期**、**API 契约一致性**、**资源清理路径**。

### 10.2 并行修复的依赖隔离

6 个修复 agent 并行运行时，修改同一文件（`workflow.rs`）的 agent 必须串行，否则产生 merge conflict。本轮通过任务拆分规避（TASK-215+216 合并为一个 agent）。

**规则**：并行 agent 调度前检查文件级依赖，同文件修改合并为单 agent。
