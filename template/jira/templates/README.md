# Jira Ticket 模板使用规范

**版本**: v2.0.0
**更新时间**: 2026-04-06

---

## 1. 概述

本规范定义了 EKET 框架中 Master 和 Slaver 角色在 ticket 处理流程中的职责和状态流转规则。

### 核心原则

1. **状态必须更新**: 每个 ticket 的状态变更必须记录在案
2. **流程不可跳过**: Slaver 领取任务后必须按顺序执行各阶段
3. **信息透明**: Master 和 Slaver 通过 ticket 进行信息传递
4. **禁止私自结束**: Slaver 不可自行标记任务完成，必须经过 Review

---

## 2. Ticket 模板列表

### 2.1 Ticket 编号规则

| Ticket 类型 | 编号前缀 | 编号格式 | 示例 |
|------------|---------|---------|------|
| 功能需求卡 | `FEAT` | `FEAT-{{SEQ}}` | `FEAT-001` |
| 任务卡 | `TASK` | `TASK-{{SEQ}}` | `TASK-001` |
| 缺陷修复卡 | `FIX` | `FIX-{{SEQ}}` | `FIX-001` |
| 测试卡 | `TEST` | `TEST-{{SEQ}}` | `TEST-001` |
| 产品需求卡 | `PRD` | `PRD-{{SEQ}}` | `PRD-001` |
| UI/UX设计卡 | `U-DESIGN` | `U-DESIGN-{{SEQ}}` | `U-DESIGN-001` |
| 技术设计卡 | `T-DESIGN` | `T-DESIGN-{{SEQ}}` | `T-DESIGN-001` |
| 部署卡 | `DEPL` | `DEPL-{{SEQ}}` | `DEPL-001` |
| 文档卡 | `DOC` | `DOC-{{SEQ}}` | `DOC-001` |
| 用户调研卡 | `USER-RES` | `USER-RES-{{SEQ}}` | `USER-RES-001` |
| 数据分析卡 | `DATA-ANALYSIS` | `DATA-ANALYSIS-{{SEQ}}` | `DATA-ANALYSIS-001` |
| 合规审查卡 | `COMPLIANCE` | `COMPLIANCE-{{SEQ}}` | `COMPLIANCE-001` |

### 2.2 模板列表

| 模板 | 编号前缀 | 用途 | 位置 |
|------|---------|------|------|
| [Feature Ticket](./feature-ticket.md) | `FEAT` | 功能开发任务 | `jira/templates/feature-ticket.md` |
| [Task Ticket](./task-ticket.md) | `TASK` | 一般任务（文档/重构等） | `jira/templates/task-ticket.md` |
| [Bugfix Ticket](./bugfix-ticket.md) | `FIX` | 缺陷修复任务 | `jira/templates/bugfix-ticket.md` |
| [Test Ticket](./test-ticket.md) | `TEST` | 测试任务 | `jira/templates/test-ticket.md` |
| [PRD Ticket](./prd-ticket.md) | `PRD` | 产品需求文档 | `jira/templates/prd-ticket.md` |
| [UI/UX Design Ticket](./ui-design-ticket.md) | `U-DESIGN` | UI/UX 设计任务 | `jira/templates/ui-design-ticket.md` |
| [Technical Design Ticket](./tech-design-ticket.md) | `T-DESIGN` | 技术设计任务 | `jira/templates/tech-design-ticket.md` |
| [Deployment Ticket](./deployment-ticket.md) | `DEPL` | 部署任务 | `jira/templates/deployment-ticket.md` |
| [Documentation Ticket](./doc-ticket.md) | `DOC` | 文档编写任务 | `jira/templates/doc-ticket.md` |
| [User Research Ticket](./user-research-ticket.md) | `USER-RES` | 用户调研任务 | `jira/templates/user-research-ticket.md` |
| [Data Analysis Ticket](./data-analysis-ticket.md) | `DATA-ANALYSIS` | 数据分析任务 | `jira/templates/data-analysis-ticket.md` |
| [Compliance Review Ticket](./compliance-review-ticket.md) | `COMPLIANCE` | 合规审查任务 | `jira/templates/compliance-review-ticket.md` |
| [PR Review Checklist](./pr-review-checklist.md) | - | Review 检查清单 | `jira/templates/pr-review-checklist.md` |

---

## 3. 状态流转图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Feature Ticket 状态流                              │
│                                                                          │
│  backlog → analysis → approved → design → ready → in_progress           │
│                                                        │                 │
│                                                        ▼                 │
│  ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←│                 │
│                                    │                   │                 │
│                                    ▼                   │                 │
│  done ←←←←←←←←←←←←← review ←←←← testing ←← design_review                │
│   │                                              │                       │
│   └────────────── 需要修改 ──────────────────────┘                       │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                        Task/Bugfix Ticket 状态流                          │
│                                                                          │
│  backlog → ready → in_progress → documentation → testing → review       │
│                   ↑                                      │               │
│                   └──────────── 需要修改 ────────────────┘               │
│                                                  │                       │
│                                                  ▼                       │
│  done ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 角色职责

### 4.1 Master 职责

| 阶段 | 职责 | 输出 |
|------|------|------|
| **创建** | 填写需求概述、验收标准 | Ticket 初始内容 |
| **分析** | 需求分析、技术设计 | 技术方案、API 设计 |
| **Review** | 代码审查、质量把关 | Review 意见、批准/修改决定 |
| **状态更新** | Review 通过后更新为 `done` | 最终状态记录 |

