# EKET 行为等价性 - 快速参考表

## 模块对应关系

```
TypeScript              │ Rust                      │ 等价性 │ 优先级
────────────────────────┼──────────────────────────┼────────┼─────────
master-election.ts      │ election.rs               │ ⚠️ 70% │ P1-P2
message-queue.ts        │ queue.rs                  │ ⚠️ 80% │ P2-P3
circuit-breaker.ts      │ ❌ 无对应                 │ 0%     │ P1
claim.ts                │ task_claim.rs             │ ⚠️ 40% │ P1-P2
complete.ts             │ task_complete.rs          │ ⚠️ 70% │ P2
```

---

## 核心差异速查

### 1. Master Election

| 功能项 | TS | Rust | 备注 |
|-------|-----|-----|------|
| Redis SETNX | ✅ | ✅ | 同 |
| SQLite INSERT | ✅ REPLACE | ✅ IGNORE | **不同** |
| 文件系统 mkdir | ✅ | ✅ | 同 |
| 声明等待期 | ✅ 2s 轮询 | ❌ | **缺失** 🔴 |
| Marker 文件 | ✅ `confluence/` | ❌ | **缺失** 🟡 |
| Warm Standby | ✅ | ❌ | **缺失** 🟢 |
| 续租 | ✅ | ✅ | 同 |

### 2. Message Queue

| 功能项 | TS | Rust | 备注 |
|-------|-----|-----|------|
| Redis PUB/SUB | ✅ | ❌ (用 LIST) | **不同** 🟡 |
| 文件队列写 | ✅ 原子 | ✅ 原子 | 同 |
| 文件队列读 | ✅ 优化 | ✅ 轮询 | **差异** |
| 去重 | ✅ checksum | ❌ | **缺失** 🟡 |
| 降级 | ✅ auto | ✅ auto | 同 |

### 3. Task Claim

| 功能项 | TS | Rust | 备注 |
|-------|-----|-----|------|
| SQLite 原子领取 | ✅ | ❌ | **缺失** 🔴 |
| 竞争保护 | ✅ | ❌ | **缺失** 🔴 |
| 任务分配 | ✅ | ❌ | **缺失** 🟡 |
| 角色匹配 | ✅ | ❌ | **缺失** 🟡 |
| Worktree | ✅ | ❌ | **缺失** 🟡 |
| Ticket Review | ✅ | ❌ | **缺失** 🟡 |
| ACTIVE_CONTEXT | ✅ | ✅ | 同 |
| Checkpoint 存储 | ✅ | ✅ | 同 |
| JSON 输出 | ⭐⭐⭐ 丰富 | ⭐ 基础 | **不同** |

### 4. Task Complete

| 功能项 | TS | Rust | 备注 |
|-------|-----|-----|------|
| 状态转换 | ✅ | ✅ | 同 |
| Checkpoint 删除 | ✅ | ✅ | 同 |
| Commit Trailer | ✅ 动态 | ✅ 静态 | **信息丢失** |
| SkillFeedback | ✅ | ❌ | **缺失** 🟡 |
| Worktree 清理 | ✅ | ❌ | **缺失** 🟡 |

### 5. Circuit Breaker

| 功能项 | TS | Rust | 备注 |
|-------|-----|-----|------|
| 整个模块 | ✅ 完整 | ❌ 无 | **完全缺失** 🔴 |

---

## JSON 输出字段对比

### task:claim

```
必需字段（两者都有）:
  ✅ status
  ✅ ticket_id
  ✅ slaver_id
  ✅ instructions

TS 特有（Slaver 可能依赖）:
  ⚠️ assigned_instance
  ⚠️ role
  ⚠️ recommended_level
  ⚠️ worktree_path
  ⚠️ rules_path
  ⚠️ skills

Rust 有但 TS 一样有:
  ✅ title
  ✅ priority
  ✅ project_root
```

### task:complete

```
必需字段（两者都有）:
  ✅ status
  ✅ ticket_id
  ✅ slaver_id

TS 特有:
  ⚠️ SkillFeedback 信息

Commit Trailer 差异:
  TS:   Confidence: high/medium/low  (动态)
  Rust: Confidence: high            (固定)
```

---

## 错误处理对比

| 场景 | TS 处理 | Rust 处理 | 风险 |
|------|-------|---------|------|
| 多 instance 竞争 | 声明等待检测 | **直接返回** | 🔴 可能多 MASTER |
| 多 slaver 竞争 claim | SQLite 原子操作 | **无保护** | 🔴 可能重复 claim |
| Redis 发布失败 | 降级文件队列 | 已在初始化选择 | ⚠️ 延迟差异 |
| 消息队列 IO 失败 | 降级+重试 | 降级（无重试） | 🟡 可靠性差 |
| 选举失败 | printError + exit | Err + 继续 | 🟡 行为不同 |

