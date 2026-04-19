---
id: TASK-058
title: "fix(api): eket-server.ts 泛型化 RedisHelper 消灭 as any"
priority: P1
status: done
assignee: backend_dev
dispatched_by: master
created_at: 2026-04-18
completed_at: 2026-04-18
---

## 背景

`node/src/api/eket-server.ts` 中 `as any` 从原先 11 处增至 **32 处**，根因是 `RedisHelper.hgetall()` 返回 `unknown`，每次使用都需强转。

`node/src/api/redis-helper.ts` 中 `private client: any` 导致 ioredis 类型完全丢失。

## 验收标准

- [x] `RedisHelper` 加泛型：`hgetall<T extends object>(): Promise<T | null>`
- [x] `redis-helper.ts` 中 `private client` 类型从 `any` 改为正确的 ioredis 类型（`IoRedis | null`）
- [x] `eket-server.ts` 中 `as any` 数量降至 **0**
- [x] `api/routes/task.ts` GET `/:id` 不存在时返回 404 而非 500
- [x] `npm run lint` 无新增 error
- [x] `npm test` 全绿（56 suites, 1153 tests）

## 相关文件

- `node/src/api/redis-helper.ts`
- `node/src/api/eket-server.ts`
- `node/src/api/routes/task.ts`

## 实现记录

### redis-helper.ts 改动

1. `private client: any` → `private client: IoRedis | null`（使用 `import type { Redis as IoRedis } from 'ioredis'`）
2. `hset` 参数从 `Record<string, string | number>` 改为 `Record<string, unknown>`
3. `hgetall` 加泛型：`hgetall<T extends object = Record<string, string>>(key: string): Promise<T | null>`
   - 内部处理 null/empty 返回 `null`，消除调用侧空对象判断

### eket-server.ts 改动

1. 添加 Express Request 全局类型扩展，声明 `instance_id?: string`
2. `(req as any).instance_id` → `req.instance_id`
3. 所有 `hgetall(...) as any` 替换为 `hgetall<AgentDetails>(...)` / `hgetall<Task>(...)` / `hgetall<Record<string,string>>(...)`
4. `agentData as any` / `pr as any` 传给 `hset` 改为正确类型（`as unknown as Record<string, unknown>`）
5. JSON 解析场景（acceptance_criteria / tags）用独立 `parsedTask` 变量承接，保持类型安全

### routes/task.ts 改动

GET `/:id`：当 `result.success === false` 时检查 error code / message，若为 NOT_FOUND 类型则返回 `res.status(404)` 而非 500。

### 关键技术决策

- `hgetall` 泛型约束用 `T extends object` 而非 `T extends Record<string, string>`，允许传入 `AgentDetails`/`Task` 等无 index signature 的接口
- `hset` 参数宽化为 `Record<string, unknown>`，内部 ioredis 会自动 toString，无运行时风险
- 不修改公开 API surface（除泛型参数），符合约束
