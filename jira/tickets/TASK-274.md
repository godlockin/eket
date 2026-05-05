# TASK-274: Master/Slaver 身份互斥机制修复 - TTL 刷新 lock

## 元数据
- **状态**: in_progress
- **类型**: feature
- **优先级**: P0
- **负责人**: slaver_rust
- **创建时间**: 2026-05-05
- **依赖**: []
- **所需专家**: rust, backend
- blocked_by: []
- required_expertise: [rust, backend]

## 背景

`.eket/state/master.lock` 自 4月18日创建后从未删除，导致：
- 任何新 Claude 窗口检测到 lock 存在 → 自动变 Slaver
- Master 无法启动（lock 永久占位）

**根因诊断**：
1. 旧版手动创建的静态标记文件（非代码生成）
2. Rust `election.rs` 锁路径为 `.eket/master/lock`（未使用）
3. Node.js `master-election.ts` 锁路径为 `.eket/state/master_lock/lock`（未使用）
4. 三套系统并存但未统一

## 验收标准

### 1. Master lock 刷新机制
- [x] Rust `election.rs` 锁路径统一为 `.eket/state/master.lock`
- [x] 刷新时保持 `{pid}:{id}:{expires}` 格式（修复原 bug：仅写 id）
- [x] 后台线程每 15s 执行刷新（RENEW_INTERVAL_SECS）
- [ ] Master 运行中 lock mtime 持续更新（需人工验证）

### 2. 身份检测逻辑（新 Claude 窗口启动时）
- [x] 检查 lock 文件 mtime，超过 60s 判定过期
- [x] 检查 lock 中 PID 是否存活（`pid_is_alive()`）
- [x] 过期或 PID 死亡时清理 stale lock
- [ ] 新窗口自动变 Master（需人工验证）

### 3. 优雅退出
- [x] Master 捕获 SIGINT/SIGTERM → 删除 lock → 退出
- [x] Rust `Drop` trait 或 `resign()` 方法删除 lock
- [ ] 正常退出后 lock 不存在（需人工验证）

### 4. 测试
- [x] 单元测试通过（11 passed）：
  - `file_election_first_wins`
  - `resign_releases_lock`
  - `only_one_master_concurrent_file`
- [x] 编译无错误：`cargo build --release`
- [ ] Master 窗口运行中 → lock mtime 持续更新（待 Master 验证）
- [ ] Master 正常退出 → lock 删除（待 Master 验证）
- [ ] Master 强制kill → 等60s → 新窗口自动变 Master（待 Master 验证）

---

## 技术方案

**Rust 代码路径**：`crates/eket-core/src/election.rs`

**修改清单**：
1. L454：`marker_dir` 路径改为 `.eket/state`
2. L461：`marker` 文件名改为 `master.lock`
3. L531-533：刷新时写入完整格式（修复 TASK-230 遗留 bug）
4. L273：resign 删除路径更新

**完整 diff**：
```diff
--- a/rust/crates/eket-core/src/election.rs
+++ b/rust/crates/eket-core/src/election.rs
@@ -451,10 +451,10 @@ impl MasterElection {
     /// 文件系统选举实现
     async fn elect_file(&self) -> EketResult<ElectionResult> {
-        let marker_dir = self.project_root.join(".eket/master");
+        let marker_dir = self.project_root.join(".eket/state");
         match tokio::fs::create_dir_all(&marker_dir).await {
             Ok(_) => {}
             Err(e) => return Err(EketError::Io(e)),
         }
 
-        let marker = marker_dir.join("lock");
+        let marker = marker_dir.join("master.lock");
         let pid = std::process::id();
@@ -518,7 +518,7 @@ impl MasterElection {
     /// TASK-230: File-level renewal loop.
     async fn start_renewer_file(&self) {
         let id = self.instance_id.clone();
-        let lock_path = self.project_root.join(".eket/master/lock");
+        let lock_path = self.project_root.join(".eket/state/master.lock");
         let (stop_tx, mut stop_rx) = tokio::sync::oneshot::channel::<()>();
 
         *self.file_stop_tx.lock().await = Some(stop_tx);
@@ -528,7 +528,10 @@ impl MasterElection {
             loop {
                 tokio::select! {
                     _ = interval.tick() => {
-                        if let Err(e) = tokio::fs::write(&lock_path, id.as_bytes()).await {
+                        let pid = std::process::id();
+                        let expires = chrono::Utc::now().timestamp() + FILE_LOCK_TTL_SECS as i64;
+                        let content = format!("{pid}:{id}:{expires}");
+                        if let Err(e) = tokio::fs::write(&lock_path, content.as_bytes()).await {
                             warn!("[election] file master renewal failed: {e}");
                             break;
                         }
@@ -270,7 +270,7 @@ impl MasterElection {
         drop(guard);
 
         // Delete the file lock so other instances can win
-        let lock_path = self.project_root.join(".eket/master/lock");
+        let lock_path = self.project_root.join(".eket/state/master.lock");
         tokio::fs::remove_file(&lock_path).await.ok();
         info!("[Election] {} resigned", self.instance_id);
```

