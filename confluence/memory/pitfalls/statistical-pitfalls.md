---
name: statistical-pitfalls
type: pitfall
tags: [statistics, ab-testing, experimental-design, p-value, power]
confidence: high
source: ultraskills/external/claude-skills/statistical-analyst
references: []
---

# Statistical Testing Pitfalls - 统计测试常见陷阱

> A/B测试、实验设计中的反模式

---

## The p-value Misconception - p值误解

### ❌ 常见错误理解

**错误:** "p=0.03意味着效果真实的概率是97%"

**正确理解:** 
> "如果没有效果(H₀为真),我们只有3%概率看到这么极端的数据"

### Frequentist框架

- **H₀ (null):** Control和Treatment无差异
- **H₁ (alternative):** 存在差异(双尾)
- **p-value:** P(观察到此结果或更极端 | H₀为真)
- **α (显著性水平):** 预先设定的阈值。p < α时拒绝H₀

**关键:** p值不是"效果真实概率",是"假设无效果时数据极端概率"。

---

## Type I and Type II Errors - I类与II类错误

| | H₀为真 | H₀为假 |
|---|---|---|
| 拒绝H₀ | **I类错误(α)** - 假阳性 | 正确(Power = 1−β) |
| 未拒绝H₀ | 正确 | **II类错误(β)** - 假阴性 |

### 如何选择α和β

- **α** (假阳性率): 通常0.05
  - **降低α当:** 假阳性代价高(医疗试验、不可逆改动)
  
- **β** (假阴性率): 通常0.20 (power=80%)
  - **降低β当:** 错过真实效果代价高

**Tradeoff:** 降低α → 增大β (固定样本量下)

---

## The Peeking Problem - 偷看问题

### ❌ 错误做法

```
计划n=1000样本
↓
n=500时peek → "p=0.08,继续"
↓
n=750时peek → "p=0.06,继续"
↓
n=1000时 → "p=0.04,显著!"
```

**问题:** 
- 多次peek inflate真实α
- Peek 3次(50%, 75%, 100%) → 真实α ≈ 0.13 (不是0.05)
- **假阳性率膨胀2.6倍**

### ✅ 解决方案

1. **预承诺停止规则** - 不peek
2. **Sequential testing (SPRT)** - 如果必须早停
3. **Bonferroni校正α** - 如果在预定时间peek

---

## Multiple Comparisons - 多重比较

### 问题

测试k个假设,每个α=0.05:

```
P(至少1个假阳性) ≈ 1 − (1 − 0.05)^k
```

| k tests | P(≥1假阳性) |
|---------|-------------|
| 1 | 5% |
| 3 | 14% |
| 5 | 23% |
| 10 | 40% |
| 20 | 64% |

### ✅ 校正方法

#### Bonferroni校正

```
每个test用 α/k
```

- **适用:** 独立测试
- **保守但简单**

#### Benjamini-Hochberg (FDR)

控制False Discovery Rate,不是family-wise error。

- **适用:** 预期多个真阳性时
- **比Bonferroni less conservative**

---

## Sample Size & Power Pitfalls - 样本量与检验力陷阱

### 常见错误

#### 1. 事后计算样本量

```
❌ "我们有n=500数据,p=0.06不显著"
   "计算需要n=800才能detect此效果"
```

**问题:** 事后(post-hoc)power分.1%转化率提升"
   → 需要n=几百万
