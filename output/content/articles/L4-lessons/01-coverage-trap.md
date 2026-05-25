# 覆盖率陷阱：测试数字游戏的教训

> 平台：微信公众号 / 知乎
> 定位：L4 经验教训
> 阅读时间：5分钟

---

## 🎯 目标

> "把测试覆盖率从 49% 提升到 60%"

听起来很合理，对吧？

**结果：写了一堆垃圾测试。**

---

## 💩 垃圾测试长什么样？

### 例子 1：测试常量存在

```typescript
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

问题：
- 测试"常量等于自身"，毫无价值
- 删掉这个常量，测试也跟着失败（废话）
- 改错常量的值？测试不会发现

### 例子 2：内联复制

```typescript
describe('formatTime', () => {
  // 测试内部重新定义了函数！
  function formatTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }
  
  it('formats milliseconds', () => {
    expect(formatTime(100)).toBe('100ms');
  });
});
```

问题：
- 测试的不是源码，是测试自己定义的函数
- 源码改了，测试还是通过 ← **灾难**
- 相当于自己和自己玩

---

## 🔍 如何发现的？

### 代码审查时的疑问

> "这些测试真的有用吗？"

### 验证方法

```bash
# 1. 删除源码函数
rm src/utils/time.ts

# 2. 跑测试
npm test

# 结果：测试居然还是通过的！！！
```

**测试和源码完全解耦，测了个寂寞。**

---

## 📊 数字游戏的恶果

### 表面指标

```
覆盖率: 49% → 62%  ✅ 达标
测试数: 100 → 180  ✅ 增长
```

### 实际质量

```
有效测试: 100 → 100  ❌ 没变
垃圾测试: 0 → 80    ❌ 全是垃圾
维护成本: 低 → 高   ❌ 要改两份代码
```

### 后果

1. **假阳性**：源码有 bug，测试不报错
2. **维护负担**：改源码要改测试，改测试也要改"测试里的源码"
3. **信任崩塌**：大家不再相信测试结果

---

## 💡 正确的测试观

### 测试质量 > 测试数量

```
❌ 目标：覆盖率 60%
✅ 目标：关键路径有测试覆盖
```

### 测试行为而非存在

```typescript
// ❌ 测试常量存在
expect(ErrorCodes.ERROR).toBe('ERROR');

// ✅ 测试使用常量的行为
const output = formatError(ErrorCodes.ERROR, 'msg');
expect(output).toContain('[ERROR]');
```

### 必须导入源码

```typescript
// ❌ 内联复制
describe('formatTime', () => {
  function formatTime(ms) { ... }  // 复制
  it('works', () => expect(formatTime(100)).toBe('100ms'));
});

// ✅ 导入测试
import { formatTime } from '../src/utils/time.js';

describe('formatTime', () => {
  it('works', () => expect(formatTime(100)).toBe('100ms'));
});
```

---

## 🛠️ 检测方法

### 1. 删除源码测试法

```bash
# 删除源码
git stash

# 跑测试
npm test

# 如果测试还过，说明测试有问题
```

### 2. Grep 检测内联

```bash
# 检测测试文件中的函数定义
grep -r "function " tests/unit/ --include="*.test.ts" | \
  grep -v "describe\|it\|beforeEach"

# 结果应该为空
```

### 3. Mutation Testing

```bash
# 随机修改源码，看测试是否失败
npx stryker run
```

如果源码被改了测试还是过，说明测试没用。

---

## 📋 正确的覆盖率目标

| 模块类型 | 建议覆盖率 | 原因 |
|----------|-----------|------|
| 核心业务逻辑 | 80%+ | 高风险 |
| 工具函数 | 70%+ | 复用广泛 |
| UI/展示层 | 50%+ | 变化频繁 |
| 配置/常量 | 0% | 静态数据 |

**不是所有代码都值得测试。**

---

## 🧹 修复过程

### Step 1：识别垃圾

```bash
# 找出所有"测试常量"的测试
grep -r "expect.*toBe.*SAME_VALUE" tests/
```

### Step 2：删除

```bash
# 直接删除无价值测试文件
rm -rf tests/unit/commands/  # 82 个测试全删
```

### Step 3：重写

```typescript
// 只保留真正有价值的测试
describe('printKnownError', () => {
  it('should include causes and solutions', () => {
    const consoleSpy = jest.spyOn(console, 'error');
    printKnownError(ErrorCodes.REDIS_NOT_CONFIGURED, 'error');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Redis host not specified')
    );
  });
});
```

### 结果

```
测试数: 180 → 144  （删了 82，新写 46）
覆盖率: 62% → 55%  （看起来下降了）
有效测试: 100 → 144 ✅（真正增加了）
```

**覆盖率下降，质量上升。**

---

## 💡 经验总结

1. **不要用覆盖率作为 KPI** - 数字可以刷
2. **关注行为而非存在** - 测试"做什么"而非"是什么"
3. **定期清理测试** - 垃圾测试不如没测试
4. **代码审查要看测试** - 测试也是代码

---

## 🚀 下一篇预告

**《Agent幻觉：它说做完了但其实没有》**

AI Agent 最坑的问题：报告完成但实际没做，怎么防？

---

#测试 #覆盖率 #工程实践 #经验教训 #代码质量
