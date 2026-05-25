# 覆盖率驱动开发反模式

**严重度**: 中  
**发现于**: EPIC-014 测评改进  
**日期**: 2026-05-25

---

## 症状

- 测试数量快速增长但 bug 没减少
- 测试维护成本高
- 重构时大量测试需要修改

## 根因

将覆盖率数字作为目标，而非代码质量的副产品。

## 反模式示例

**目标**: 覆盖率从 49% 提升到 60%

**错误做法**:
```typescript
// 为达标而写的测试
describe('ErrorCodes', () => {
  it('should have CONNECTION_FAILED', () => {
    expect(ErrorCodes.CONNECTION_FAILED).toBe('CONNECTION_FAILED');
  });
  it('should have REDIS_NOT_CONFIGURED', () => {
    expect(ErrorCodes.REDIS_NOT_CONFIGURED).toBe('REDIS_NOT_CONFIGURED');
  });
  // ... 20 个类似测试
});
```

**问题**: 
- 测试常量等于自身，无实际价值
- 不测试行为，只测试存在性
- 增加维护负担

## 正确做法

**目标**: 关键路径有测试覆盖

```typescript
// 测试行为而非常量
describe('printKnownError', () => {
  it('should include causes and solutions for known error codes', () => {
    const consoleSpy = jest.spyOn(console, 'error');
    printKnownError(ErrorCodes.REDIS_NOT_CONFIGURED, 'Redis error');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Redis host not specified')
    );
  });
});
```

## 正确的覆盖率目标

| 模块类型 | 建议覆盖率 | 原因 |
|----------|-----------|------|
| 核心业务逻辑 | 80%+ | 高风险 |
| 工具函数 | 70%+ | 复用广泛 |
| UI/展示层 | 50%+ | 变化频繁 |
| 配置/常量 | 不需要 | 静态数据 |

## 检测信号

1. 测试文件 LOC > 源码文件 LOC 的 2 倍
2. 测试只验证 `expect(x).toBe(x)` 模式
3. 测试描述是 "should exist" 而非 "should behave"

## 修复方案

1. 删除低价值测试
2. 重新定义目标为"关键模块有测试"
3. 使用 mutation testing 验证测试有效性

---

## 索引标签

- **类型**: pitfall
- **领域**: testing, metrics
- **关键词**: 覆盖率, 测试质量, 度量陷阱
- **关联**: 
  - [epic-014-benchmark-lessons.md](../lessons/epic-014-benchmark-lessons.md)
  - [test-inline-copy-antipattern.md](test-inline-copy-antipattern.md)
