---
name: borrowing-methodology
type: lesson
created: 2026-05-27
source: multi-project-research
tags: [research, methodology, best-practices, external-projects]
confidence: high
---

# 借鉴外部项目方法论

> 借鉴时提取方法论而非照搬实现

## 核心原则

**借方法论，不借代码**

外部项目的代码是针对他们的问题写的，直接复制:
1. 引入不必要的依赖
2. 与现有架构冲突
3. 维护成本高

正确做法是提取其背后的**设计思想**和**解决模式**。

## 借鉴评估框架

### 5 维评分标准

| 维度 | 高分条件 | 低分条件 |
|------|---------|---------|
| 问题匹配度 | 当前有此痛点 | 解决的问题我们没有 |
| 可移植性 | 无需新基础设施 | 需要引入新依赖 |
| 可验证性 | 有明确测试方法 | 难以验证效果 |
| 范围可控 | ≤3 个文件改动 | 需要大规模重构 |
| 可撤销性 | 纯新增不改已有 | 修改核心逻辑 |

**决策矩阵**:
- 4-5 分: 直接建卡实施
- 3 分: 创建 spike ticket 验证
- < 3 分: 记录到 borrowed-wisdom.md，暂不实施

### 研究流程

```
1. 定义问题 → 2. 验证URL → 3. 单Agent探索 → 4. 立即写文件
     ↓              ↓              ↓              ↓
  "我想学什么"   gh search      不超配专家    研究完就写
```

## 反模式

### 1. 照搬实现

```typescript
// ❌ 错误: 复制外部项目代码
import { someUtil } from 'external-project';

// ✅ 正确: 理解原理后自己实现
function ourVersionOfSamePattern() {
  // 适配我们的架构
}
```

### 2. 过度研究

```markdown
# ❌ 错误: 一个项目研究 3 天
Round 15: 研究项目 A 的每一个文件...

# ✅ 正确: 每项目最多 2-3 个借鉴点
- 项目 A: 学到 X 模式 (1h)
- 项目 B: 学到 Y 方案 (1h)
```

### 3. 漏记结论

```markdown
# ❌ 错误: 研究完不写文件
(35 个 agent 并行研究，compact 后结论全丢)

# ✅ 正确: 研究完立即写入
confluence/memory/research/round-XX-project.md
```

## 标准产出模板

```markdown
## 来源
项目 URL + 作者 + Stars

## 解决的问题
一句话核心问题

## 核心模式
(代码片段 / 架构图)

## EKET 适配方案
需改哪些文件

## 实现状态
- [ ] 未开始 / [ticket-id] / ✅ 已完成
```

## 已验证的借鉴案例

| 来源项目 | 借鉴点 | EKET 落地 |
|----------|--------|-----------|
| context-mode | ToC Snapshot 哲学 | MEMORY-INDEX.md |
| MemOS | L0-L4 记忆分层 | memory/ 目录结构 |
| GenericAgent | "No Execution No Memory" | proof 字段强制 |
| deer-flow | SlaveResult schema | Agent 结果协议 |

## 陷阱警告

1. **定位偏差**: 科研工具 vs 工程框架，强行映射 = 浪费
2. **重叠忽视**: 已有 60% 相似实现，不要重复建卡
3. **URL 失效**: `gh search repos` 验证后再 WebFetch

---

**关联**:
- [research-methodology.md](research-methodology.md)
- [../research/borrowed-wisdom.md](../research/borrowed-wisdom.md)
