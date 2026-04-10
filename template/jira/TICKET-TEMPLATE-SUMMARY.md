# EKET Ticket 编号模板总结

**版本**: v2.9.0-alpha
**创建时间**: 2026-04-06
**更新时间**: 2026-04-10

---

## 重要：职责边界

**在创建或使用 Ticket 前，请先阅读**：

- 📄 [TICKET-RESPONSIBILITIES.md](./TICKET-RESPONSIBILITIES.md) — Master/Slaver 职责边界规范
  - Master 只能写：需求文档、架构文档、Ticket、PR 审查报告
  - Slaver 只能写：代码、测试、PR、分析报告
  - **红线**：Master 禁止写代码，Slaver 禁止修改 Ticket 元数据

---

## Ticket 编号一览

| 序号 | Ticket 类型 | 编号前缀 | 编号示例 | 模板文件 |
|------|------------|---------|---------|----------|
| 1 | 功能需求卡 | `FEAT` | `FEAT-001`, `FEAT-002`, `FEAT-003` | `jira/templates/feature-ticket.md` |
| 2 | 任务卡 | `TASK` | `TASK-001`, `TASK-002`, `TASK-003` | `jira/templates/task-ticket.md` |
| 3 | 缺陷修复卡 | `FIX` | `FIX-001`, `FIX-002`, `FIX-003` | `jira/templates/bugfix-ticket.md` |
| 4 | 测试卡 | `TEST` | `TEST-001`, `TEST-002`, `TEST-003` | `jira/templates/test-ticket.md` |
| 5 | 产品需求卡 | `PRD` | `PRD-001`, `PRD-002`, `PRD-003` | `jira/templates/prd-ticket.md` |
| 6 | UI/UX 设计卡 | `U-DESIGN` | `U-DESIGN-001`, `U-DESIGN-002` | `jira/templates/ui-design-ticket.md` |
| 7 | 技术设计卡 | `T-DESIGN` | `T-DESIGN-001`, `T-DESIGN-002` | `jira/templates/tech-design-ticket.md` |
| 8 | 部署卡 | `DEPL` | `DEPL-001`, `DEPL-002`, `DEPL-003` | `jira/templates/deployment-ticket.md` |
| 9 | 文档卡 | `DOC` | `DOC-001`, `DOC-002`, `DOC-003` | `jira/templates/doc-ticket.md` |
| 10 | 用户调研卡 | `USER-RES` | `USER-RES-001`, `USER-RES-002` | `jira/templates/user-research-ticket.md` |
| 11 | 数据分析卡 | `DATA-ANALYSIS` | `DATA-ANALYSIS-001`, `DATA-ANALYSIS-002` | `jira/templates/data-analysis-ticket.md` |
| 12 | 合规审查卡 | `COMPLIANCE` | `COMPLIANCE-001`, `COMPLIANCE-002` | `jira/templates/compliance-review-ticket.md` |

---

## 编号规则

```
{PREFIX}-{SEQUENCE_NUMBER}

PREFIX: 大写英文字母前缀
SEQUENCE_NUMBER: 3 位数字序号（从 001 开始）
```

---

## Ticket 分类

### 研发类
| 类型 | 前缀 | 用途 |
|------|------|------|
| 功能需求卡 | `FEAT` | 功能开发任务 |
| 任务卡 | `TASK` | 一般任务（文档/重构等） |
| 缺陷修复卡 | `FIX` | Bug 修复任务 |
| 测试卡 | `TEST` | 测试编写任务 |
| 文档卡 | `DOC` | 文档编写任务 |

### 设计类
| 类型 | 前缀 | 用途 |
|------|------|------|
| UI/UX 设计卡 | `U-DESIGN` | UI/UX 设计任务 |
| 技术设计卡 | `T-DESIGN` | 技术设计任务 |

### 产品/业务类
| 类型 | 前缀 | 用途 |
|------|------|------|
| 产品需求卡 | `PRD` | 产品需求文档 |
| 用户调研卡 | `USER-RES` | 用户调研任务 |
| 数据分析卡 | `DATA-ANALYSIS` | 数据分析任务 |
| 合规审查卡 | `COMPLIANCE` | 合规审查任务 |

### 运维类
| 类型 | 前缀 | 用途 |
|------|------|------|
| 部署卡 | `DEPL` | 部署任务 |

---

## 典型工作流程中的 Ticket 流转

### 完整功能开发流程

