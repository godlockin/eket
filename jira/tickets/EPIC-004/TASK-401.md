# TASK-401: 修复 eket-server-security 失败测试

## 元数据
- **状态**: todo
- **类型**: bugfix
- **优先级**: P1
- **agent_type**: code
- **estimate_hours**: 1
- **parent_epic**: EPIC-004
- **创建时间**: 2026-05-01

## 背景

`npm test` 显示 2 个测试失败（1277 passed, 2 failed）：
- `tests/api/eket-server-security.test.ts`
- 失败 case: HTTP-003 Input Validation
  - `should reject invalid agent registration (missing required field)` — 期望 HTTP 400 但收到其他状态码
  - `should reject invalid agent type enum` — 同上

## 详细描述

1. 阅读 `tests/api/eket-server-security.test.ts` 中失败的 2 个 test case
2. 阅读 `node/src/api/eket-server.ts` 中对应的 endpoint 实现
3. 定位为什么 input validation 没有返回预期的 400 + VALIDATION_ERROR
4. 修复代码（可能是 server 端缺少校验，也可能是测试期望不对）
5. `npm test` 全绿

## 验收标准

- [ ] AC-1: `npm test` 全部通过（0 failed）
- [ ] AC-2: 不引入新的 lint 警告
- [ ] AC-3: 修复提交到 feature/task-401-fix-security-tests 分支并提 PR

## test_strategy
- 直接运行 `npm test -- --testPathPattern=eket-server-security` 验证

---
agent_type: code
estimate_hours: 1
