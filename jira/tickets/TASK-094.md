# TASK-094: 修复 HTTP-003 Input Validation 失败测试 + 异步泄漏

## 元数据
- **状态**: done
- **类型**: bugfix
- **优先级**: P0
- **负责人**: 待领取
- **创建时间**: 2026-04-19
- **依赖**: 无

## 背景

`tests/api/eket-server-security.test.ts` 中 2 个测试持续红灯：

1. `should reject invalid agent registration (missing required field)` — 期望返回含 "Invalid request body" 的错误消息，实际返回 "Missing required field: role"（消息格式不符）
2. `should reject invalid agent type enum` — 期望 400，实际 201（enum 校验逻辑未实现）

另有多个 `Cannot log after tests are done` 异步泄漏警告。

## 根因分析

- **测试 1**：handler 已实现字段校验，但错误消息格式（`"Missing required field: role"`）与测试期望（`StringContaining "Invalid request body"`）不匹配
- **测试 2**：agent type enum 校验逻辑未实现，任意 type 值都被接受（201）
- **异步泄漏**：测试结束后 server 未关闭，logger 继续输出

## 验收标准

1. `tests/api/eket-server-security.test.ts` 全部通过（0 失败）
2. 无 `Cannot log after tests are done` 警告
3. `cd node && npm test 2>&1 | tail -5` 显示 1199/1199 通过

## 实现方向

**修法 A（改代码适应测试）**：
- 将 handler 错误消息统一为 "Invalid request body: ..." 格式
- 在 agent registration handler 添加 agentType enum 白名单校验
- 在测试文件 `afterAll` 中关闭 server

**修法 B（改测试适应代码）**：
- 将 `StringContaining "Invalid request body"` 改为 `StringContaining "Missing required field"`
- 该方案仅修文字，不修 enum 校验缺失问题，不推荐

**推荐修法 A**：实现应符合规范，测试是规范的体现。

## 关键文件

```bash
node/tests/api/eket-server-security.test.ts   # 测试文件
node/src/api/eket-server.ts                    # 或对应 handler 文件（需确认）
```

## 执行命令

```bash
cd node
npm test -- --testPathPattern=eket-server-security 2>&1 | grep -E "PASS|FAIL|●"
npm test -- --detectOpenHandles --testPathPattern=eket-server-security 2>&1 | grep -E "open handles"
```
