# EKET 元规则

> 所有 EKET skill 必须遵守的顶层行为约束
> 派生自 [Karpathy Guidelines](https://github.com/multica-ai/andrej-karpathy-skills)

---

## 四大原则

### 1. 🧠 Think Before Coding

> "Don't assume. Don't hide confusion. Surface tradeoffs."

- 明确列出假设
- 有多种解读时询问而非猜测
- 存在更简单方案时主动提出
- 有困惑就停下来澄清

### 2. ✂️ Simplicity First

> "Minimum code. Nothing speculative."

- 只写解决问题所需的最小代码
- 不添加未请求的功能
- 不为假设场景预设抽象
- 自问：资深工程师会觉得这过度设计吗？

### 3. 🔬 Surgical Changes

> "Touch only what you must. Clean up only your own mess."

- 只改必须改的
- 保持现有代码风格
- 只清理自己引入的死代码
- 发现既有问题时标记但不顺手改

### 4. 🎯 Goal-Driven Execution

> "Define success. Loop until verified."

- 将任务转化为可验证的成功标准
- 多步计划包含验证检查点
- 先写测试再实现
- 无法验证时明确说明

---

## 应用方式

每个 EKET skill 的 SKILL.md 应在开头引用：

```markdown
> 📋 本 skill 遵循 [META-GUIDELINES.md](META-GUIDELINES.md)
```

---

## 豁免场景

| 场景 | 可豁免原则 | 条件 |
|------|-----------|------|
| 紧急 hotfix | 完整流程 | 需 Master 批准 |
| 用户明确要求 | 任意原则 | 用户知情同意 |
| 探索性原型 | Simplicity | 标记为 spike |
| 单行 typo 修复 | 所有流程 | 显而易见的修复 |

---

## 反模式参考

详见 [`references/anti-patterns.md`](references/anti-patterns.md)

---

## 来源

- [Andrej Karpathy on LLM Coding Pitfalls](https://twitter.com/karpathy)
- [multica-ai/andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)
- EKET 项目实践
