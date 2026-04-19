# Jest 异步测试泄漏

**症状**：  
Jest 测试套件报告 "open handles" 或 "Jest did not exit one second after the test run has completed"，  
或测试间出现状态污染（前一个测试的副作用影响后一个）。

**根因**：  
1. 测试中启动了 HTTP Server / interval / setTimeout 但未在 `afterEach/afterAll` 中清理  
2. 使用了全局 Map/Store（如 `jobs = new Map()`）但未在 teardown 重置  
3. ESM 模块缓存导致单例在测试间共享状态  

**解法**：  
```typescript
// 每个测试文件的标准 teardown 模板
afterEach(() => {
  jest.clearAllMocks();
  jobs.clear(); // 清理全局 Map
});

afterAll(async () => {
  await server.close(); // 关闭 HTTP server
  jest.useRealTimers();
});
```

对于 ESM 模块隔离问题，在 `jest.config.ts` 中启用：  
```typescript
testEnvironment: 'node',
restoreMocks: true,
clearMocks: true,
```

**来源**：TASK-094（Node.js 测试修复）
