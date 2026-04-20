# EKET Rust 移植 - 修复指南

## P1 优先级修复 - 本周完成

### 修复 1: Master Election 声明等待期

**文件**: `rust/crates/eket-core/src/election.rs`

**问题**: 无声明等待期 → 多个 instance 可能同时认为自己是 MASTER

**修复代码**:

```rust
impl MasterElection {
    pub async fn elect(&self) -> EketResult<ElectionResult> {
        info!("[Election] {} starting...", self.instance_id);

        // Level 1: Redis
        if let Some(redis) = &self.redis {
            if redis.is_available() {
                match self.elect_redis(redis).await {
                    Ok(result) => {
                        if result.is_master {
                            // 🆕 添加声明等待期
                            if let Err(e) = self.declaration_period_redis(redis).await {
                                warn!("[Election] Declaration period failed: {e}");
                                return Ok(ElectionResult {
                                    is_master: false,
                                    instance_id: self.instance_id.clone(),
                                    level: ElectionLevel::Redis,
                                });
                            }
                            self.start_renewer_redis(redis.clone()).await;
                        }
                        return Ok(result);
                    }
                    Err(e) => {
                        warn!("[Election] Redis failed: {e}, trying SQLite...");
                    }
                }
            }
        }

        // ... 其他 levels ...
    }

    /// 声明等待期（2 秒）— 轮询检测其他竞争者
    async fn declaration_period_redis(&self, redis: &EketRedisClient) -> EketResult<()> {
        const DECLARATION_PERIOD: u64 = 2000; // 2 seconds
        const POLL_INTERVAL: u64 = 100; // 100ms
        let start = std::time::Instant::now();
        
        while start.elapsed().as_millis() < DECLARATION_PERIOD as u128 {
            // 检查是否有其他 Master 声明
            match redis.get("eket:master:declaration").await {
                Ok(Some(other_id)) if other_id != self.instance_id => {
                    return Err(EketError::Other(format!("Other master detected: {other_id}")));
                }
                _ => {}
            }
            
            tokio::time::sleep(Duration::from_millis(POLL_INTERVAL)).await;
        }
        
        // 发送正式声明
        redis.setex("eket:master:declaration", 30, &self.instance_id).await?;
        info!("[Election] Declaration sent: {}", self.instance_id);
        Ok(())
    }

    // 类似地为 SQLite 和 File 添加声明等待期...
}
```

**验证方法**:

```bash
# 终端1
RUST_LOG=info cargo run --bin eket-cli -- master:test

# 终端2 (同时运行)
RUST_LOG=info cargo run --bin eket-cli -- master:test

# 验证: 只有一个输出 "is_master=true"
```

**预期时间**: 1-2 小时

---

### 修复 2: Task Claim SQLite 竞争保护

**文件**: `rust/crates/eket-cli/src/commands/task_claim.rs`

**问题**: 多个 Slaver 可能同时领取同一任务

**当前代码** (有问题):

```rust
// 只是读文件，无原子保护
let mut ticket = find_ticket(&tickets_dir, id)?;
if ticket.status != TicketStatus::Todo {
    // 错误：此时其他 Slaver 可能已经改变 ticket 状态
}
ticket.set_status(TicketStatus::InProgress, Some(&slaver_id))?;
```

**修复代码**:

```rust
use eket_core::db::{create_pool, SqliteClient};

async fn claim_task_atomic(
    pool: &DbPool,
    ticket_id: &str,
    slaver_id: &str,
) -> Result<bool> {
    let pool = pool.clone();
    let ticket_id = ticket_id.to_string();
    let slaver_id = slaver_id.to_string();
    
    tokio::task::spawn_blocking(move || -> Result<bool> {
        let conn = pool.get()?;
        
        // 原子操作：检查 + 更新 = 一个事务
        let tx = conn.transaction()?;
        
        // 检查状态
        let status: String = tx.query_row(
            "SELECT status FROM tasks WHERE id = ?1",
            rusqlite::params![&ticket_id],
            |row| row.get(0),
        )?;
        
        if status != "todo" {
            return Ok(false); // Already claimed
        }
        
        // 原子更新
        let rows = tx.execute(
            "UPDATE tasks SET status = 'in_progress', claimed_by = ?1, claimed_at = ?2 WHERE id = ?3",
            rusqlite::params![&slaver_id, chrono::Utc::now().to_rfc3339(), &ticket_id],
        )?;
        
        tx.commit()?;
        Ok(rows > 0)
    })
    .await?
}

pub async fn run(ticket_id: Option<String>) -> Result<()> {
    let config = EketConfig::load().unwrap_or_default();
    let project_root = find_project_root().unwrap_or_else(|| std::env::current_dir().unwrap());
    let slaver_id = get_or_create_slaver_id(&project_root);
    
    // ... 找 ticket ...
    
    // 🆕 原子领取
    let pool = create_pool(&config.sqlite.path)?;
    let claimed = claim_task_atomic(&pool, &ticket.id, &slaver_id).await?;
    
    if !claimed {
        println!("{}", serde_json::to_string_pretty(&json!({
            "status": "error",
            "message": format!("Task {} already claimed by another slaver", ticket.id),
        }))?);
        return Ok(());
    }
    
    // ... 继续正常流程 ...
}
```

