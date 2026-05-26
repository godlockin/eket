---
name: async-test-leak
type: pitfall
created: 2026-05-01
source: TASK-094
tags: [jest, testing, async, nodejs]
confidence: high
---

# Jest 异步测试泄漏

> Jest 测试未清理异步资源导致 "open handles" 警告或状态污染

## 症状

- Jest 报告 "open handles" 或 "Jest did not exit one second after the test run has completed"
- 测试间出现状态污染（前一个测试的副作用影响后一个）
- 测试套件偶发性失败

## 根因

1. 测试中启动了 HTTP Server / interval / setTimeout 但未在 `afterEach/afterAll` 中清理
2. 使用了全局 Map/Store（如 `jobs = new Map()`）但未在 teardown 重置
3. ESM 模块缓存导致单例在测试间共享状态

## 方案

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

## 检测方法

```bash
# 运行 Jest 检测未关闭的句柄
npx jest --detectOpenHandles --forceExit
```

## 反模式

```typescript
// 反模式：不清理全局状态
const globalCache = new Map();

describe('test', () => {
  it('adds to cache', () => {
    globalCache.set('key', 'value');
  });
  // 下一个测试会看到污染的 cache
});
```

## 相关

- [sqlite-inmemory-testclient-thread.md](sqlite-inmemory-testclient-thread.md) - 类似的测试隔离问题
- [test-inline-copy-antipattern.md](test-inline-copy-antipattern.md) - 另一个测试质量问题
