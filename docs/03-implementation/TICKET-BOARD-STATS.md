# Ticket 看板与统计功能

**版本**: v0.9.0
**创建日期**: 2026-03-25
**状态**: 已实现

---

## 概述

提供完整的 Ticket 看板管理和统计信息功能，支持多种视图和导出格式。

---

## 功能列表

### 1. Ticket 列表 (`list`)

列出所有 tickets，支持按状态过滤。

```bash
# 列出所有 tickets
./scripts/ticket-board.sh list

# 按状态过滤
./scripts/ticket-board.sh list in_progress
./scripts/ticket-board.sh list review
```

**输出示例**:
```
ID              标题                                       类型         优先级     状态
----            ----                                       ----         ----       ----
FEAT-001        用户登录功能                               feature      P1         in_progress
FEAT-002        首页开发                                   feature      P2         ready
BUG-001         登录崩溃修复                               bugfix       P0         review
```

---

### 2. 统计摘要 (`summary`)

显示详细的统计摘要，包括按状态、类型、优先级的分布。

```bash
./scripts/ticket-board.sh summary
```

**输出示例**:
```
========================================
Ticket 统计摘要
========================================

## 按状态统计

状态                   数量
----                   ----
backlog                  5 ██████████
ready                    3 ██████
in_progress              4 ████████
test                     2 ████
review                   1 ██
done                    10 ████████████████████

总计                    25

## 按类型统计

类型              数量
----              ----
Feature             12
Bugfix               5
Task                 6
Improvement          2

## 按优先级统计

优先级        数量
------        ----
P0 (紧急)      2
P1 (高)        5
P2 (中)       12
P3 (低)        6
```

---

### 3. 看板视图 (`board`)

以看板形式显示 tickets，按状态分组。

```bash
./scripts/ticket-board.sh board
```

**输出示例**:
```
========================================
Ticket 看板
========================================

## 待办 (backlog)

  ⚪ [FEAT-003] 设置页面开发
  ⚪ [FEAT-004] 个人中心

## 就绪 (ready)

  🟡 [FEAT-002] 首页开发
  🟡 [BUG-002] 样式修复

## 进行中 (in_progress)

  🟠 [FEAT-001] 用户登录功能
  🟡 [FEAT-005] 搜索功能

## 测试中 (test)

  🟡 [BUG-003] 性能优化

## 审查中 (review)

  🟠 [BUG-001] 登录崩溃修复

## 已完成 (done)

  🟢 [FEAT-000] 项目初始化
  🟢 [FEAT-006] 文档更新
```

---

### 4. 快速统计 (`stats`)

显示简洁的统计信息卡片。

```bash
./scripts/quick-stats.sh
```

**输出示例**:
```
┌────────────────────────────────────────────────┐
│  EKET Project Stats                              │
├────────────────────────────────────────────────┤
│                                                │
│  Total: 25                                     │
│                                                │
│  📋 Backlog: 5                                 │
│  ✅ Ready: 3                                   │
│  🔄 In Progress: 4                             │
│  🧪 Testing: 2                                 │
│  👀 Review: 1                                  │
│  ✨ Done: 10                                   │
│                                                │
│  Completion: 40%                               │
│                                                │
└────────────────────────────────────────────────┘
```

---

### 5. 导出看板 (`export`)

导出看板为 Markdown 文件。

```bash
# 导出到默认文件
./scripts/ticket-board.sh export

# 导出到指定文件
./scripts/ticket-board.sh export board.md
```

**导出的 Markdown 格式**:
```markdown
# Ticket 看板

**生成时间**: 2026-03-25T10:30:00Z

---

## 统计摘要

...

---

## 看板视图

### 待办

| ID | 标题 | 优先级 |
|----|------|--------|
| FEAT-003 | 设置页面开发 | P3 |

...
```

---

## Claude Code 命令

### /eket-board

```bash
# 列出所有 tickets
/eket-board list

# 按状态过滤
/eket-board list in_progress

# 统计摘要
/eket-board summary

# 看板视图
/eket-board board

# 快速统计
/eket-board stats

# 导出看板
/eket-board export board.md

# 完整报告 (快速统计 + 统计摘要)
/eket-board full
```

---

## 脚本工具

| 脚本 | 功能 |
|------|------|
| `scripts/ticket-board.sh` | 看板管理主脚本 |
| `scripts/generate-stats.sh` | 生成详细统计报告 |
| `scripts/quick-stats.sh` | 快速统计卡片 |

---

## 统计维度

### 按状态
- backlog
- analysis
- approved
- design
- ready
- in_progress
- test
- review
- passed
- changes_requested
- done

### 按类型
- feature
- bugfix
- task
- improvement

### 按优先级
- P0 (紧急)
- P1 (高)
- P2 (中)
- P3 (低)

### 按负责人
- 自动统计各负责人的 ticket 数量

---

## 趋势分析

`generate-stats.sh` 支持趋势分析：
- 本周创建 ticket 数
- 上周创建 ticket 数
- 增长/下降百分比
- 完成率统计

---

## 使用场景

### 每日站会
```bash
# 显示快速统计
/eket-board stats

# 查看进行中的任务
/eket-board list in_progress
```

### 周报复告
```bash
# 导出完整看板
/eket-board export weekly-report.md

# 生成详细统计
./scripts/generate-stats.sh markdown > stats.md
```

### 项目回顾
```bash
# 查看所有完成的任务
/eket-board list done

# 统计摘要
/eket-board summary
```

---

## 相关文件

- [Ticket 模板](../template/jira/ticket-template.md)
- [看板命令](../template/.claude/commands/eket-board.sh)
- [看板脚本](../scripts/ticket-board.sh)
- [统计脚本](../scripts/generate-stats.sh)
- [快速统计](../scripts/quick-stats.sh)

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-25