```

**现实:** MDE太小 → 样本量explode → 实验不可行

**解决:** 选择business-meaningful MDE(如+2%转化率),不是技术上可detect的最小值。

---

## SUTVA Violation - 稳定单元处理假设违反

### SUTVA (Stable Unit Treatment Value Assumption)

**假设:** 单元i的结果只依赖自己的treatment分配,不依赖其他单元的分配。

### ❌ 违反场景

1. **社交功能** - 用户A看到用户B的活动(网络spillover)
2. **共享库存** - 一个variant耗尽共享库存
3. **双边市场** - 买家和卖家互动

### ✅ 解决方案

- **Cluster randomization** - 按组/地理位置随机化
- **Network A/B testing** - 基于图的切分
- **Holdout-based testing**

---

## Heavy-Tailed Metrics - 重尾指标陷阱

### 问题

Revenue、LTV等指标通常heavy-tailed:
- 少数用户贡献大部分收入
- 均值测试对outlier敏感

### ❌ 错误: 直接用t-test

```typescript
// 可能被单个大客户dominate
welch_t_test(revenue_control, revenue_treatment)
```

### ✅ 解决方案

1. **Winsorize at 99th percentile** - 截断极值
2. **Log-transform** (如果值>0)
3. **Non-parametric test** (Mann-Whitney U) + 人工review

```typescript
// Example: Winsorize
const p99 = percentile(revenue, 99);
const winsorized = revenue.map(x => Math.min(x, p99));
welch_t_test(winsorized_control, winsorized_treatment);
```

---

## Wilson Score Interval - 比例置信区间

### ❌ 错误: 标准正态近似

```
CI = p̂ ± z√(p̂(1−p̂)/n)
```

**问题:** 小n或极端p时可能<0或>1

### ✅ 正确: Wilson score interval

```
center = (p̂ + z²/2n) / (1 + z²/n)
margin = z/(1+z²/n) × √(p̂(1−p̂)/n + z²/4n²)
CI = [center − margin, center + margin]
```

**Always use Wilson (or Clopper-Pearson) for proportions.**

---

## Quick Reference - 快速参考

### 常见陷阱与修复

| 陷阱 | 修复 |
|------|------|
| p值误解 | 理解为"假设H₀时数据极端概率" |
| Peeking | 预承诺停止规则 / Sequential testing |
| Multiple comparisons | Bonferroni / BH校正 |
| 事后power分析 | 实验前计算样本量 |
| SUTVA violation | Cluster randomization |
| Heavy-tailed metrics | Winsorize / log-transform |
| 比例置信区间 | Wilson score, not normal approx |

---

## Effect Size Matters - 效应量很重要

### 统计显著≠实际重要

```
n=1,000,000
p=0.001 (highly significant!)
转化率提升: 10.00% → 10.01% (+0.01%)
```

**问题:** 统计显著但business impact可忽略。

### ✅ Always report effect size

- **Proportions:** Cohen's h, absolute difference
- **Means:** Cohen's d
- **Categorical:** Cramér's V

**Decision:** 基于effect size + p-value,不只是p-value。

---

## Pre-Registration - 预注册

### Why

避免HARKing (Hypothesizing After Results are Known):
- 看数据后调整假设
- Cherry-pick显著结果
- 改变primary outcome

### ✅ Best Practice

实验前文档化:
```yaml
hypothesis: "Treatment提升转化率"
primary_metric: "7天转化率"
mde: 2%
alpha: 0.05
planned_n: 10000
stopping_rule: "固定n,不peek"
```

---

## 与eket工程对照

虽然eket非统计重,但这些原则适用于:

### Performance Benchmarking

- [[epic-014-benchmark-lessons]] 中的性能对比
  - ❌ 避免: 多次运行找"最好"结果(cherry-picking)
  - ✅ 应该: 预定义N次运行,report mean ± CI

### A/B Testing Agent Variants

如果测试不同Agent策略:
- **SUTVA考虑:** Agent可能共享资源(Redis, worktree)
- **Pre-registration:** 预定义成功metric(latency? 正确率?)
- **Effect size:** 不只看p值,看实际latency差异是否meaningful

---

## 延伸阅读

### Books
- Kohavi, R. *Trustworthy Online Controlled Experiments* (2020)
- Imbens & Rubin. *Causal Inference* (2015)
- Cohen, J. *Statistical Power Analysis* (1988)

### Papers
- Wilson, E.B. "Probable Inference" *JASA* (1927) - Wilson score
- Benjamini & Hochberg. "Controlling FDR" (1995)

### 相关eket文档
- [[epic-014-benchmark-lessons]] - 性能测评方法论