**验证方法**:

```bash
# 测试脚本: test_concurrent_claim.sh
#!/bin/bash

export EKET_SLAVER_ID=slaver_1
cargo run --bin eket-cli -- task:claim FEAT-123 &
PID1=$!

export EKET_SLAVER_ID=slaver_2
cargo run --bin eket-cli -- task:claim FEAT-123 &
PID2=$!

wait $PID1 $PID2

# 验证: 一个返回 "claimed"，一个返回 "error"
```

**预期时间**: 2-3 小时

---

### 修复 3: task:claim JSON 输出补齐

**文件**: `rust/crates/eket-cli/src/commands/task_claim.rs`

**问题**: Slaver Prompt 需要的字段缺失

**缺失字段**:
- `rules_path` - Slaver 无法找到规则文件
- `worktree_path` - Slaver 无法进行代码隔离
- `assigned_instance` - Slaver 无法了解分配的 agent

**修复代码**:

```rust
// 在 write_active_context() 之前添加

fn get_rules_path(project_root: &Path, ticket_type: &str) -> PathBuf {
    // 根据 ticket 类型选择规则文件
    let rules_dir = project_root.join(".eket/rules");
    match ticket_type {
        "feature" => rules_dir.join("feature-rules.md"),
        "bugfix" => rules_dir.join("bugfix-rules.md"),
        "task" => rules_dir.join("task-rules.md"),
        "improvement" => rules_dir.join("improvement-rules.md"),
        _ => rules_dir.join("default-rules.md"),
    }
}

pub async fn run(ticket_id: Option<String>) -> Result<()> {
    // ... 前面的代码 ...
    
    let rules_path = get_rules_path(&project_root, &ticket.priority);
    let worktree_path = project_root.join(".claude").join("worktrees").join(&ticket.id);
    
    // Output JSON with all fields
    let report = json!({
        "status": "claimed",
        "ticket_id": ticket.id,
        "title": ticket.title,
        "priority": ticket.priority,
        "slaver_id": slaver_id,
        "project_root": project_root.display().to_string(),
        "instructions": format!(
            "Ticket {} claimed. Implement the requirements, then run: eket task:complete {}",
            ticket.id, ticket.id
        ),
        // 🆕 新增字段
        "rules_path": rules_path.display().to_string(),
        "worktree_path": worktree_path.display().to_string(),
        "assigned_instance": null, // 后续可从 InstanceRegistry 获取
        "role": "developer", // 后续可从角色匹配获取
        "recommended_level": 1, // 后续可从 SkillIndex 获取
    });

    println!("{}", serde_json::to_string_pretty(&report)?);
    Ok(())
}
```

**验证方法**:

```bash
cargo run --bin eket-cli -- task:claim FEAT-123 | jq '.rules_path'
# 应输出规则文件路径
```

**预期时间**: 1 小时

---

## P2 优先级修复 - 下周开始

### 修复 4: Circuit Breaker 模块（新文件）

**文件**: `rust/crates/eket-core/src/circuit_breaker.rs` (新建)

**预期工作量**: 8-12 小时

**参考 TS 实现**: `node/src/core/circuit-breaker.ts` (Lines 80-412)

**Rust 框架**:

```rust
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tracing::warn;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CircuitState {
    Closed,
    Open,
    HalfOpen,
}

pub struct CircuitBreaker {
    state: Arc<Mutex<CircuitState>>,
    failures: Arc<Mutex<u32>>,
    successes: Arc<Mutex<u32>>,
    failure_threshold: u32,
    success_threshold: u32,
    timeout: Duration,
    opened_at: Arc<Mutex<Option<Instant>>>,
}

impl CircuitBreaker {
    pub fn new(
        failure_threshold: u32,
        success_threshold: u32,
        timeout: Duration,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(CircuitState::Closed)),
            failures: Arc::new(Mutex::new(0)),
            successes: Arc::new(Mutex::new(0)),
            failure_threshold,
            success_threshold,
            timeout,
            opened_at: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn execute<T, F, Fut>(&self, operation: F) -> Result<T, String>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T, String>>,
    {
        // 检查是否可执行
        if !self.can_execute() {
            return Err("Circuit open".to_string());
        }

        // 执行操作
        match operation().await {
            Ok(result) => {
                self.on_success();
                Ok(result)
            }
            Err(e) => {
                self.on_failure();
                Err(e)
            }
        }
    }

    fn can_execute(&self) -> bool {
        let state = self.state.lock().unwrap();
        match *state {
            CircuitState::Closed => true,
            CircuitState::Open => {
                if let Some(opened) = *self.opened_at.lock().unwrap() {
                    if opened.elapsed() >= self.timeout {
                        drop(state);
                        *self.state.lock().unwrap() = CircuitState::HalfOpen;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            CircuitState::HalfOpen => true,
        }
    }

    fn on_success(&self) {
        let mut state = self.state.lock().unwrap();
        match *state {
            CircuitState::HalfOpen => {
                let mut successes = self.successes.lock().unwrap();
                *successes += 1;
                if *successes >= self.success_threshold {
                    drop(successes);
                    drop(state);
                    self.reset();
                }
            }
            CircuitState::Closed => {
                *self.failures.lock().unwrap() = 0;
            }
            _ => {}
        }
    }

    fn on_failure(&self) {
        let mut failures = self.failures.lock().unwrap();
        *failures += 1;

        if *failures >= self.failure_threshold {
            drop(failures);
            let mut state = self.state.lock().unwrap();
            *state = CircuitState::Open;
            *self.opened_at.lock().unwrap() = Some(Instant::now());
            warn!("[CircuitBreaker] Circuit opened");
        }
    }

    fn reset(&self) {
        let mut state = self.state.lock().unwrap();
        *state = CircuitState::Closed;
        *self.failures.lock().unwrap() = 0;
        *self.successes.lock().unwrap() = 0;
        *self.opened_at.lock().unwrap() = None;
    }
}
```

**优先级**:
1. 基础 CircuitBreaker
2. RetryExecutor with exponential backoff
3. 集成到 message-queue 和 election

---

## 集成测试用例

### 并发竞争测试

```rust
#[tokio::test]
async fn test_concurrent_master_election() {
    let dir = TempDir::new().unwrap();
    let e1 = MasterElection::new(None, None, dir.path());
    let e2 = MasterElection::new(None, None, dir.path());
    
    // 并发竞争
    let r1 = tokio::spawn({
        let e = e1.clone();
        async move { e.elect().await }
    });
    
    let r2 = tokio::spawn({
        let e = e2.clone();
        async move { e.elect().await }
    });
    
    let (res1, res2) = tokio::join!(r1, r2);
    let r1 = res1.unwrap().unwrap();
    let r2 = res2.unwrap().unwrap();
    
    // 验证: 恰好一个是 master
    assert_ne!(r1.is_master, r2.is_master);
    assert!(r1.is_master || r2.is_master);
}

#[tokio::test]
async fn test_concurrent_task_claim() {
    // 创建 2 个 slaver 同时领取同一任务
    let result1 = tokio::spawn(async {
        claim_task_atomic(&pool, "FEAT-123", "slaver_1").await
    });
    
    let result2 = tokio::spawn(async {
        claim_task_atomic(&pool, "FEAT-123", "slaver_2").await
    });
    
    let (r1, r2) = tokio::join!(result1, result2);
    
    // 验证: 恰好一个成功
    let success_count = (r1.unwrap() as u32 + r2.unwrap() as u32) as usize;
    assert_eq!(success_count, 1, "Only one slaver should claim the task");
}
```

---

## 代码审查检查清单

在提 PR 前，检查这些内容：

- [ ] 所有修复都有单元测试
- [ ] 并发场景都有测试覆盖
- [ ] 错误处理遵循原 TS 版逻辑
- [ ] JSON 输出格式与 TS 版兼容
- [ ] 日志输出使用 `tracing` 框架
- [ ] 没有 `unwrap()` 在生产路径上
- [ ] 所有 `TODO` 和 `FIXME` 都有追踪号
- [ ] 性能没有明显下降（可用 flame graph）

---

## 集成检查清单

优先级从高到低：

### 关键路径 (必须通过)

- [ ] Master election 三级降级成功
- [ ] 同一项目多个 instance 只有一个 MASTER
- [ ] task:claim 后状态变为 in_progress
- [ ] task:complete 后状态变为 done
- [ ] JSON 输出包含必要字段

### 容错路径 (应该通过)

- [ ] Redis 不可用 → SQLite 接管 → 文件系统接管
- [ ] Message Queue 降级正常
- [ ] 并发 claim 有一个失败（保护机制）
- [ ] 多 instance 选举只有一个 MASTER

### 数据一致性 (需要验证)

- [ ] Slaver ID 持久化（重启后相同）
- [ ] SQLite checkpoint 完整
- [ ] Commit trailer 幂等（不重复添加）
- [ ] 没有孤立的 worktree 或文件

---

**修复指南完成**

持续更新此文档以反映实际修复进度。