```
┌─────────────┐
│  PRD-001    │ 产品需求定义
│  (产品经理)  │
└──────┬──────┘
       │ 批准后
       ▼
┌─────────────┐
│ T-DESIGN-001│ 技术设计
│  (架构师)   │
└──────┬──────┘
       │ 批准后
       ▼
┌─────────────┐
│ U-DESIGN-001│ UI/UX 设计
│  (设计师)   │
└──────┬──────┘
       │ 批准后
       ▼
┌─────────────┐
│  FEAT-001   │ 功能开发
│  (开发工程)  │
└──────┬──────┘
       │ 完成后
       ▼
┌─────────────┐
│  TEST-001   │ 测试编写
│  (测试工程)  │
└──────┬──────┘
       │ 通过后
       ▼
┌─────────────┐
│  DEPL-001   │ 部署发布
│  (运维工程)  │
└──────┬──────┘
       │ 完成后
       ▼
    上线
```

### Bug 修复流程

```
┌─────────────┐
│   FIX-001   │ Bug 修复
│  (开发工程)  │
└──────┬──────┘
       │ 完成后
       ▼
┌─────────────┐
│  TEST-001   │ 回归测试
│  (测试工程)  │
└──────┬──────┘
       │ 通过后
       ▼
┌─────────────┐
│  DEPL-001   │ 热修复部署
│  (运维工程)  │
└─────────────┘
```

### 用户调研流程

```
┌─────────────┐
│  PRD-001    │ 产品需求
│  (产品经理)  │
└──────┬──────┘
       │ 需要用户调研
       ▼
┌─────────────┐
│ USER-RES-001│ 用户调研
│  (用研工程)  │
└──────┬──────┘
       │ 调研洞察
       ▼
┌─────────────┐
│  PRD-001    │ 更新 PRD
│  (产品经理)  │
└─────────────┘
```

### 数据分析流程

```
┌─────────────┐
│ DATA-ANALYSIS-001 │ 数据分析
│  (数据工程)       │
└──────┬──────┘
       │ 分析洞察
       ▼
┌─────────────┐
│  PRD-001    │ 产品决策
│  (产品经理)  │
└─────────────┘
```

### 合规审查流程

```
┌─────────────┐
│ COMPLIANCE-001 │ 合规审查
│  (合规工程)     │
└──────┬──────┘
       │ Legal 批准
       ▼
┌─────────────┐
│  FEAT-001   │ 功能上线
│  (开发工程)  │
└─────────────┘
```

---

## Ticket 模板核心字段

### 所有 Ticket 共有字段

| 字段 | 说明 | 填写者 |
|------|------|--------|
| **Ticket ID** | 编号（如：FEAT-001） | Master |
| **创建时间** | ISO8601 格式 | Master |
| **创建者** | Master Agent / Human | Master |
| **优先级** | P0/P1/P2/P3 | Master |
| **状态** | 见状态机 | Master/Slaver |
| **标签** | 分类标签 | Master |
| **分配给** | Slaver ID | Master |

### 元数据字段

| 字段 | 说明 | 示例 |
|------|------|------|
| **重要性** | critical/high/medium/low | `high` |
| **优先级** | P0/P1/P2/P3 | `P1` |
| **依赖关系** | YAML 格式 | `blocked_by: [FEAT-001]` |
| **背景信息** | 任务背景和业务价值 | Markdown |
| **技能要求** | 需要的技术栈 | `react, typescript` |
| **预估工时** | 预计完成时间 | `4h`, `2d` |

---

## 状态机

### 通用状态

```
backlog → analysis → approved → design → ready → in_progress → review → done
```

### 各类型状态流转

| Ticket 类型 | 完整状态流 |
|------------|-----------|
| **FEAT** | `backlog` → `analysis` → `approved` → `design` → `ready` → `in_progress` → `design_review` → `testing` → `review` → `done` |
| **TASK** | `backlog` → `ready` → `in_progress` → `documentation` → `testing` → `review` → `done` |
| **FIX** | `backlog` → `analysis` → `ready` → `in_progress` → `testing` → `review` → `done` |
| **TEST** | `backlog` → `ready` → `in_progress` → `testing` → `review` → `done` |
| **PRD** | `backlog` → `analysis` → `drafting` → `review` → `approved` → `done` |
| **U-DESIGN** | `backlog` → `analysis` → `concept` → `draft` → `review` → `approved` → `done` |
| **T-DESIGN** | `backlog` → `analysis` → `draft` → `review` → `approved` → `done` |
| **DEPL** | `backlog` → `ready` → `in_progress` → `preparing` → `dry_run` → `staging` → `production` → `verifying` → `done` |
| **DOC** | `backlog` → `ready` → `in_progress` → `drafting` → `review` → `done` |
| **USER-RES** | `backlog` → `ready` → `in_progress` → `planning` → `analyzing` → `report` → `done` |
| **DATA-ANALYSIS** | `backlog` → `ready` → `in_progress` → `extracting` → `cleaning` → `analyzing` → `report` → `done` |
| **COMPLIANCE** | `backlog` → `ready` → `in_progress` → `assessing` → `auditing` → `remediating` → `review` → `done` |

