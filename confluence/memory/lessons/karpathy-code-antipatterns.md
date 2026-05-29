---
name: karpathy-code-antipatterns
type: lesson
tags: [coding, guidelines, best-practices, simplicity, surgical-changes]
confidence: high
source: ultraskills/community/karpathy-guidelines (Andrej Karpathy observations)
references: [borrowing-methodology]
---

# Karpathy Code Anti-Patterns - LLM编码常见错误

> 基于Andrej Karpathy对LLM编码陷阱的观察  
> **Tradeoff:** 这些准则偏向谨慎而非速度。简单任务用判断力。

---

## 1. Think Before Coding - 先思考再编码

**Don't assume. Don't hide confusion. Surface tradeoffs.**

### 实施前:

- **显式声明假设** - 如果不确定,问清楚
- **如果存在多种解释,呈现它们** - 不要静默选择
- **如果存在更简单的方法,说出来** - 在合适时推回
- **如果有不清楚的,停下** - 说出什么令人困惑,然后问

### 与eket经验的对齐

类似 [[epic-006-slaver-lessons]] 中的Agent幻觉问题:
- ❌ 假设需求 → 实现错误方向
- ✅ 澄清模糊 → 正确实现

---

## 2. Simplicity First - 简单优先

**Minimum code that solves the problem. Nothing speculative.**

### 规则

- ❌ **No features beyond what was asked** - 不要超出要求添加功能
- ❌ **No abstractions for single-use code** - 单次使用不要抽象
- ❌ **No "flexibility" or "configurability" that wasn't requested** - 不要未要求的灵活性/可配置性
- ❌ **No error handling for impossible scenarios** - 不为不可能场景处理错误
- ❌ **If you write 200 lines and it could be 50, rewrite it** - 能50行别写200行

**自问:** "Senior engineer会说这过度复杂吗?" 如果是,简化。

### eket实例

[[epic-014-benchmark-lessons]] 中的教训:
- ❌ 1590行router文件(单体)
- ✅ 渐进重构 → 按模块拆分 → 清晰职责

**Karpathy视角:** 1590行router应该立即重写,不是"先发后重构"。

---

## 3. Surgical Changes - 手术刀式修改

**Touch only what you must. Clean up only your own mess.**

### 编辑现有代码时:

- ❌ **不要"改进"相邻代码、注释或格式化**
- ❌ **不要重构未损坏的东西**
- ✅ **匹配现有风格**,即使你会用不同方式
- ✅ **如果发现无关死代码,提及它** - 不删除(除非被要求)

### 你的改动创造孤儿时:

- ✅ **移除imports/变量/函数** - 你的改动让它们变unused
- ❌ **不移除预存在的死代码** - 除非被要求

**测试:** 每一行改动都应直接追溯到用户请求。

### eket场景

[[repo-slimming]] 中删除1.2GB文件:
- ✅ Surgical: 只删除明确无用的大文件
- ❌ 避免: 顺带删除"看起来没用"的代码

---

## 4. Goal-Driven Execution - 目标驱动执行

**Define success criteria. Loop until verified.**

### 将任务转换为可验证目标:

```
❌ "Add validation" 
✅ "Write tests for invalid inputs, then make them pass"

❌ "Fix the bug"
✅ "Write a test that reproduces it, then make it pass"

❌ "Refactor X"
✅ "Ensure tests pass before and after"
```

### 多步任务,声明简要计划:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

**强成功标准让你独立循环。弱标准("让它工作")需要持续澄清。**

### Karpathy关键洞察

> "LLMs are exceptionally good at looping until they meet specific goals...  
> Don't tell it what to do, give it success criteria and watch it go."

### eket实践

[[epic-003-parallel-agents-deadlock]]:
- ❌ 目标模糊: "让多Agent并行工作"
- ✅ 验证标准: "10个Agent并发无.git/index.lock冲突"

---

## 速查表

| 原则 | 做 | 不做 |
|------|---|------|
| **Think First** | 显式假设、呈现选项、澄清困惑 | 静默猜测、隐藏不确定性 |
| **Simplicity** | 最小代码、单一用途无抽象 | 未要求的功能、过早优化 |
| **Surgical** | 只改必须的、匹配现有风格 | 顺带重构、格式化调整 |
| **Goal-Driven** | 可验证标准、TDD循环 | 模糊目标、事后测试 |

---

## 红旗思维模式(来自Karpathy)

这些想法意味着STOP - 你在合理化:

| 想法 | 现实 |
|------|------|
| "这只是简单问题" | 简单问题也需检查目标 |
| "先探索代码库" | 先定义你在找什么 |
| "先收集信息" | 先定义需要什么信息 |
| "不需要正式计划" | 计划防止返工 |
| "记得怎么做" | 记忆≠当前最佳实践 |
| "先做这一件事" | 做前先验证目标 |
| "这感觉高效" | 无纪律行动浪费时间 |

---

## 与eket工程文化对齐

### 已对齐
- ✅ **Surgical Changes** ↔ [[borrowing-methodology]] (提取方法论,不照搬实现)
- ✅ **Simplicity First** ↔ [[epic-014-benchmark-lessons]] (类型安全>过度测试)
- ✅ **Goal-Driven** ↔ SLAVER-RULES.md (Hard Rules + 验收标准)

### 可加强
- **Think Before Coding** → 在ticket创建时强制"Success Criteria"字段
- **Surgical Changes** → PR review checklist: "每行改动追溯到ticket?"

---

## 实施建议

### PR Review时问:

1. **Simplicity:** 能用一半代码实现吗?
2. **Surgical:** 哪些改动与ticket无关?
3. **Goal-Driven:** 验收标准在哪?(tests? manual check?)

### Ticket创建时强制:

```yaml
acceptance_criteria:
  - verify: "10 concurrent agents no deadlock"
  - verify: "tests pass before and after"
  - verify: "no new dependencies added"
```

---

## 延伸阅读

- Karpathy原推文: https://x.com/karpathy/status/2015883857489522876
- [[borrowing-methodology]] - 如何提取外部经验
- [[epic-014-benchmark-lessons]] - 实战中的简单优先
- [[test-quality-over-quantity]] - 质量>数量的目标驱动
