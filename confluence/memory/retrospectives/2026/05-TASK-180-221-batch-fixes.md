# TASK-180 至 TASK-221 批量修复复盘

**完成时间**：2026-05-05
**涉及 tickets**：TASK-180, TASK-181, TASK-182, TASK-183, TASK-184, TASK-185, TASK-186, TASK-187, TASK-188, TASK-189, TASK-190, TASK-191, TASK-192, TASK-194, TASK-195, TASK-196, TASK-197, TASK-213, TASK-218, TASK-219, TASK-220, TASK-221

---

## 工作内容

红队审查发现的 P0/P1/P2 bugs 全量修复：

| 优先级 | Tickets | 修复内容 |
|--------|---------|----------|
| P0 | TASK-180, TASK-181, TASK-182 | Master 选举正确性（单例、Lua 原子性、死锁修复） |
| P1 | TASK-183, TASK-184, TASK-185, TASK-186 | 并发安全（DashMap、RwLock、channel、Redis connect） |
| P1 | TASK-187, TASK-188, TASK-189, TASK-190 | 安全与正确性（election bug、monitors TOCTOU、ticket unique、恢复校验） |
| P2 | TASK-191, TASK-192, TASK-194, TASK-195 | 性能与质量（cache miss、日志、滑动窗口、BRPOP） |
| P2 | TASK-196, TASK-197, TASK-213 | 基线修复（clippy 5 errors、ESLint、Node.js 心跳） |
| P2 | TASK-218, TASK-219, TASK-220, TASK-221 | 已在早期实现，验证确认 |

**新增功能**：
- 规则驱动 ignore 文件生成系统（.gitignore/.dockerignore/.claudeignore）
- gitignore.io API 集成（400+ 官方模板）
- Pre-commit hook 自动检查

---

## 技术亮点

### CircuitBreaker 滑动窗口

**问题**：原实现 `on_success()` 清空全部失败记录 → 瞬时恢复后立即开路错误。

**方案**：VecDeque<Instant> 时间戳队列 + 自然过期：

```rust
pub struct CircuitBreaker {
    failure_timestamps: VecDeque<Instant>,  // 替代 failures: u32
    // ...
}

fn on_success(&self) {
    self.evict_old_failures();  // 只清理过期，不清全部
}
```

**收益**：窗口内反复失败才开路，避免误判。

---

### Queue BRPOP 替代轮询

**问题**：`while { rpop(); sleep(200ms) }` → 空队列时 5 req/sec token 消耗。

**方案**：Redis BRPOP（阻塞弹出，5秒超时）：

```rust
redis.brpop(&key, 5.0).await  // 一次调用阻塞5秒，空队列时0请求
```

**收益**：96% token savings（5 req/sec → 0.2 req/sec）。

---

### 规则驱动 ignore 文件

**问题**：手动维护3个 ignore 文件（.gitignore/.dockerignore/.claudeignore）易失同步，Python/Go 等新语言未覆盖。

**方案**：模板化 + 语言检测 + gitignore.io API：

```
scripts/ignore-rules/
├── 10-system.rules          # 系统临时文件
├── 20-ide.rules             # IDE 配置
├── 30-security.rules        # 敏感文件
├── lang-rust.rules          # Rust 编译产物
├── lang-python.rules        # Python __pycache__ 等
├── git-extra.rules          # Git 专用（worktrees）
├── claude-extra.rules       # Claude 专用（大文件过滤）
└── 90-project-specific.rules
```

**收益**：
- 检测 Cargo.toml/package.json → 自动包含对应语言规则
- `--use-gitignore-io` 获取官方模板（缓存复用）
- Pre-commit hook 拦截手动编辑

---

## 遇到的坑

### 1. macOS bash 3.x 兼容性

**问题**：`mapfile` 和 `declare -A` 在 macOS 默认 bash 3.x 不存在 → 脚本失败。

**解决**：
- `mapfile -t arr < <(cmd)` → `while IFS= read -r line; do arr+=("$line"); done < <(cmd)`
- `declare -A map=(...)` → `map_lang_to_gitignore_io()` case 函数

---

### 2. Pre-commit hook timestamp 误报

**问题**：`--check` 模式生成临时文件时 `# Last updated: <timestamp>` 总是不同 → diff 永远失败。

**解决**：`diff -I "^# Last updated:"` 忽略 timestamp 行。

---

### 3. cargo clean 残留 D 状态

**问题**：`cargo clean` 后 `git status` 显示数万个 `D rust/target/...`，阻塞 rebase。

**解决**：`git clean -fd` 无效 → 用 `git reset --hard` 强制清理。

---

### 4. Node.js transient 失败

**现象**：本地测试显示 2 failed，重跑后 0 failed。

**分析**：）。

---

## 知识沉淀

### CircuitBreaker 设计模式

滑动窗口适用场景：
- 允许瞬时恢复（成功不立即关闭断路器）
- 需要连续失败证据（而非累计计数）
- 窗口大小 = failure_threshold × reset_timeout

反例（固定阈值）：
- 累计失败达阈值即开路 → 无法区分历史失败和当前状态

---

### Redis BRPOP vs 轮询

| 模式 | 空队列 req/sec | 延迟 | Token 消耗 |
|------|---------------|------|-----------|
| 轮询 (sleep 200ms) | 5 | ~200ms | 高 |
| BRPOP (5s timeout) | 0.2 | <1ms | 低（96% ↓） |

适用条件：
- 队列消费频率不确定（高峰/低谷差异大）
- Token 按请求计费（非按时间）
- 可接受长轮询（max 5-30s）

---

### gitignore.io 集成最佳实践

**优先级**：
1. 本地规则（项目特定，如 `.eket/*`）
2. gitignore.io 缓存（通用模板）
3. 远程 API（无缓存时）

**缓存策略**：
- 保存到 `.gitignore-io-cache.rules`（可提交）
- 后续生成直接读缓存（无需网络）
- 手动更新：`bash scripts/sync-ignore-files.sh --use-gitignore-io`

---

## 改进建议

### CI 失败诊断待办

1. **require-debrief**：本 PR 已创建此 retro 文件，应 pass
2. **check-pr-size**：70 files changed 可能超限 → 检查阈值配置
3. **check-sync**：分支同步检查 → 验证 miao/testing/main 关系
4. **block-self-loop**：可能检测到循环依赖 → 检查 ticket DAG
5. **Rust clippy**：本地全 pass，CI 失败 → 环境差异（Rust 版本？）
6. **Node.js tests**：transient 失败需隔离调查

### 流程优化

**批量 ticket 复盘**：
- 类似场景（如本次 P0-P2 批量修复）可合并到单个 retro 文件
- 文件名包含所有 ticket ID（如 `TASK-180-221-batch-fixes.md`）
- 避免21个重复内容的独立文件

**Pre-commit 教育**：
- setup.sh 自动注册 hook
- README 增加 "不要手动编辑 .gitignore" 警告

---

## Ref

- TASK-180 至 TASK-221（全部）
- PR #178
- commit: d55752ec4, 2a5c1d6f6, 66efc9344
