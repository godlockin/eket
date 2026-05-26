---
name: pattern-name-kebab-case
type: pattern | pitfall | lesson | glossary
created: YYYY-MM-DD
source: TASK-XXX
tags: [tag1, tag2]
confidence: high | medium | low
---

# 标题

> 一句话摘要（可选，用于索引）

## 场景/症状

何时会遇到这个问题/模式？描述触发条件、上下文。

**示例场景**：
- 使用 X 库时
- 在 Y 配置下
- 当 Z 条件满足时

## 方案/根因

### 根因（pitfall/lesson 必填）

问题的根本原因分析。

### 方案（pattern/pitfall 必填）

解决方案或推荐做法。

## 示例

```typescript
// 示例代码
```

或

```bash
# 命令示例
```

## 反模式（可选）

**不要这样做**：

```typescript
// 反模式示例
```

**原因**：解释为什么这是反模式。

## 检测方法（可选）

如何发现这个问题？

```bash
# 检测脚本/命令
```

## 相关

- [相关模式](../patterns/xxx.md)
- [相关 pitfall](../pitfalls/xxx.md)
- [外部参考](https://example.com)

---

## Frontmatter 字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 唯一标识符，kebab-case |
| `type` | 是 | `pattern` / `pitfall` / `lesson` / `glossary` |
| `created` | 是 | 创建日期 YYYY-MM-DD |
| `source` | 是 | 来源 ticket，如 `TASK-XXX` |
| `tags` | 否 | 标签数组，便于检索 |
| `confidence` | 否 | 置信度：`high`（验证过）/ `medium`（部分验证）/ `low`（推测） |

## 各类型模板差异

### pattern（可复用模式）

- **场景**：描述适用场景
- **方案**：核心做法
- **示例**：具体代码/配置
- **反模式**：对比错误做法（推荐）

### pitfall（踩坑记录）

- **症状**：外在表现
- **根因**：深层原因
- **解法**：修复方案
- **检测方法**：如何发现（推荐）

### lesson（经验教训）

- **场景**：发生背景
- **教训**：学到什么
- **示例**：具体案例
- **预防**：如何避免

### glossary（术语表）

- **定义**：术语解释
- **示例**：用法示例
- **相关**：相关术语

---

*模板版本：1.0 | 创建于：2026-05-27 | 来源：TASK-E16-05*
