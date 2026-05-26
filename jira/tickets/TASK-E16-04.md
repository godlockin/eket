# TASK-E16-04: Hook Dispatcher 聚合

**EPIC**: EPIC-016  
**状态**: ready  
**优先级**: P1  
**预估**: 1d  
**负责人**: 待分配  
**依赖**: TASK-E16-02

---

## 背景

借鉴 ECC 的 Dispatcher 模式，将多个 pre/post hooks 聚合到单一入口，减少进程启动开销。

## 目标

实现 hook dispatcher，单进程执行多个检查。

## 范围

### 1. 当前问题

```json
// 当前：每个 hook 独立进程
{
  "matcher": "Bash",
  "hooks": [
    { "command": "node check-1.js" },
    { "command": "node check-2.js" },
    { "command": "node check-3.js" }
  ]
}
// 问题：3 次 Node.js 进程启动，~300ms 开销
```

### 2. 目标架构

```json
// 优化：单一 dispatcher
{
  "matcher": "Bash",
  "hooks": [
    { "command": "node dist/hooks/pre-bash-dispatcher.js" }
  ]
}
```

```typescript
// node/src/hooks/pre-bash-dispatcher.ts
const checks = [
  qualityCheck,
  secretScan,
  gitPushCheck,
  factForcingCheck,
];

async function dispatch(toolCall: ToolCall) {
  for (const check of checks) {
    if (!shouldRunHook(check.id)) continue;
    const result = await check.run(toolCall);
    if (!result.pass) return result;
  }
  return { pass: true };
}
```

### 3. Check 注册

```typescript
// 每个 check 作为模块注册
interface Check {
  id: string;
  profiles: Profile[];
  matcher: RegExp;
  run: (toolCall: ToolCall) => Promise<CheckResult>;
}

// 自动发现 checks
const checks = await discoverChecks('node/src/hooks/checks/');
```

## 验收标准

- [ ] `pre-bash-dispatcher.js` 聚合执行多个 checks
- [ ] 支持 profile 过滤
- [ ] 任一 check 失败立即返回
- [ ] 执行时间 < 100ms（单进程优势）
- [ ] 日志输出各 check 执行结果

## 技术要点

- 参考 ECC `scripts/hooks/pre-bash-dispatcher.js`
- Check 按优先级排序（安全 > 质量 > 风格）
- 支持 async/await 并行执行无依赖 checks

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-27 | 创建 Ticket | Master |
