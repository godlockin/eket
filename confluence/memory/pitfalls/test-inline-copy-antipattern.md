---
name: test-inline-copy-antipattern
type: pitfall
created: 2026-05-25
source: EPIC-014
tags: [testing, anti-pattern, false-positive]
confidence: high
---

# 测试内联复制反模式

## 症状

测试通过，但源码修改后测试仍然通过。

## 根因

测试内部重新实现了被测函数的逻辑，而非导入源码。

## 示例

```typescript
// ❌ 反模式：内联复制
describe('getLevelIcon', () => {
  // 测试内部重新定义函数
  function getLevelIcon(level: string): string {
    const icons: Record<string, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
    };
    return icons[level] || '•';
  }

  it('should return icon', () => {
    expect(getLevelIcon('info')).toBe('ℹ️');
  });
});
```

**问题**: 如果源码 `alerts.ts` 中的 `getLevelIcon` 改为返回 `[INFO]`，测试仍会通过。

## 正确做法

```typescript
// ✅ 正确：导入源码
import { getLevelIcon } from '../src/commands/alerts.js';

describe('getLevelIcon', () => {
  it('should return icon', () => {
    expect(getLevelIcon('info')).toBe('ℹ️');
  });
});
```

## 检测方法

1. 删除源码函数，测试是否报错？
2. 修改源码返回值，测试是否失败？
3. 测试文件是否有 `function` 定义而非 `import`？

```bash
# 检测测试文件中的函数定义
grep -r "function " tests/unit/ --include="*.test.ts" | grep -v "describe\|it\|beforeEach"
```

## 修复成本

| 阶段 | 成本 |
|------|------|
| 发现时修复 | 低（重写测试） |
| 生产事故后修复 | 高（回归 + 调查 + 修复） |

## 预防措施

1. **代码审查检查项**: 测试是否导入源码？
2. **CI 检查**: 禁止测试文件中定义业务函数
3. **mutation testing**: 变异测试能发现此类问题

---

## 索引标签

- **类型**: pitfall
- **领域**: testing
- **关键词**: 测试质量, 内联复制, 假阳性
- **关联**: [epic-014-benchmark-lessons.md](../lessons/epic-014-benchmark-lessons.md)
