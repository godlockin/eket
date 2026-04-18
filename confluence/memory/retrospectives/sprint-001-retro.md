# Sprint 001 回顾

**Sprint**: sprint-001
**时间**: 2026-03-20 ~ 2026-04-18
**更新时间**: 2026-04-18（补全 placeholder，沉淀实际经验）

---

## 做得好的 (Keep)

- Docker 容器集成完成，基础设施稳定
- 心跳监控机制实现，Agent 存活检测可靠
- 测试覆盖率持续提升（TASK-049~053 均有测试）
- post-merge-broadcast 机制首次成功运行（TASK-050）
- block-self-loop "PR body 必须含 AI-Review 证据" 实战通过 ✓

## 需要改进的 (Problem)

### P1. dynamic import() 检测误区
- **现象**: 使用 `import('module')` 检测模块存在性，代码认为会 throw，实际返回 Promise，导致检测逻辑静默失败
- **根因**: ES dynamic import() 永远返回 Promise，不会同步抛出异常；同步检测必须用 `createRequire`
- **Action**: fullstack_dev 在 node/src 中统一替换为 `createRequire` 方式检测模块 — Deadline: 2026-05-01

### P2. Redis keyPrefix 双重叠加
- **现象**: 实际 Redis key 变成 `eket:eket:master:lock`，而非预期的 `eket:master:lock`
- **根因**: ioredis 配置了 `keyPrefix: 'eket:'`，而常量中 key 名称已包含 `eket:` 前缀 → 双重叠加
- **Action**: backend_dev 审查所有 Redis key 常量，去除已包含 keyPrefix 的冗余前缀 — Deadline: 2026-05-01

### P3. broadcast PR 永不合并（GITHUB_TOKEN 限制）
- **现象**: post-merge-broadcast 创建的 PR 无法通过 required status checks，CI pipeline 死锁
- **根因**: GITHUB_TOKEN 无法 approve 自己触发的 workflow required checks（GitHub 安全限制）
- **Action**: devops_dev 将 broadcast 目标改为非 protected branch，或为 broadcast PR 单独配置 bypass rule — Deadline: 2026-05-01

### P4. Python SDK 静默鉴权失败
- **现象**: API 调用返回 401，日志显示 `Authorization: Bearer None`
- **根因**: `response.get("token")` 返回 None 时，f-string 产生字面量 `"Bearer None"` 而非报错
- **Action**: backend_dev 对所有 token 获取点添加 None 校验，使用 `assert token is not None` 或 Pydantic 验证 — Deadline: 2026-05-01

### P5. benchmark CI path-filter 导致 docs PR 死锁
- **现象**: docs/infra-only PR 无法合并，因 `benchmark` job 因 path-filter 不触发，但被列为 required check
- **根因**: `perf-baseline.yml` 没有 path-stub job，docs PR 无法满足 required check
- **Action**: devops_dev 给 perf-baseline.yml 添加 path-stub job（P1 backlog） — Deadline: 2026-05-15

## 行动计划 (Try)

- 添加自动化语法检查（已部分实现）
- 建立文档更新流程（本 retro 是落地第一步）
- 所有外部依赖检测统一使用 `createRequire` 方案
- Redis key 命名规范：key 常量不含 keyPrefix 值
- CI broadcast target 改用非 protected branch

---

## 参与人员

- fullstack_dev（框架集成、Node.js 核心）
- backend_dev（Redis/Python SDK/API 层）
- devops_dev（CI/CD pipeline、GitHub Actions）
- frontend_dev（Dashboard UI、前端集成）

## 投票结果

| 项目 | 票数 |
|------|------|
| 自动化语法检查 | 3 |
| Redis key 命名规范 | 3 |
| dynamic import 检测统一方案 | 4 |
| broadcast PR 修复 | 2 |
