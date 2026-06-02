# TASK-636: Node.js DAG resume dagPath 持久化修复

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P1  
**预估**: 0.5d  
**依赖**: TASK-633  
**层级**: L2 Node.js  
**来源**: Adversarial Review

---

## 问题描述

`node/src/core/dag-executor.ts:239` 行，`runState.dagPath` 初始化为空字符串，resume 时 `loadState` 无法恢复原 DAG 路径。

**影响**: resume 功能无法正确加载原 DAG 定义。

## 验收标准

- [x] `execute()` 方法接收 `dagPath` 参数并持久化到 `runState`
- [x] `resume()` 方法从 `runState.dagPath` 恢复 DAG
- [x] 单元测试覆盖 resume 场景
- [x] 与 Rust/Shell 层 resume 行为保持一致

## 修复方案

```typescript
// Before
const runState: DAGRunState = {
  dagPath: '', // ❌ 空字符串
  ...
};

// After
async execute(dag: DagSchema, options?: ExecuteOptions): Promise<DAGRun> {
  const runState: DAGRunState = {
    dagPath: options?.dagPath ?? '', // ✅ 从 options 传入
    ...
  };
}
```

---

## 实现摘要

1. **ExecuteOptions 接口扩展**: 添加 `dagPath?: string` 可选参数
2. **execute() 方法修改**: 从 `options.dagPath` 读取并存入 `runState.dagPath`
3. **测试新增**: 
   - `should persist dagPath and resume from it (TASK-636)` - 验证 dagPath 持久化
   - `should resume failed run using persisted dagPath (TASK-636)` - 验证 resume 从持久化 dagPath 加载 DAG

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (Review 发现) | Master |
| 2026-06-01 | 完成修复，测试通过 | Slaver |