---

## 并发安全等级

| 模块 | TS 等级 | Rust 等级 | 备注 |
|-----|--------|----------|------|
| Master Election | ✅ 原子 | ✅ 原子 (但无声明等待) | ⚠️ |
| Task Claim | ✅ 原子 | ❌ 非原子 | 🔴 |
| Message Queue | ✅ 原子 | ✅ 原子 | ✅ |
| Slaver ID | ✅ 安全 | ✅ 安全 | ✅ |

---

## 修复清单（按执行顺序）

### Week 1 - 关键缺陷 (P1)

```
1. [ ] election.rs - 添加声明等待期（Lines 82-120）
   预计：1-2h
   风险：高（影响 MASTER 唯一性）

2. [ ] task_claim.rs - 添加 SQLite 原子竞争保护（Lines 87-111）
   预计：2-3h
   风险：高（影响任务领取唯一性）

3. [ ] task_claim.rs - 补全 JSON 输出字段
   预计：1h
   风险：中（影响 Slaver 使用）
   必需字段: rules_path, worktree_path, assigned_instance
```

### Week 2 - 重要功能 (P2)

```
4. [ ] 实现 circuit-breaker 模块（新文件）
   预计：8-12h
   风险：高（关键基础设施）

5. [ ] task_claim.rs - 实现任务分配器集成
   预计：6-8h
   风险：中

6. [ ] task_claim.rs - 实现角色匹配和规则加载
   预计：3-4h
   风险：中
```

### Week 3 - 补完功能 (P2/P3)

```
7. [ ] task_claim.rs - 实现 Worktree 创建
   预计：4-6h
   风险：中

8. [ ] task_complete.rs - 实现 Worktree 清理
   预计：1-2h

9. [ ] task_complete.rs - 实现 SkillFeedback 上报
   预计：2-3h
   风险：低
```

### Later - 优化功能 (P3)

```
10. [ ] election.rs - 添加 Master marker 文件
11. [ ] election.rs - Warm Standby 实现
12. [ ] queue.rs - 改为 Redis PUB/SUB
13. [ ] queue.rs - 添加文件队列去重
```

---

## 测试用例

### 必验证（P1）

```
1. 单 instance 选举：instance_A.elect() → is_master=true
2. 双 instance 竞争：
   - instance_A.elect() → is_master=true
   - instance_B.elect() → is_master=false
3. 二次 claim：
   - slaver_A claim ticket_1 → ok
   - slaver_B claim ticket_1 → err (already claimed)
4. task:claim JSON：
   - 必需字段都在
   - status ∈ {claimed, no_tickets, error}
```

### 需验证（P2）

```
5. Redis 故障转移：
   - Redis down → SQLite 接管
   - SQLite down → 文件系统接管
6. Message Queue 降级：
   - Redis not available → 文件队列
7. Commit Trailer 生成：
   - 格式正确（4 行）
   - 幂等（重复 complete 不重复添加）
```

### 深入验证（P3）

```
8. 并发 Master 检测：
   - 5 个 instance 同时 elect()
   - 验证只有 1 个 MASTER（无多头现象）
9. 内存泄漏：
   - 运行 1000 次 claim/complete 循环
   - 检查内存增长
10. 长期稳定性：
    - 模拟网络波动
    - 验证续租不中断
```

---

## 已知风险 🚨

| 风险 | 影响范围 | 缓解方案 | 检测方法 |
|------|--------|--------|--------|
| 无声明等待 | Master 唯一性 | 实现声明等待期 | 多 instance 竞争测试 |
| 无竞争保护 | Task 领取唯一性 | SQLite 原子操作 | 多 slaver 竞争测试 |
| 固定 Confidence | Commit 信息质量 | 从 registry 获取 levelChanges | Code review |
| 无 Worktree 隔离 | 代码污染 | 实现 WorktreeManager | 集成测试 |
| 无 SkillFeedback | 模型路由学习 | 实现反馈上报 | 长期运行 |

---

## Slaver Prompt 兼容性

**当前 Rust 输出可能让 Slaver 无法：**

1. ❌ 找到规则文件（缺 `rules_path`）
2. ❌ 切换 Worktree（缺 `worktree_path`）
3. ⚠️ 选择合适的 Agent（缺 `assigned_instance`）
4. ⚠️ 理解推荐等级（缺 `recommended_level`）

**建议**：
- 短期：在 Slaver Prompt 中添加降级逻辑（计算 rules_path）
- 长期：Rust 补齐所有字段

---

**最后更新**: 2026/04/20
**状态**: 🟡 需要修复（60% 等价）