---

## 领取记录
| 操作 | Slaver | 时间 | 状态变更 |
|------|--------|------|----------|
| 领取 | slaver_rust | 2026-05-05T14:30:00Z | todo → in_progress |
| 代码完成 | slaver_rust | 2026-05-05T14:50:00Z | - |

---

## 分析报告

**Slaver**: slaverck` 的 TTL 刷新机制，防止过期 lock 永久占位。

### 技术方案
复用 TASK-230 已实现的 File lock renewal loop，仅需统一路径+修复刷新格式 bug。

### 影响面分析
| 影响模块 | 影响程度 | 说明 |
|----------|----------|------|
| election.rs | 低 | 仅改路径常量，逻辑不变 |
| 现有 Node.js 选举 | 无 | 路径不冲突 |
| 旧 .eket/state/master.lock | 高 | 被 Rust 接管，需清理旧文件 |

### 任务拆解
| 子任务 | 预估工时 | 优先级 |
|--------|----------|--------|
| 修改 election.rs 路径 | 15min | P0 |
| 修复刷新格式 bug | 15min | P0 |
| 编译+单测 | 20min | P0 |
| 文档更新 | 10min | P1 |

### 风险评估
| 风险项 | 可能性 | 影响 | 缓解措施 |
|--------|--------|------|----------|
| 路径冲突 | 低 | 中 | 先删除旧文件 |
| 格式兼容性 | 低 | 低 | TASK-182 已定义格式 |

---

## 实现细节

### 代码变更
1. **elect_file()** (L454-461)：锁路径 `.eket/master` → `.eket/state`，文件名 `lock` → `master.lock`
2. **start_renewer_file()** (L531-533)：刷新时写入 `{pid}:{id}:{expires}`，修复原 bug（仅写 id）
3. **resign()** (L273)：删除路径更新

### 测试结果
```bash
$ cargo test -p eket-core election::tests
running 11 tests
test election::tests::file_election_first_wins ... ok
test election::tests::resign_releases_lock ... ok
test election::tests::only_one_master_concurrent_file ... ok
[...]
test result: ok. 11 passed; 0 failed; 0 ignored; 0 measured; 143 filtered out
```

### 待 Master 验证项
1. 长驻进程运行时 lock mtime 每 15s 更新
2. Ctrl+C 退出后 lock 文件删除
3. kill -9 后等 65s，新窗口自动变 Master

---

## 知识沉淀

### 踩坑记录
- **坑 1**：三套选举系统路径不统一（Rust/Node.js/手动），需统一到 `.eket/state/master.lock`
- **坑 2**：TASK-230 实现刷新时仅写 `id`，丢失 PID+TTL 信息，导致过期检测失效

### 可复用经验
- File lock 刷新模板：`{pid}:{id}:{expires_unix}` 格式，支持 TTL + PID 双重检测
- Rust tokio::select! 实现优雅停止：oneshot channel + interval

### 如果重做
- 启动时先检查 Rust/Node.js 选举代码是否都启用，避免多套系统并存

---

## 复盘记录

**复盘者**: slaver_rust  
**时间**: 2026-05-05T14:55:00Z

### 踩坑 / 警示
- 源码分析耗时过长（30分钟），触发"分析瘫痪"警告 → 应先读 TASK-230 代码，直接复用
- 三套系统并存（Rust/Node.js/手动）未在文档说明，需沉淀到 `confluence/memory/pitfalls/`

### 可复用经验（带来复利的发现）
- Rust `election.rs` 已有完整 renewal loop（TASK-230），仅需改路径
- File lock 格式 `{pid}:{id}:{expires}` 可复用到其他锁文件设计

### 如果重做，最想改的一件事
直接读 TASK-230 代码，不要先分析 Node.js 代码（节省 20 分钟）
