---
title: TASK-DIALS 三旋钮参数化配置指南
version: 1.0.0
created: 2026-05-27
updated: 2026-05-27
author: EKET Framework Team
tags: [ticket, configuration, slaver, execution-strategy]
---

# TASK-DIALS: 三旋钮参数化配置指南

**版本**: 1.0.0
**更新时间**: 2026-05-27
**维护者**: EKET Framework Team

---

## 快速参考（按需加载用）

> 只需记住这个表，详细说明按需查看下方章节。

| 场景 | strictness | detail_level | style | 备注 |
|------|------------|--------------|-------|------|
| 快速原型 | 3 | 3 | minimal | 验证概念即可 |
| 常规开发 | 6 | 5 | standard | 默认配置 |
| 生产核心 | 8 | 7 | standard | 需边界测试 |
| 安全/合规 | 10 | 9 | thorough | 全覆盖+审计 |

**旋钮速记**：
- `strictness`: 测试/验收严苛程度 (1=宽松, 10=苛刻)
- `detail_level`: 文档/日志详细程度 (1=精简, 10=详尽)  
- `style`: minimal(速战)/standard(标准)/thorough(彻底)

---

## 概述

三旋钮是 EKET Ticket 系统的参数化配置机制，让 Master 在创建/分配任务时明确告知 Slaver 期望的执行策略。

**核心价值**：
- 消除 Slaver 对"该做多少"的猜测
- 平衡速度与质量的权衡
- 不同场景采用不同执行标准

---

## 三个旋钮

### 1. strictness（严格度）

**范围**: 1-10  
**默认**: 5  
**影响范围**: 代码审查、测试覆盖、验收标准执行、错误处理

| 值 | 含义 | 典型行为 |
|----|------|---------|
| 1-3 | 宽松 | 跳过边界测试、容忍 lint 警告、验收标准通过即可 |
| 4-6 | 标准 | 覆盖主流程、修复 lint 错误、验收标准全通过 |
| 7-8 | 严格 | 边界覆盖、零警告、验收标准加压测试 |
| 9-10 | 苛刻 | 100% 分支覆盖、形式化验证、多轮 review |

**Slaver 行为映射**:
- `strictness <= 3`: 快速验证核心功能，可接受 tech debt
- `strictness 4-6`: 按标准开发流程执行
- `strictness 7-8`: 增加边界测试、安全扫描、性能基准
- `strictness >= 9`: 形式化验证、变异测试、对抗性审查

---

### 2. detail_level（详细度）

**范围**: 1-10  
**默认**: 5  
**影响范围**: 分析报告、代码注释、文档、日志、commit message

| 值 | 含义 | 典型行为 |
|----|------|---------|
| 1-3 | 极简 | 无注释/最小日志/一行 commit/无分析报告 |
| 4-6 | 标准 | 关键注释/结构化日志/规范 commit/标准分析报告 |
| 7-8 | 详尽 | 全面注释/详细日志/commit 含 why/完整设计文档 |
| 9-10 | 考古级 | ADR 记录/每步骤截图/会议纪要级别报告 |

**Slaver 行为映射**:
- `detail_level <= 3`: 代码自解释即可，跳过文档
- `detail_level 4-6`: 关键函数有 docstring，commit 遵循 conventional
- `detail_level 7-8`: 每个模块有 README，复杂逻辑有设计注释
- `detail_level >= 9`: 生成 ADR，记录决策背景和替代方案

---

### 3. style（风格）

**选项**: `minimal` | `standard` | `thorough`  
**默认**: `standard`  
**影响范围**: 整体执行策略、时间分配、资源消耗

| 风格 | 核心理念 | 适用场景 |
|------|---------|---------|
| `minimal` | 最小可行交付 | 原型、验证、内部工具、紧急修复 |
| `standard` | 平衡速度与质量 | 常规开发、迭代功能、日常任务 |
| `thorough` | 质量优先、深度执行 | 生产核心、安全关键、长期维护模块 |

**style 与 strictness/detail_level 的关系**:

| style | strictness 建议范围 | detail_level 建议范围 |
|-------|-------------------|---------------------|
| `minimal` | 1-4 | 1-3 |
| `standard` | 4-7 | 4-6 |
| `thorough` | 7-10 | 7-10 |

