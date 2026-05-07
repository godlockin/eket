# TASK-281: I3: Auth 降级测试 — DB 不可用时 fail closed

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **负责人**: Slaver (Rust Backend)
- **创建时间**: 2026-05-06
- **领取时间**: 2026-05-06
- **完成时间**: 2026-05-06
- **依赖**: []
- **所需专家**: rust, backend
- blocked_by: []
- required_expertise: [rust, backend]

## 背景

Code review 发现 JWT auth middleware 在 DB 不可用时的行为未经测试。
需验证系统是否 fail closed（拒绝所有请求）而非 fail open（DB 挂了反而绕过鉴权）。

## 验收标准

- [ ] （待填写）

## 技术方案

### 分析结果

Auth middleware (`rust/crates/eket-server/src/auth.rs`) **无 DB 依赖**：
- JWT 验证纯本地计算（signature + expiration check）
- 静态 token 比对使用 constant-time 字符串比较
- 无数据库查询、无外部 I/O

### Fail-Closed 保证机制

**启动时**：
- `create_pool()` 创建 DB 连接池，失败则 `start()` 返回 Err
- 无法用不可访问的 DB 启动服务器 ✅

**运行时**：
- Middleware 不访问 DB → DB 故障不影响 auth 逻辑
- Handler 层 DB 错误返回 500（未来可改进为 503，见 TASK-282）
- 无代码路径在 DB 错误时绕过鉴权 ✅

### 测试策略

**集成测试** (`tests/auth_degradation.rs`):
1. 创建临时 DB
2. chmod 000 模拟权限错误
3. 尝试启动服务器
4. 断言：启动失败或超时（fail-closed）

**已跳过的场景**（需后续 ticket）:
- 运行时 DB 连接池耗尽
- Handler 层优雅降级（503 vs 500）

## Code Review 发现（Important）

**问题**：JWT auth middleware 在 DB 不可用时的行为未定义（无测试）。

**期望**：Fail closed（拒绝所有请求）  
**风险**：Fail open（DB 挂了反而绕过鉴权）

## 验收标准

- [x] 添加集成测试：`rust/crates/eket-server/tests/auth_degradation.rs`
  - ✅ 测试 DB 不可访问时服务器拒绝启动（chmod 000）
  - ✅ 测试通过（fail-closed 保证：无法用坏 DB 启动服务器）
- [x] 验证 middleware 逻辑：
  - ✅ Middleware 无 DB 依赖（JWT 验证纯本地计算）
  - ✅ 无代码路径在错误时绕过鉴权
  - ✅ DB 故障在启动时检测（connection pool creation）
- [ ] 后续：运行时 DB 降级处理（TASK-282：handler 层 503 返回）

## 实现位置

`rust/crates/eket-server/tests/` 新增测试

## 实现详情

### 新增文件

**`tests/auth_degradation.rs`** (95 lines):
- `auth_fails_closed_when_db_unavailable()`: 测试 DB 不可访问时启动失败
- `runtime_db_failure_returns_503()`: 占位测试（#[ignore]），等待 TASK-282

### 测试结果

```
cargo test --package eket-server --test auth_degradation
```

- ✅ 1 passed (auth_fails_closed_when_db_unavailable)
- 1 ignored (runtime_db_failure_returns_503)
- 执行时间: ~30s

### 关键发现

1. **Middleware 本身不需修改**
   - 无 DB 访问代码
   - 错误处理已正确（401 Unauthorized）
   
2. **启动时 Fail-Closed 已实现**
   - `create_pool()` 失败传播给 `start()`
   - 无法绕过 DB 连接检查
   
3. **后续改进点（非本 ticket 范围）**
   - Handler 层 DB 错误返回 503 而非 500
   - 健康检查端点报告 DB 状态
   - 连接池健康监控

### 测试通过截图

```
cargo test: 1 passed, 1 ignored (1 suite, 30.03s)
```

## 经验沉淀

### 架构洞察

**Auth 层与 DB 层解耦的安全优势**：
- Auth middleware 无 DB 依赖 → DB 故障不影响鉴权逻辑
- JWT 验证纯计算（signature + exp）→ 无外部依赖点
- 减少攻击面：DB 注入/DoS 无法绕过 auth

### 测试策略

**集成测试 DB 故障模拟技巧**：
- Unix: `chmod 000` 撤销权限
- Non-Unix: `fs::rename()` 隐藏文件
- 避免硬编码 OS 假设（#[cfg(unix)] 条件编译）

**Fail-Closed 验证层次**：
1. **最强保证**：启动失败（本 ticket）
2. **次强保证**：运行时 503（TASK-282）
3. **最弱保证**：仅 middleware 拒绝（已有单元测试）

### Pitfalls

1. **测试异步超时设置**
   - `tokio::time::timeout(2s)` 防止服务器启动卡死
   - 服务器启动失败可能返回 Err 或永久阻塞
   
2. **TempDir 清理失败**
   - chmod 000 后 TempDir::drop() 无法删除文件
   - 需显式恢复权限（#[cfg] 条件处理）

3. **测试隔离**
   - `std::env::set_var()` 全局污染
   - 测试后必须 `remove_var()` 避免影响其他测试

### 后续 Ticket

创建 TASK-282: Handler 层 DB 降级处理
- 运行时连接池错误返回 503 而非 500
- 健康检查端点 `/health` 报告 DB 状态
- Circuit breaker 模式防止 DB 雪崩
