# EKET TypeScript 原版 → Rust 移植 行为等价性分析报告

**分析时间**: 2026/04/20  
**分析员**: Claude Code  
**项目**: EKET 分布式任务框架  
**关键目标**: 确保 Rust 版本保持 TS 原版的所有核心行为约定

---

## 目录

1. [行为契约提取](#行为契约提取)
2. [行为差异报告](#行为差异报告)
3. [task:claim JSON 格式对比](#taskclaim-json-格式对比)
4. [缺失的 TS 功能清单](#缺失的-ts-功能清单)
5. [验证检查清单](#验证检查清单)

---

## 行为契约提取

### 1. Master Election (master-election.ts → election.rs)

#### 关键状态机

```
状态集合: SLAVER → (trying-lock) → MASTER 或 SLAVER（永驻）

状态转换流程:
┌─────────────────────────────────────────────────────────────┐
│ 三级选举降级（Level 1 → Level 2 → Level 3）              │
├─────────────────────────────────────────────────────────────┤
│ Level 1: Redis SETNX                                        │
│   ├─ 成功 → MASTER + 启动续租 + 创建 marker 文件           │
│   └─ 失败 → 降级                                            │
│                                                             │
│ Level 2: SQLite INSERT OR REPLACE （事务保证）             │
│   ├─ 成功 → MASTER + 启动续租                              │
│   └─ 失败 → 降级                                            │
│                                                             │
│ Level 3: 文件系统 mkdir (原子操作)                         │
│   ├─ 成功 → MASTER                                          │
│   └─ 失败 → SLAVER (永驻状态)                              │
└─────────────────────────────────────────────────────────────┘

宣言等待期（Declaration Period）:
  ├─ TS版: 等待 config.declarationPeriod（默认 2 秒）
  │         每 100ms 轮询一次检测其他声明
  │
  └─ Rust版: 【⚠️ 差异】没有声明等待期！
      直接返回 elect 结果，不等待

选举完成后行为:
  ├─ TS版:
  │   ├─ 定期续租（间隔 = leaseTime/2）
  │   ├─ 启动 Warm Standby 心跳（可选）
  │   └─ 创建 Master marker 文件: confluence/.eket_master_marker
  │
  └─ Rust版:
      ├─ 定期续租（间隔 = 10 秒，< TTL/2）
      ├─ 无 Warm Standby 支持
      └─ 无 marker 文件创建
```

#### 副作用清单

| 操作 | TS 版 | Rust 版 | 备注 |
|-----|------|--------|------|
| Redis 写入 | ✅ `redis.set(master:lock, ...)` | ✅ `redis.setnx(...)` | 两者都是 NX 原子操作 |
| Redis 续租 | ✅ `redis.set(..., 'XX')` 定期更新 | ✅ `redis.set(..., TTL)` 定期更新 | TTL 分别为 leaseTime/config.leaseTime |
| SQLite 写入 | ✅ 使用事务，`INSERT OR REPLACE` | ✅ 使用事务，`INSERT OR IGNORE` | **差异**: TS 用 REPLACE，Rust 用 IGNORE |
| SQLite 续租 | ✅ `UPDATE master_lock SET expires_at` | ✅ `UPDATE instances SET last_seen` | 表名不同，字段语义相同 |
| 文件系统 | ✅ `fs.mkdirSync()` 原子创建 lock dir | ✅ `tokio::fs::OpenOptions::create_new()` | 都是原子操作 |
| Marker 文件 | ✅ `confluence/.eket_master_marker` | ❌ 不创建 | **缺失功能** |
| 声明等待 | ✅ 轮询 `master:declaration` | ❌ 直接返回 | **缺失功能** |
| 日志输出 | ✅ `console.log()` | ✅ `tracing::info/warn()` | 日志框架不同 |

#### 错误处理契约

| 错误场景 | TS 版行为 | Rust 版行为 | 等价性 |
|---------|---------|-----------|-------|
| Redis 不可用 | 降级到 SQLite，返回 `{ success: false, error }` | 捕获 Err，继续尝试 SQLite | ✅ 等价 |
| SQLite 不可用 | 降级到文件系统 | 降级到文件系统 | ✅ 等价 |
| 文件系统失败 | 返回 `{ success: false, error }` | 返回 `Err(EketError::Io)` | ✅ 等价 |
| 转换失败但前面 level 成功 | 该级成功则返回（不继续尝试） | 该级成功则返回 | ✅ 等价 |
| 多个 instance 竞争 | 第一个获取锁的是 MASTER，others 是 SLAVER | 同左 | ✅ 等价 |

#### 并发保证

- **TS 版**:
  - Redis SETNX：原子操作，单线程事件循环，无竞态
  - SQLite 事务：通过事务保证原子性
  - 文件系统：`mkdir` 原子操作（OS 层）

- **Rust 版**:
  - Redis `setnx()`：原子操作
  - SQLite：使用 `spawn_blocking()` 在线程池中执行，事务保证原子性
  - 文件系统：`create_new()` 原子操作

**并发结论**: ✅ 两者都保证原子性，无竞态条件

---

### 2. Message Queue (message-queue.ts → queue.rs)

#### 关键状态机

```
初始化状态:
┌──────────────────────────────────────┐
│ config.mode == 'auto'                │
├──────────────────────────────────────┤
│ → 尝试 Redis 连接                    │
│   ├─ 成功 → mode = 'redis'          │
│   └─ 失败 → mode = 'file'           │
│                                      │
│ 运行期间：                            │
│   ├─ 消息发布失败时 (redis mode)    │
│   │   → 自动降级到 file mode        │
│   │   → 后续消息通过文件队列发送    │
│   └─ 订阅：固定在初始 mode 下      │
└──────────────────────────────────────┘

消息队列处理流程:
  ├─ Redis 模式 (available):
  │   ├─ publish: redis.publish(channel, JSON)
  │   └─ subscribe: 专用连接 + 回调处理
  │
  └─ File 模式 (fallback):
      ├─ publish: 原子写 (.eket/data/queue/<channel>/<id>.json)
      ├─ subscribe: 定期轮询（pollInterval，默认 500ms）
      └─ 处理: 读文件 → 解析 → 删除 → 执行 handler
```

#### 副作用清单

| 操作 | TS 版 | Rust 版 | 差异 |
|-----|------|--------|------|
| Redis publish | `redis.publish(channel, JSON)` | `redis.lpush(eket:queue:{channel}, JSON)` | **方式不同**: TS 用 PUB/SUB，Rust 用 LIST |
| Redis subscribe | 原生 SUBSCRIBE + 块处理 | RPOP 轮询（200ms）| **方式不同**: TS 事件驱动，Rust 轮询 |
| 文件队列写入 | 原子写 + 去重（OptimizedFileQueueManager） | 原子写（tmp → rename） | 都使用原子操作 |
| 文件队列读取 | OptimizedFileQueueManager.processQueue() | 目录轮询（200ms）→ 排序 → 读取 | TS 优化更复杂 |
| 日志 | `console.log/error` | `tracing::debug/info/warn` | 框架不同 |

#### 错误处理契约

| 错误场景 | TS 版行为 | Rust 版行为 |
|---------|---------|-----------|
| Redis publish 失败 | 降级到文件队列 | 如果 Redis not available，原本就用 File |
| 消息解析失败 | 捕获 + 错误日志 + 继续 | 捕获 + warn 日志 + 继续 |
| 文件写入失败 | 返回 `{ success: false, error }` | 返回 `Err(EketError)` |
| 文件读取失败 | warn + 继续处理下一个 | warn + 继续处理 |

#### 并发保证

- **文件队列**:
  - TS: 原子写 + checksum 验证 + 去重
  - Rust: 原子写 + 目录遍历（无去重）
  - ⚠️ **潜在差异**: Rust 版可能重复处理同一条消息

---

### 3. Circuit Breaker (circuit-breaker.ts → 无对应 Rust 实现)

**⚠️ 严重缺失**: Rust 版完全没有断路器实现！

#### TS 版行为契约

```
状态机:
  closed → (失败阈值达到) → open
  open → (timeout) → half_open
  half_open → (成功阈值达到) → closed
  half_open → (失败) → open

关键参数 (constants.ts):
  ├─ CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5
  ├─ CIRCUIT_BREAKER_SUCCESS_THRESHOLD = 2  
  ├─ CIRCUIT_BREAKER_TIMEOUT = 30000 (ms)
  └─ CIRCUIT_BREAKER_MONITOR_TIMEOUT = 60000 (ms)

可重试错误列表 (RetryExecutor):
  ├─ REDIS_CONNECTION_FAILED
  ├─ REDIS_OPERATION_FAILED
  ├─ MESSAGE_QUEUE_ERROR
  ├─ PROTOCOL_NOT_CONNECTED
  └─ TIMEOUT_ERROR

重试策略 (指数退避):
  ├─ 初始延迟: RETRY_INITIAL_DELAY = 500ms
  ├─ 最大延迟: RETRY_MAX_DELAY = 5000ms
  ├─ 倍乘因子: RETRY_DELAY_MULTIPLIER = 1.5
  └─ 抖动: +30% 随机
```

---

### 4. Task Claim (claim.ts → task_claim.rs)

#### 关键流程和状态

```
claim 命令流程:

TS 版本:
  1. 检查项目状态 (findProjectRoot)
  2. 读取配置 (loadConfig)
  3. 获取任务列表 (getTickets)
  4. 选择任务 (auto/manual/by-id)
  5. 【★ SQLite 原子领取】claimTaskById (防竞争)
  6. 可选: 任务分配器 (TaskAssigner)
  7. 匹配角色 (matchRole)
  8. 加载规则 (selectRole, getRulesPath)
  9. 更新任务状态 (updateTicketStatus)
  10. 创建 worktree (SagaExecutor 保证幂等)
  11. 生成 ACTIVE_CONTEXT.md
  12. Ticket review (reviewTicket)
  13. 写入 SQLite checkpoint
  14. SSE 实时推送
  15. 输出 JSON 报告

Rust 版本:
  1. 读配置 (EketConfig::load)
  2. 扫描任务 (scan_todo_tickets)
  3. 选择任务
  4. 验证状态 (status == Todo)
  5. 更新状态 (Todo → InProgress)
  6. 写入 SQLite checkpoint
  7. 生成 ACTIVE_CONTEXT.md
  8. 输出 JSON 报告
  
对比: Rust 版遗漏了 TS 版的步骤 6-12 !

状态转换:
  Todo → InProgress (claim时)
  InProgress → Done (complete时) 或 Review → Done
```

#### 副作用清单

| 操作 | TS 版 | Rust 版 | 备注 |
|-----|------|--------|------|
| 读配置 | ✅ loadConfig() | ✅ EketConfig::load() | 都能降级到默认 |
| 扫描任务 | ✅ getTickets() | ✅ scan_todo_tickets() | 功能等价 |
| SQLite 原子领取 | ✅ claimTaskById() | ❌ 无对应逻辑 | **Rust 无竞争保护** |
| 任务分配 | ✅ TaskAssigner + InstanceRegistry | ❌ 缺失 | **Rust 完全缺失** |
| 匹配角色 | ✅ matchRole() | ❌ 缺失 | **Rust 完全缺失** |
| 加载规则 | ✅ selectRole + getRulesPath | ❌ 缺失 | **Rust 完全缺失** |
| Ticket review | ✅ reviewTicket() | ❌ 缺失 | **Rust 完全缺失** |
| Worktree 创建 | ✅ WorktreeManager + SagaExecutor | ❌ 缺失 | **Rust 完全缺失** |
| 更新任务状态 | ✅ 文件系统 | ✅ ticket.set_status() | 两者都更新 ticket 文件 |
| SQLite checkpoint | ✅ ExecutionCheckpoint | ✅ ExecutionCheckpoint | 结构相同 |
| ACTIVE_CONTEXT.md | ✅ buildActiveContextMd() | ✅ write_active_context() | 功能等价 |
| Slaver ID 持久化 | ✅ .eket/slaver-id | ✅ .eket/slaver-id | 都支持 |
| 日志输出 | ✅ console.log 或 ora spinner | ❌ 无交互输出 | Rust 只输出 JSON |

#### 错误处理契约

| 错误场景 | TS 版 | Rust 版 |
|---------|------|--------|
| 项目不存在 | printError + exit | 返回 Err |
| 配置缺失 | printError + exit | Err，但使用默认 |
| 无可用任务 | 显示提示 | 输出 `"status": "no_tickets"` JSON |
| 任务已被领取 | printError (TASK_ALREADY_CLAIMED) | Err (假设无 SQLite 原子保护) |
| SQLite 操作失败 | printError + exit（P2 修复后） | Err，但继续执行 |

---

### 5. Task Complete (complete.ts → task_complete.rs)

#### 关键流程

```
complete 命令流程:

TS 版本:
  1. 找到 ticket 文件
  2. 验证状态 (InProgress 或 Review)
  3. 更新状态 → Done
  4. 从 SQLite 删除 checkpoint
  5. 删除 ACTIVE_CONTEXT.md
  6. 生成 commit trailer（confidence/rejected-approaches/directive/scope-risk）
  7. 【可选】git commit --amend
  8. 【可选】追加 SkillFeedback（TASK-104b）
  9. 删除 worktree
  10. 输出 JSON 报告

Rust 版本:
  1. 找到 ticket 文件
  2. 验证状态 (InProgress, Review, 或已 Done)
  3. 更新状态 → Done
  4. 从 SQLite 删除 checkpoint
  5. 删除 ACTIVE_CONTEXT.md
  6. 可选: 追加 commit trailer
  7. 输出 JSON 报告

状态转换:
  InProgress → Done
  Review → Done (但 Rust 检查更严格)
```

#### 副作用清单

| 操作 | TS 版 | Rust 版 | 备注 |
|-----|------|--------|------|
| 找 ticket 文件 | ✅ | ✅ | 都支持 |
| 验证状态 | ✅ | ✅ | Rust 更严格 (reject Done) |
| 更新状态 | ✅ | ✅ | 都更新文件 |
| 删除 checkpoint | ✅ | ✅ | 都调用 delete_checkpoint() |
| 删除 ACTIVE_CONTEXT.md | ✅ | ✅ | 都删除 |
| Commit trailer | ✅ | ✅ (可选 skip) | 两者都支持（可配置） |
| SkillFeedback | ✅ 上报 | ❌ 缺失 | **Rust 完全缺失** |
| Worktree 清理 | ✅ removeWorktree() | ❌ 缺失 | **Rust 完全缺失** |
| Conflict 通知 | ✅ writeConflictNotice() | ✅ write_conflict_notice() | 两者都支持 |
| JSON 报告 | ✅ | ✅ | 格式相同 |

#### Commit Trailer 格式

```
TS 版本:
  Confidence: high | medium | low  (基于 levelChanges 数量)
  Rejected-approaches: <comma-separated> | none
  Directive: <ticketId> (截断至 80 字符)
  Scope-risk: low | medium | high  (基于变更文件数)

Rust 版本:
  Confidence: high  (固定为 high)
  Rejected-approaches: none  (固定为 none)
  Directive: <ticketId>
  Scope-risk: low | medium | high

差异:
  - TS 动态计算 Confidence（从 instance.levelChanges）
  - Rust 总是 high，无法获取 levelChanges
  ⚠️ 这导致 Rust 版本的 commit trailer 信息丢失！
```

---

## 行为差异报告

### 确认等价 ✅

| 模块 | 项目 | 说明 |
|-----|------|------|
| Master Election | 三级降级逻辑 | Redis → SQLite → File，选举原理相同 |
| Master Election | 续租机制 | 都定期续租，防止租约过期 |
| Message Queue | Auto 模式降级 | Redis 不可用时都降级到文件 |
| Message Queue | 原子写入 | 文件队列都用原子操作 |
| Task Claim | Slaver ID 持久化 | 都保存在 `.eket/slaver-id` |
| Task Claim | ACTIVE_CONTEXT.md | 生成逻辑相同 |
| Task Claim | SQLite checkpoint | 存储格式相同 |
| Task Complete | 状态转换 | InProgress/Review → Done 相同 |
| Task Complete | Commit trailer 格式 | JSON 格式一致（但 Confidence 值可能不同） |

---

### 存疑差异 ⚠️

| 模块 | 项目 | TS 版 | Rust 版 | 影响 | 优先级 |
|-----|------|------|--------|------|--------|
| Master Election | 声明等待期 | 2 秒轮询 + 竞争检测 | **直接返回** | 可能导致多个 instance 误认为自己是 MASTER | 🔴 高 |
| Master Election | Marker 文件 | 创建 `confluence/.eket_master_marker` | **不创建** | 外部系统可能无法检测 MASTER 身份 | 🟡 中 |
| Message Queue | Redis 模式 | PUB/SUB（事件驱动） | **LIST + RPOP（轮询）** | 延迟和资源消耗差异 | 🟡 中 |
| Message Queue | 去重逻辑 | OptimizedFileQueueManager | **无去重** | 文件队列可能重复处理 | 🟡 中 |
| Task Claim | SQLite 竞争保护 | `claimTaskById()` 原子操作 | **无对应逻辑** | 多个 Slaver 可能领取同一任务 | 🔴 高 |
| Task Claim | 任务分配 | TaskAssigner + InstanceRegistry | **缺失** | 无负载均衡 | 🟡 中 |
| Task Claim | 角色匹配 | matchRole() | **缺失** | 无法自动选择合适的 agent 类型 | 🟡 中 |
| Task Claim | Worktree 创建 | SagaExecutor 保证幂等 | **缺失** | 无隔离，无故障补偿 | 🟡 中 |
| Task Complete | SkillFeedback | 上报技能反馈 | **缺失** | 无法优化模型路由 | 🟡 中 |
| Task Complete | Confidence 计算 | 动态（基于 levelChanges） | **固定为 high** | Commit 历史信息不准确 | 🟢 低 |

---

### 确认不等价 ❌

| 模块 | 项目 | 说明 | 严重程度 |
|-----|------|------|--------|
| Circuit Breaker | 整个模块 | Rust 完全无实现，TS 有完整的断路器+重试 | 🔴 **严重** |
| Task Claim | 超过 7 个关键功能 | 任务分配、角色匹配、规则加载、worktree、review 等 | 🔴 **严重** |
| Task Complete | SkillFeedback + Worktree 清理 | TS 会上报反馈并清理 worktree | 🟡 **中等** |

---

## task:claim JSON 格式对比

### TS 版输出（lines 300+）

```typescript
{
  "status": "claimed" | "no_tickets" | "error",
  "ticket_id": string,
  "title": string,
  "priority": string,
  "slaver_id": string,
  "project_root": string,
  "instructions": string,
  
  // 可选字段（若启用高级功能）
  "assigned_instance"?: {
    "id": string,
    "agent_type": string,
    "type": string
  },
  "role": string,
  "recommended_level": 1 | 2 | 3,
  "worktree_path": string,
  "rules_path": string,
  "skills": string[],
  
  // 错误详情
  "code"?: string,
  "message"?: string,
  "solutions"?: string[]
}
```

### Rust 版输出（task_claim.rs#147-161）

```rust
{
  "status": "claimed" | "no_tickets" | "error",
  "ticket_id": string,
  "title": string,
  "priority": string,  // ✅ 字段相同
  "slaver_id": string,
  "project_root": string,
  "instructions": string
}
```

### 兼容性分析

| 字段 | TS 版 | Rust 版 | Slaver Prompt 依赖? |
|-----|------|--------|----------------|
| `status` | ✅ | ✅ | 是 |
| `ticket_id` | ✅ | ✅ | 是 |
| `title` | ✅ | ✅ | 否（但有用） |
| `priority` | ✅ | ✅ | 是 |
| `slaver_id` | ✅ | ✅ | 否（内部用） |
| `project_root` | ✅ | ✅ | 否 |
| `instructions` | ✅ | ✅ | 是 |
| `assigned_instance` | 可选 | ❌ | 可能 |
| `role` | 可选 | ❌ | 可能 |
| `recommended_level` | 可选 | ❌ | 否 |
| `worktree_path` | ✅ | ❌ | 否（但 Slaver 需要知道） |
| `rules_path` | ✅ | ❌ | 是 |
| `skills` | ✅ | ❌ | 否 |

**结论**: Rust 版的 JSON 是 TS 版的**子集**。关键字段都有，但缺少可选的增强字段，特别是 `rules_path` 和 `assigned_instance` 可能导致 Slaver Prompt 需要调整。

---

## 缺失的 TS 功能清单

### 按优先级排序

#### 🔴 P1 - 临界故障（必须修复）

1. **Master Election 声明等待期** (Lines 555-578)
   - **影响**: 无等待期 → 多个 instance 误为 MASTER
   - **建议修复**:
     ```rust
     async fn declaration_period(&self) {
       let start = std::time::Instant::now();
       while start.elapsed() < Duration::from_secs(2) {
         // Check for competing declarations
         tokio::time::sleep(Duration::from_millis(100)).await;
       }
     }
     ```
   - **工作量**: ⭐ 低（1-2 小时）

2. **Task Claim SQLite 竞争保护** (Lines 317-349)
   - **影响**: 多个 Slaver 可能领取同一任务
   - **缺失代码**: `claimTaskById()` 实现
   - **建议**:
     ```rust
     async fn claim_task_atomic(db: &SqliteClient, ticket_id: &str, slaver_id: &str) -> Result<bool> {
       // UPDATE task SET status='claimed', claimed_by=? WHERE id=? AND status='todo'
       // Atomic with row lock
     }
     ```
   - **工作量**: ⭐⭐ 中等（2-3 小时）

3. **Circuit Breaker 完全缺失** (circuit-breaker.ts)
   - **影响**: 无故障快速转移，无自动重试
   - **涉及类**: `CircuitBreaker`, `RetryExecutor`
   - **工作量**: ⭐⭐⭐ 高（8-12 小时）

#### 🟡 P2 - 重要功能（应该修复）

4. **Task Claim - 任务分配器** (Lines 146-173, 351-365)
   - **影响**: 无负载均衡，无 instance 自动选择
   - **缺失类**: `TaskAssigner`, `InstanceRegistry`
   - **工作量**: ⭐⭐⭐ 高（10+ 小时）

5. **Task Claim - 角色匹配** (Lines 398-401, 430-436)
   - **影响**: 无自动角色匹配，无专项规则加载
   - **缺失函数**: `matchRole()`, `selectRole()`
   - **工作量**: ⭐⭐ 中等（3-5 小时）

6. **Task Claim - Worktree 创建** (Lines 443-478)
   - **影响**: 无代码隔离，无 Saga 补偿
   - **缺失**: `WorktreeManager`, `SagaExecutor`
   - **工作量**: ⭐⭐⭐ 高（8+ 小时）

7. **Task Claim - Ticket Review** (Lines 480-499)
   - **影响**: 无票据完整性检查
   - **缺失函数**: `reviewTicket()`
   - **工作量**: ⭐⭐ 中等（3-4 小时）

8. **Task Complete - SkillFeedback** (Lines 192-215)
   - **影响**: 无技能反馈机制，模型路由无学习
   - **缺失函数**: `reportSkillFeedback()`
   - **工作量**: ⭐⭐ 中等（2-3 小时）

9. **Task Complete - Worktree 清理** (Lines 不在前 200 行)
   - **影响**: 孤立的 worktree 占用磁盘空间
   - **缺失**: Worktree 删除逻辑
   - **工作量**: ⭐ 低（1 小时）

10. **Master Election - Marker 文件** (Lines 582-611)
    - **影响**: 外部系统无法检测 Master 身份
    - **缺失**:
      ```rust
      // confluence/.eket_master_marker
      let marker = project_root.join("confluence/.eket_master_marker");
      tokio::fs::write(&marker, format!("instance_id: {}", self.instance_id)).await?;
      ```
    - **工作量**: ⭐ 低（30 分钟）

#### 🟢 P3 - 优化功能（可以延后）

11. **Message Queue - Warm Standby** (Lines 667-747)
    - **影响**: 无 Master 故障自动转移
    - **缺失类**: Heartbeat, StateSyncTimer, BackupMasters
    - **工作量**: ⭐⭐⭐⭐ 很高（16+ 小时）

12. **Message Queue - 去重逻辑** (Lines 163-252)
    - **影响**: 文件队列可能重复处理
    - **需改进**: 使用 checksum 验证
    - **工作量**: ⭐⭐ 中等（2-3 小时）

13. **Task Claim - Envelope/Skill Stacking** (Lines 366-395)
    - **影响**: 无自动技能栈加载
    - **缺失**: `EnvelopeManager`, `SkillStacker`
    - **工作量**: ⭐⭐ 中等（3-4 小时）

14. **Message Queue - Redis PUB/SUB** (vs LIST+RPOP)
    - **影响**: 性能差异，但功能等价
    - **工作量**: ⭐⭐ 中等（改为 PUB/SUB）

---

## 验证检查清单

### Phase 1: 关键路径（必须通过）

- [ ] Master election 三级降级成功
- [ ] 同一项目多个 instance 只有一个成为 MASTER
- [ ] Master 定期续租（验证不过期）
- [ ] 任务 claim 后状态变为 `in_progress`
- [ ] task:claim 输出的 JSON 包含必要字段（status, ticket_id, slaver_id）
- [ ] 任务 complete 后状态变为 `done`
- [ ] ACTIVE_CONTEXT.md 正确生成和删除
- [ ] SQLite checkpoint 正确保存和删除

### Phase 2: 警告字段（需要验证）

- [ ] **声明等待期**: 验证无并发 MASTER 产生
- [ ] **SQLite 竞争**: 模拟 2 个 Slaver 竞争同一任务
- [ ] **Message Queue**: Redis 和 File 模式都能发布和订阅
- [ ] **Worktree 路径**: 验证 Slaver 能找到 worktree 位置
- [ ] **Rules Path**: Slaver Prompt 能找到规则文件

### Phase 3: 降级测试（验证容错）

- [ ] Redis 不可用 → SQLite 接管
- [ ] SQLite 不可用 → 文件系统接管
- [ ] Message Queue: Redis 失败 → 文件队列降级
- [ ] 任务分配失败 → 本地选择

### Phase 4: 数据一致性（关键验证）

- [ ] Commit trailer 格式正确
- [ ] Slaver ID 持久化（重启后相同）
- [ ] SQLite checkpoint 完整（包含所有元数据）
- [ ] 文件队列消息不重复

---

## 总结与建议

### 当前状态
- **行为等价**: ~60%（基础选举、消息队列降级、任务状态转换）
- **功能缺失**: ~30%（任务分配、角色匹配、worktree、SkillFeedback）
- **新增缺陷**: ~10%（无声明等待、无竞争保护、无去重）

### 立即行动

**优先级 1（本周）**:
1. 实现 Master Election 声明等待期（高风险）
2. 实现 SQLite 原子竞争保护（高风险）
3. 补全 task:claim 必要字段（Slaver 依赖）

**优先级 2（下周）**:
4. 实现 Circuit Breaker（关键基础设施）
5. 实现任务分配器和角色匹配（负载均衡）
6. 实现 Worktree 创建和清理

**优先级 3（后续）**:
7. 实现 SkillFeedback 上报
8. 补完 Warm Standby
9. 优化 Message Queue（PUB/SUB）

### 测试策略

1. **单元测试**: 各模块的状态转换
2. **集成测试**: 完整的 claim → implement → complete 流程
3. **并发测试**: 多个 instance/slaver 的竞争场景
4. **故障注入**: 网络断裂、数据库不可用、磁盘满等
5. **长期运行**: 观察内存泄漏、资源泄漏

---

**报告完成**
