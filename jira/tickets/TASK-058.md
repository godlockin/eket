---
id: TASK-058
title: "fix(api): eket-server.ts 泛型化 RedisHelper 消灭 as any"
priority: P1
status: ready
assignee: backend_dev
dispatched_by: master
created_at: 2026-04-18
---

## 背景

`node/src/api/eket-server.ts` 中 `as any` 从原先 11 处增至 **32 处**，根因是 `RedisHelper.hgetall()` 返回 `unknown`，每次使用都需强转。

`node/src/api/redis-helper.ts` 中 `private client: any` 导致 ioredis 类型完全丢失。

## 验收标准

- [ ] `RedisHelper` 加泛型：`hgetall<T extends Record<string, string>>(): Promise<T | null>`
- [ ] `redis-helper.ts` 中 `private client` 类型从 `any` 改为正确的 ioredis 类型
- [ ] `eket-server.ts` 中 `as any` 数量降至 **0**（hgetall 相关）
- [ ] `api/routes/task.ts` GET `/:id` 不存在时返回 404 而非 500
- [ ] `npm run lint` 无新增 error
- [ ] `npm test` 全绿

## 相关文件

- `node/src/api/redis-helper.ts`
- `node/src/api/eket-server.ts`
- `node/src/api/routes/task.ts`
