# TASK-020: 升级 SlaverHeartbeat — 能力声明 + 容量感知

**Ticket ID**: TASK-020
**标题**: 升级 SlaverHeartbeat 类型，携带 capabilities / capacity / 精确状态
**类型**: improvement
**优先级**: P1

**状态**: ready
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14

**负责人**: 待领取
**Slaver**: 待领取

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | — | — | ready → gate_review |
| Gate Review APPROVE | gate_reviewer | — | gate_review → in_progress |
| Gate Review VETO | gate_reviewer | — | gate_review → analysis |
| 提交 Review | — | — | in_progress → pr_review |
| Review 通过 | — | — | pr_review → done |

---

## 1. 任务描述

参考 Harness Delegate 架构：心跳不只是"存活信号"，而是携带能力声明 + 容量信息的完整状态包。
Master 凭此做精确判断，而不是靠文件 mtime 推算。

**当前 `SlaverHeartbeat`（node/src/types/index.ts）**：
```typescript
export interface SlaverHeartbeat {
  slaverId: string;
  timestamp: number;
  status: 'active' | 'busy' | 'offline';
  currentTaskId?: string;
}
```

**目标**：
1. 扩展 `SlaverHeartbeat`，新增字段：
   - `capabilities: string[]` — 角色能力列表，如 `['frontend_dev', 'fullstack']`
   - `capacity: { maxConcurrent: number; current: number }` — 并发容量
   - `status` 扩展为 4 值：`'idle' | 'busy' | 'draining' | 'offline'`
     - `idle`：空闲，可接新任务
     - `busy`：已满载（`current >= maxConcurrent`），拒绝新任务
     - `draining`：正在完成存量任务，不接新任务（优雅关闭）
     - `offline`：已离线
   - `lastTaskCompletedAt?: number` — 最近一次任务完成时间戳（毫秒）

2. 同步更新 `redis-client.ts` 的 `registerSlaver()` 和 `getActiveSlavers()` 方法，使其与新类型匹配

3. 同步更新 `master-heartbeat.ts` 中 `StaleSlaverInfo` 等引用 `SlaverHeartbeat` 的地方，使其读取新字段

**不做**：
- 不修改 `heartbeat:start` 命令的 CLI 参数（保持兼容）
- 不修改 Redis key 结构（`slaver:{id}:heartbeat`）
- 不修改心跳发送间隔

---

## 2. 验收标准

- [ ] `node/src/types/index.ts` 中 `SlaverHeartbeat` 包含 `capabilities`、`capacity`、新 `status` 4值、`lastTaskCompletedAt`
- [ ] `status` 类型从 3 值改为 4 值，旧代码中所有引用编译通过（无 TS error）
- [ ] `redis-client.ts` 中 `registerSlaver`/`getActiveSlavers` 类型匹配
- [ ] `master-heartbeat.ts` 中的 `StaleSlaverInfo` / health 判断逻辑正确读取 `capacity.current`
- [ ] `npm run build` 零 TS 错误
- [ ] `npm test` 1105+ 全部通过
- [ ] 新增/更新测试：覆盖 `capabilities`、`capacity.current >= maxConcurrent` → status 为 `busy` 的场景

---

## 3. 技术方案

### 类型变更（types/index.ts）

```typescript
export interface SlaverCapacity {
  maxConcurrent: number;  // 最大并发任务数，默认 1
  current: number;        // 当前执行任务数
}

export interface SlaverHeartbeat {
  slaverId: string;
  timestamp: number;
  status: 'idle' | 'busy' | 'draining' | 'offline';  // 4值
  capabilities: string[];                              // 角色能力列表
  capacity: SlaverCapacity;                            // 容量信息
  currentTaskId?: string;
  lastTaskCompletedAt?: number;
}
```

### 向后兼容

`getActiveSlavers()` 解析老数据时，如果 `capabilities` / `capacity` 缺失，填默认值：
```typescript
capabilities: heartbeat.capabilities ?? [],
capacity: heartbeat.capacity ?? { maxConcurrent: 1, current: heartbeat.currentTaskId ? 1 : 0 }
```

### master-heartbeat.ts 更新

`isStaleSlave()` 现在可以更精确：
- `status === 'offline'` → 立即标记 stale
- `status === 'busy' && mtime > 30min` → stale（Harness 逻辑：心跳超时无论什么状态都算失联）
- `capacity.current > capacity.maxConcurrent` → 异常，标记为 YELLOW

---

## 4. 影响范围

- `node/src/types/index.ts` — 类型定义
- `node/src/core/redis-client.ts` — `registerSlaver` / `getActiveSlavers`
- `node/src/commands/master-heartbeat.ts` — health 判断逻辑
- `node/tests/commands/master-heartbeat.test.ts` — 补充新测试
- `node/tests/core/redis-client.test.ts`（如有）— 更新 mock 数据

---

## 5. blocked_by

无依赖，可立即开始。