### 4.2 Slaver 职责（重要）

> ⚠️ **Slaver 领取任务后必须执行以下流程，不可跳过任何步骤！**

| 步骤 | 动作 | 状态变更 | 检查项 |
|------|------|----------|--------|
| **1. 领取** | 填写领取信息 | `ready` → `in_progress` | [ ] 状态已更新 |
| **2. 设计/文档** | 补充详细设计或文档 | `in_progress` → `design_review` / `documentation` | [ ] 文档已更新 |
| **3. 测试** | 编写测试（代码修改必需） | `design_review` / `documentation` → `testing` | [ ] 测试已编写 |
| **4. 提交** | 创建 PR | `testing` / `documentation` → `review` | [ ] PR 已创建 |
| **5. 等待** | 等待 Master Review | `review` | ⚠️ **不可自行标记完成** |

> ⚠️ **禁止行为**:
> - 不更新状态直接开始工作
> - 跳过文档/测试阶段
> - 自行将任务标记为完成
> - 提交 PR 后不更新状态

---

## 5. Ticket 字段说明

### 5.1 必需字段（所有 ticket）

| 字段 | 填写时机 | 填写者 | 说明 |
|------|----------|--------|------|
| **状态流转记录** | 每次状态变更时 | 当前操作者 | 记录时间、状态变更、操作者、备注 |
| **领取信息** | 领取任务时 | Slaver | 领取者 ID、时间、预计工时 |
| **执行状态表** | 执行过程中 | Slaver | 各阶段完成情况和时间 |

### 5.2 Feature Ticket 特有字段

| 字段 | 填写时机 | 填写者 |
|------|----------|--------|
| 需求概述、验收标准 | 创建时 | Master |
| 技术设计、API 变更 | 设计阶段 | Master |
| 实现细节、遇到问题 | 执行阶段 | Slaver |
| Review 记录 | Review 阶段 | Master |

### 5.3 Bugfix Ticket 特有字段

| 字段 | 填写时机 | 填写者 |
|------|----------|--------|
| Bug 描述、复现步骤 | 创建时 | Master/Slaver |
| 根因分析、修复方案 | 分析阶段 | Master |
| 修复实施、验证结果 | 执行阶段 | Slaver |
| 根本原因、预防措施 | 完成后 | Slaver |

---

## 6. 使用示例

### 6.1 Slaver 领取任务流程

```markdown
# 1. 找到状态为 `ready` 的 ticket
# 2. 在"状态流转记录"表中添加一行：
| 2026-03-26 10:30 | ready → in_progress | agent_frontend_dev_001 | Slaver 领取 |

# 3. 在"领取信息"中填写：
- **领取者**: agent_frontend_dev_001
- **领取时间**: 2026-03-26 10:30
- **预计工时**: 4h
- **状态已更新**: [x] 是

# 4. 勾选"必需执行流程"中的检查项
```

### 6.2 提交 Review 流程

```markdown
# 1. 确保所有检查项已勾选
# 2. 在"状态流转记录"表中添加：
| 2026-03-26 15:30 | testing → review | agent_frontend_dev_001 | PR #42 已提交 |

# 3. 填写 PR 信息：
- **Git 分支**: feature/FEAT-123-user-auth
- **PR 编号**: #42
- **PR 链接**: https://github.com/.../pull/42
```

### 6.3 Master Review 流程

```markdown
# 1. 打开 PR Review Checklist
# 2. 逐项检查并填写意见
# 3. 在"状态流转记录"表中添加：
| 2026-03-26 16:00 | review → done | agent_tech_manager | Review 通过 |

# 4. 勾选 Review 结果：
- [x] **批准合并** - 代码质量良好，状态已更新为 done
```

---

## 7. 自动化建议

### 7.1 推荐的自动化检查

| 检查项 | 触发时机 | 检查内容 |
|--------|----------|----------|
| 状态完整性 | ticket 创建时 | 确保状态流转记录表存在 |
| 领取检查 | 状态变为 `in_progress` | 确保领取信息已填写 |
| 流程完整性 | 状态变为 `review` | 确保所有中间状态已流经 |
| Review 强制 | 状态变为 `done` | 确保经过 `review` 状态 |

### 7.2 Git Hook 建议

```bash
# commit-msg hook 示例
# 检查提交信息是否包含 ticket ID
if ! grep -q "^\[FEAT-[0-9]*\]" "$1"; then
    echo "Error: Commit message must include ticket ID like [FEAT-123]"
    exit 1
fi
```

---

## 8. 常见问题

### Q1: Slaver 可以跳过测试阶段吗？
**A**: 不可以。涉及代码修改的任务**必须**编写测试。只有纯文档任务可以标记测试为 N/A。

### Q2: 如果 Master 长时间不 Review 怎么办？
**A**: Slaver 应在 `inbox/human_feedback/` 中创建提醒文件，或通过其他渠道通知 Master。

### Q3: 状态更新错了可以回滚吗？
**A**: 可以。在状态流转记录中添加一行修正记录，说明原因即可。

### Q4: 可以同时领取多个任务吗？
**A**: 不建议。应专注完成一个任务后再领取下一个，除非任务优先级明确允许并行。

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-26
