# TASK-275 经验教训

## 技术要点

### 1. Rust 异步退出清理模式

**问题**：`tokio::select!` 多分支退出，如何统一清理？

**方案**：提取 `cleanup_on_exit()` 函数，在两个分支末尾调用：
```rust
tokio::select! {
    _ = tokio::signal::ctrl_c() => {
        cleanup_on_exit(&id, &client).await;
        // output event
    }
    _ = poll => {
        cleanup_on_exit(&id, &client).await;
    }
}
```

**避免使用 Drop trait**：
- Drop 在同步上下文，无法 `.await`
- 清理涉及异步 DB 操作 → 必须在 async 函数中

### 2. 混合架构清理责任划分

**Shell 写入 → Rust 清理**：
- `eket-start.sh` 写 `instance_config.yml`
- `slaver:poll` Rust 进程退出时删除
- **教训**：配置文件生命周期应与进程绑定，避免残留

**DB 状态管理**：
- 使用 `update_instance_status()` + `update_instance_last_seen()` 原子更新
- 失败静默处理（`tracing::warn`），不阻塞退出流程

### 3. macOS 测试环境差异

**问题**：GNU `timeout` 命令不存在

**解决**：
- 方案 1：`brew install coreutils` → `gtimeout`
- 方案 2：后台进程 + `sleep` + `kill -INT $PID`

**测试脚本模式**：
```bash
# 自动测试
./cmd &
PID=$!
sleep 3
kill -INT $PID

# 手动测试（交互指引）
read -n 1  # 等待用户确认
./cmd      # Ctrl+C 停止
```

### 4. Agent dispatch 回写设计原则

**关键约束**：Agent 隔离上下文，无主目录写权限

**推荐方案**：主会话监听 → 代理回写
```rust
let result = agent.wait()?;  // 主会话等待
if result.success {
    task::complete(&result.task_id)?;  // 主会话写 MD/DB
}
```

**备选方案**：信号文件 IPC
- Agent 写 `.eket/state/completed-*.signal`
- 主会话 poll/fswatch 触发回写
- **缺点**：引入轮询开销，增加复杂度

**接口设计要点**：
- `AgentResult` 包含 `success` + `task_id` + `output`
- `wait()` 方法阻塞直到 Agent 完成
- 错误处理：超时、崩溃、部分完成

## Pitfall

### ❌ 在 Drop 中执行异步清理
```rust
impl Drop for SlaverGuard {
    fn drop(&mut self) {
        // ❌ 无法 .await
        db.update_instance_status("offline").await;
    }
}
```

### ❌ 清理失败阻塞退出
```rust
// ❌ 文件删除失败就 panic
std::fs::remove_file(config)?;  // 如果文件不存在会报错

// ✅ 静默失败，记录日志
if let Err(e) = std::fs::remove_file(config) {
    tracing::debug!("cleanup: {e}");
}
```

### ❌ Agent 回写时直接写主目录
```rust
// ❌ Agent 无权限写主目录
std::fs::write("../../jira/tickets/TASK-001.md", "done")?;

// ✅ 主会话代理回写
struct AgentResult { task_id: String, success: bool }
// 主会话根据 result 调用 task::complete()
```

## 通用知识沉淀

**进程退出清理模式**：
1. 捕获信号：`tokio::signal::ctrl_c()`
2. 提取清理函数：避免代码重复
3. 静默失败：清理操作不应阻塞退出
4. 日志记录：`tracing` 分级（debug/info/warn）

**跨进程状态回写**：
1. 主会话监听模式（推荐）：等待 + 代理
2. 信号文件 IPC（备选）：poll/fswatch
3. Redis Pub/Sub（重量级）：分布式场景

**测试脚本最佳实践**：
- 后台进程：`cmd & PID=$!; ...; kill -INT $PID`
- 验证断言：`[[ "$actual" == "$expected" ]] || exit 1`
- 清理旧数据：测试前 `DELETE FROM ... WHERE id='test_*'`