---

## 目录结构

```
jira/
├── tickets/
│   ├── feature/          # FEAT
│   │   └── FEAT-001.md
│   ├── task/             # TASK
│   │   └── TASK-001.md
│   ├── bugfix/           # FIX
│   │   └── FIX-001.md
│   ├── test/             # TEST
│   │   └── TEST-001.md
│   ├── prd/              # PRD
│   │   └── PRD-001.md
│   ├── design/
│   │   ├── ui/           # U-DESIGN
│   │   │   └── U-DESIGN-001.md
│   │   └── tech/         # T-DESIGN
│   │       └── T-DESIGN-001.md
│   ├── deployment/       # DEPL
│   │   └── DEPL-001.md
│   ├── doc/              # DOC
│   │   └── DOC-001.md
│   ├── research/         # USER-RES
│   │   └── USER-RES-001.md
│   ├── analysis/         # DATA-ANALYSIS
│   │   └── DATA-ANALYSIS-001.md
│   └── compliance/       # COMPLIANCE
│       └── COMPLIANCE-001.md
├── epics/
│   └── EPIC-001.md
├── templates/            # 模板文件
│   ├── feature-ticket.md
│   ├── task-ticket.md
│   ├── bugfix-ticket.md
│   ├── test-ticket.md
│   ├── prd-ticket.md
│   ├── ui-design-ticket.md
│   ├── tech-design-ticket.md
│   ├── deployment-ticket.md
│   ├── doc-ticket.md
│   ├── user-research-ticket.md
│   ├── data-analysis-ticket.md
│   └── compliance-review-ticket.md
└── index/                # 索引
    ├── by-feature/
    ├── by-status/
    └── by-assignee/
```

---

## 使用示例

### 创建 Feature Ticket

```markdown
# Feature Ticket: FEAT-001 - 用户登录功能

**创建时间**: 2026-03-28T10:30:00+08:00
**创建者**: Master Agent
**重要性**: high
**优先级**: P1
**状态**: backlog
**标签**: `feature`, `auth`, `frontend`
**Epic**: EPIC-001
**分配给**: null

---

## 0. 任务元数据

### 0.3 依赖关系
```yaml
blocks: []
blocked_by:
  - PRD-001
  - T-DESIGN-001
related:
  - U-DESIGN-001
external: []
```

### 0.5 技能要求
react, typescript, jwt

### 0.6 预估工时
4h
```

### 创建 Bugfix Ticket

```markdown
# Bugfix Ticket: FIX-001 - 登录页面在 Safari 下样式错乱

**创建时间**: 2026-03-28T14:00:00+08:00
**创建者**: Master Agent
**优先级**: P1
**状态**: backlog
**标签**: `bug`, `frontend`, `safari`
**关联 Feature**: FEAT-001
```

### 创建文档卡

```markdown
# Documentation Ticket: DOC-001 - API 文档编写

**创建时间**: 2026-03-28T15:00:00+08:00
**创建者**: Master Agent
**优先级**: P2
**状态**: backlog
**标签**: `documentation`, `api`
**关联 Feature**: FEAT-001
```

### 创建用户调研卡

```markdown
# User Research Ticket: USER-RES-001 - 用户登录流程调研

**创建时间**: 2026-03-28T16:00:00+08:00
**创建者**: Master Agent
**优先级**: P1
**状态**: backlog
**标签**: `research`, `user`, `auth`
**关联 PRD**: PRD-001
```

### 创建数据分析卡

```markdown
# Data Analysis Ticket: DATA-ANALYSIS-001 - 用户留存率分析

**创建时间**: 2026-03-28T17:00:00+08:00
**创建者**: Master Agent
**优先级**: P1
**状态**: backlog
**标签**: `data`, `analysis`, `retention`
```

### 创建合规审查卡

```markdown
# Compliance Review Ticket: COMPLIANCE-001 - GDPR 合规审查

**创建时间**: 2026-03-28T18:00:00+08:00
**创建者**: Master Agent
**优先级**: P0
**状态**: backlog
**标签**: `compliance`, `legal`, `gdpr`
**关联 Feature**: FEAT-001
```

---

## 相关文档

- [Ticket 编号管理规范](./TICKET-NUMBERING.md) - 完整编号规则和管理规范
- [Jira Ticket 模板使用规范](./templates/README.md) - 模板使用说明

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-28
