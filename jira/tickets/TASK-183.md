# TASK-183: 修复Node→Rust proxy静态绑定——Rust崩溃后502无法fallback

**状态**: ready

**优先级**: P0
**类型**: Bug
**模块**: node/src/api/eket-server.ts:225
**来源**: 红队质疑 JeffDean

## 问题描述

路由在启动时静态绑定：Rust存活→绑定proxy，Rust不存活→绑定Node handler。Rust启动后崩溃，所有代理路由永久502，Node fallback handler永远不执行。

## 验收标准

- [ ] 为Rust proxy实现 circuit breaker（失败5次/10s → open → fallback to Node handler）
- [ ] 每个代理请求失败时捕获ECONNREFUSED/503，计入断路器
- [ ] 断路器open时透明fallback到本地Node handler（不改路由，中间件层判断）
- [ ] 半开状态：每30s探活一次，恢复后自动close
- [ ] 添加 `/api/v1/rust-status` 端点暴露断路器状态
- [ ] 单元测试：模拟Rust down → 请求路由到Node handler
