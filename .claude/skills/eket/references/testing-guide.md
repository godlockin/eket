# 测试质量指南

> EPIC-014 经验沉淀 (2026-05-25)

## 核心原则

**测试质量 > 测试数量**

覆盖率是质量的副产品，不是目标。

## 测试检查清单

### 必检项

- [ ] **导入源码**: 测试必须 `import` 源码函数，禁止内联复制
- [ ] **边界覆盖**: 空值、极值、异常路径
- [ ] **行为验证**: 测试"做什么"而非"是什么"

### 反模式检测

```bash
# 检测测试内联复制（应返回0）
grep -r "^[[:space:]]*function " tests/unit/ --include="*.test.ts" | \
  grep -v "describe\|it\|beforeEach\|afterEach" | wc -l
```

## 模块覆盖优先级

| 优先级 | 模块 | 原因 |
|--------|------|------|
| P0 | `core/` | 核心业务逻辑 |
| P0 | `utils/sql-security.ts` | 安全关键 |
| P1 | `utils/` 其他 | 广泛复用 |
| P2 | `commands/` | 入口层，变化频繁 |
| P3 | 配置/常量 | 静态数据，不需测试 |

## 正确 vs 错误示例

### ❌ 错误：内联复制

```typescript
describe('formatTime', () => {
  function formatTime(ms: number) {  // 复制源码
    return `${ms}ms`;
  }
  it('formats', () => {
    expect(formatTime(100)).toBe('100ms');
  });
});
```

### ✅ 正确：导入测试

```typescript
import { formatTime } from '../src/utils/time.js';

describe('formatTime', () => {
  it('formats milliseconds', () => {
    expect(formatTime(100)).toBe('100ms');
  });
  it('handles zero', () => {
    expect(formatTime(0)).toBe('0ms');
  });
});
```

### ❌ 错误：测试常量存在性

```typescript
it('should have ERROR code', () => {
  expect(ErrorCodes.ERROR).toBe('ERROR');  // 无价值
});
```

### ✅ 正确：测试行为

```typescript
it('should format error with code', () => {
  const output = formatError(ErrorCodes.ERROR, 'msg');
  expect(output).toContain('[ERROR]');
  expect(output).toContain('msg');
});
```

## 运行测试

```bash
# 全量测试
npm test

# 指定模块
npm test -- --testPathPattern=unit/core

# 强制退出（解决异步泄漏）
npm test -- --forceExit
```

## 相关文档

- `confluence/memory/lessons/epic-014-benchmark-lessons.md`
- `confluence/memory/pitfalls/test-inline-copy-antipattern.md`
- `confluence/memory/pitfalls/coverage-driven-development.md`