> **注意**: style 是整体策略，strictness/detail_level 可微调。例如 `style=standard` 但 `strictness=8` 表示"标准流程但测试要严格"。

---

## 场景示例

### 场景 A: 快速原型 / Hackathon

```yaml
strictness: 3
detail_level: 3
style: minimal
```

**Slaver 执行策略**:
- 只覆盖 happy path
- 跳过单元测试或仅烟雾测试
- 代码注释：无
- 分析报告：1-2 句话概述
- commit message：`feat: add X`
- 允许 TODO/FIXME 残留

---

### 场景 B: 常规功能开发

```yaml
strictness: 6
detail_level: 5
style: standard
```

**Slaver 执行策略**:
- 覆盖主流程 + 常见异常
- 单元测试覆盖关键逻辑
- 关键函数有 docstring
- 标准分析报告（需求理解 + 方案 + 风险）
- commit message 遵循 conventional commits
- lint/format 通过

---

### 场景 C: 生产核心模块

```yaml
strictness: 8
detail_level: 7
style: standard
```

**Slaver 执行策略**:
- 全面覆盖（含边界、异常、并发）
- 集成测试 + 压力测试
- 每个公开 API 有文档
- 详细分析报告（含替代方案评估）
- 安全扫描通过
- 性能基准测试

---

### 场景 D: 安全关键 / 合规模块

```yaml
strictness: 10
detail_level: 9
style: thorough
```

**Slaver 执行策略**:
- 形式化验证（如适用）
- 变异测试确保测试有效性
- 对抗性 review（假设攻击者视角）
- 完整 ADR（Architecture Decision Record）
- 逐行安全审计
- 第三方依赖 CVE 扫描
- 合规检查清单全通过

---

## Slaver 执行算法

Slaver 领取 ticket 后按以下逻辑调整行为：

```python
def adjust_execution_strategy(ticket):
    s = ticket.strictness or 5
    d = ticket.detail_level or 5
    style = ticket.style or "standard"
    
    # 测试策略
    if s <= 3:
        skip_tests = True
    elif s <= 6:
        test_coverage = "happy_path + common_errors"
    elif s <= 8:
        test_coverage = "full + edge_cases"
    else:
        test_coverage = "full + mutation + adversarial"
    
    # 文档策略
    if d <= 3:
        doc_level = "none"
    elif d <= 6:
        doc_level = "key_functions_only"
    elif d <= 8:
        doc_level = "comprehensive"
    else:
        doc_level = "adr + rationale"
    
    # 时间分配（style 影响）
    if style == "minimal":
        time_budget = "50% of estimate"
    elif style == "standard":
        time_budget = "100% of estimate"
    else:  # thorough
        time_budget = "150% of estimate"
```

---

## 默认值与继承

### 默认值

未设置时使用以下默认：
- `strictness`: 5
- `detail_level`: 5
- `style`: standard

### Epic 级继承

Epic 可设置三旋钮默认值，其下所有 ticket 继承：

```yaml
# epic.yml
defaults:
  strictness: 7
  detail_level: 6
  style: standard
```

Ticket 可覆盖 Epic 默认值。

---

## 与其他协议的关系

| 协议 | 关系 |
|------|------|
| Gate Review | gate_reviewer 检查三旋钮是否已设置（建议项，非强制） |
| 分析报告 | detail_level 影响报告详尽程度 |
| PR Review | strictness 影响 review 严格程度 |
| 测试策略 | strictness 直接决定测试覆盖要求 |

---

## FAQ

### Q: 三旋钮必须全部设置吗？
A: 不必须，未设置使用默认值（5/5/standard）。

### Q: Slaver 能否修改三旋钮？
A: 不能。三旋钮由 Master/创建者设置，Slaver 只能执行。如有异议，在分析报告中提出。

### Q: 如何选择合适的值？
A: 参考场景示例，或使用以下速查：
- 紧急/原型/内部工具 → `3/3/minimal`
- 常规开发 → `6/5/standard`
- 生产核心 → `8/7/standard`
- 安全/合规 → `10/9/thorough`

### Q: style 和具体数值冲突怎么办？
A: 以具体数值为准。style 是语义化快捷方式，strictness/detail_level 是精确控制。

---

**维护者**: EKET Framework Team
