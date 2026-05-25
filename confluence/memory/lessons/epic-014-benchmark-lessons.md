# EPIC-014 测评改进经验总结

**日期**: 2026-05-25  
**EPIC**: EPIC-014 测评问题改进  
**状态**: 完成

---

## 核心经验

### 1. 测试质量 > 测试数量

**教训**: 为达成覆盖率目标而写的测试往往是低质量的。

**反模式 — 内联复制测试**:
```typescript
// ❌ 错误：测试内部重新实现逻辑
describe('formatTimeAgo', () => {
  function formatTimeAgo(timestamp: number): string {
    // 复制源码逻辑...
  }
  it('should format', () => {
    expect(formatTimeAgo(Date.now())).toBe('刚刚');
  });
});
```

**问题**: 源码修改后测试仍通过，无法发现回归。

**正确做法**:
```typescript
// ✅ 正确：导入源码测试
import { formatTimeAgo } from '../src/utils/time.js';

describe('formatTimeAgo', () => {
  it('should format', () => {
    expect(formatTimeAgo(Date.now())).toBe('刚刚');
  });
});
```

**量化**: 删除 82 个低质量测试后，测试套件从 142 降到 137，但实际质量提升。

---

### 2. 类型安全的投资回报

**教训**: 消除 `any` 类型的收益是即时的。

**数据**:
- 清理前: 46 处 `any`
- 清理后: 0 处 `any`
- 发现的隐藏问题: 3 个潜在运行时错误

**高价值模式**:
```typescript
// ❌ any 隐藏错误
} catch (error: any) {
  console.log(error.message); // 如果 error 不是 Error 会崩溃
}

// ✅ unknown + 类型守卫
} catch (error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  console.log(msg);
}
```

---

### 3. 模拟测试 vs 真实测试

**教训**: SWE-bench 模拟通过率 ≠ 真实能力。

**模拟的价值**:
- 快速验证框架结构
- CI/CD 回归检测
- 成本低

**模拟的局限**:
- 无法验证真实 API 调用
- 无法发现 token 限制问题
- 无法验证 patch 格式兼容性

**建议**: 模拟测试 + 小规模真实测试 (5-10 实例) 组合使用。

---

### 4. 覆盖率是副产品，不是目标

**教训**: 60% 覆盖率目标导致写无价值测试。

**调整前目标**:
- 单元测试文件 35+
- 测试覆盖率 60%

**调整后目标**:
- 关键模块 (core/, utils/) 有测试
- 测试必须导入源码
- 边界情况和错误路径有覆盖

**结果**: 55.3% 覆盖率，但测试质量显著提升。

---

## 可复用检查清单

### 测试质量检查

- [ ] 测试是否导入源码函数？（非内联复制）
- [ ] 测试是否覆盖边界情况？
- [ ] 测试是否验证错误路径？
- [ ] 删除源码后测试是否会失败？

### 类型安全检查

- [ ] `grep -r ": any" src/` 输出 0？
- [ ] 无 `@ts-ignore`？
- [ ] catch 块使用 `unknown` + 类型守卫？

### 测评报告检查

- [ ] 数据来源是否真实测试？
- [ ] 模拟数据是否标注 `mode: simulation`？
- [ ] 是否有对比基准？

---

## 索引标签

- **类型**: lesson
- **领域**: testing, type-safety, benchmarking
- **适用场景**: 测评改进, 测试重构, 代码质量
- **关联**: 
  - [async-test-leak.md](../pitfalls/async-test-leak.md)
  - [compare-test-before-replace.md](compare-test-before-replace.md)

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-05-25 | 创建 | Master |
