# TASK-018: JS SDK Examples 完善

**优先级**: P2
**Round**: 14
**目标版本**: v2.6.0
**分支**: `feature/TASK-018-js-sdk-examples`

---

## 背景

`sdk/javascript/examples/` 有 3 个示例文件，少于 Python SDK（5个），且缺少：
1. `auto-heartbeat.ts` — 心跳示例
2. `complete-workflow.ts` — 完整流程
3. `error-handling.ts` — 错误处理示范
4. 运行说明 README

---

## 现有 examples

```
register-agent.ts    ← 注册 Agent
claim-task.ts        ← 认领任务
submit-pr.ts         ← 提交 PR
```

---

## 任务清单

### 1. 验证并修复现有 examples
- [ ] `register-agent.ts` — 确认参数与 `EketClient` 签名一致，TypeScript 编译通过
- [ ] `claim-task.ts` — 确认类型正确
- [ ] `submit-pr.ts` — 确认 `SubmitPRParams` 字段正确

### 2. 新增示例
- [ ] `auto-heartbeat.ts` — 心跳维持（对应 Python 版）
- [ ] `complete-workflow.ts` — 注册 → 认领任务 → 心跳 → 提交 PR 完整流程
- [ ] `error-handling.ts` — ValidationError / NetworkError 捕获与处理

### 3. TypeScript 编译验证
```bash
cd sdk/javascript && npx tsc --noEmit examples/*.ts
# 或逐个: npx tsc --noEmit --esModuleInterop examples/register-agent.ts
```

### 4. 运行说明
- [ ] `sdk/javascript/examples/README.md` — 前置条件、`ts-node` 运行方式、预期输出

---

## 验收标准

- [ ] 6 个 examples（3 旧 + 3 新）
- [ ] `tsc --noEmit` 编译无 error
- [ ] examples/README.md 存在
- [ ] 现有 12/12 JS SDK tests 仍通过

---

## 参考

- SDK 源码: `sdk/javascript/src/`
- 类型定义: `sdk/javascript/src/types.ts`
- 客户端: `sdk/javascript/src/client.ts`
- 错误类: `sdk/javascript/src/errors.ts`
- tsconfig: `sdk/javascript/tsconfig.json`
