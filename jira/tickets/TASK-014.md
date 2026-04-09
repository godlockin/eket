# TASK-014: 健康检查端点

**创建时间**: 2026-04-09
**创建者**: Master Agent
**版本**: v2.5.0
**优先级**: P1
**状态**: open
**分支**: feature/TASK-014-health-endpoints

## 背景

生产环境需要 `/health`、`/ready`、`/live` 端点用于 K8s 探针、负载均衡器、监控系统。
当前 `web-server.ts` 没有这些端点，`eket-server.ts` 也没有。

## 验收标准

- [ ] `GET /health` 返回 200 + JSON，包含版本号、uptime、timestamp
- [ ] `GET /ready` 返回 200（就绪）或 503（未就绪），检查核心依赖状态
- [ ] `GET /live` 返回 200（存活探针，始终 200 除非进程死掉）
- [ ] 端点在 `web-server.ts` 和 `eket-server.ts` 中都实现
- [ ] 有对应的单元测试（在 `tests/api/` 下）

## 响应格式

```json
// GET /health
{
  "status": "healthy",
  "version": "2.5.0",
  "uptime": 12345,
  "timestamp": "2026-04-09T00:00:00.000Z",
  "checks": {
    "redis": "ok" | "degraded" | "unavailable",
    "sqlite": "ok" | "unavailable",
    "fileQueue": "ok"
  }
}

// GET /ready
{ "ready": true }  // 200

// GET /live
{ "alive": true }  // 200
```

## 技术说明

- 不要引入新依赖
- Redis/SQLite 不可用时降级为 "degraded"，不影响 /health 返回 200
- `/ready` 只有在文件队列可写时才返回 200，其他依赖降级不影响

## 交付物

- `web-server.ts` 新增三个端点
- `eket-server.ts` 新增三个端点（如果适用）
- `tests/api/health.test.ts` 单元测试
- PR 到 miao 分支
