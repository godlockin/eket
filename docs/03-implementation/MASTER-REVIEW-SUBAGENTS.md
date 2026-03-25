# Master Review Subagent 机制

**版本**: v0.9.0
**创建日期**: 2026-03-25
**状态**: 已实现

---

## 概述

Master 节点在进行 Review 时，可以初始化多个**共享记忆的 Subagents**，每个 Subagent 负责不同维度的审查，最后由 Master 汇总结果并做出决策。

---

## 架构设计

```
                    Master Node
                       │
                       │ Review 请求
                       ▼
         ┌─────────────────────────┐
         │  Review Coordinator     │
         │  (共享记忆协调器)        │
         └───────────┬─────────────┘
                     │
         ┌───────────┼───────────┬───────────┐
         │           │           │           │
         ▼           ▼           ▼           ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Code     │ │ Test     │ │ Security │ │ Doc      │
   │ Reviewer │ │ Reviewer │ │ Reviewer │ │ Reviewer │
   │ Subagent │ │ Subagent │ │ Subagent │ │ Subagent │
   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
        │            │            │            │
        │ 独立审查    │ 独立审查    │ 独立审查    │ 独立审查
        │ 共享记忆    │ 共享记忆    │ 共享记忆    │ 共享记忆
        ▼            ▼            ▼            ▼
   ┌─────────────────────────────────────────────────┐
   │           Shared Memory Store                    │
   │  (所有 Subagent 共享的审查状态和结果)              │
   └─────────────────────────────────────────────────┘
                       │
                       ▼
              Master 汇总决策
```

---

## Subagent 角色和职责

| Subagent | 职责 | 权重 | 审查重点 |
|----------|------|------|----------|
| **Code Reviewer** | 代码审查员 | 40% | 代码质量、编码规范、结构合理性 |
| **Test Reviewer** | 测试审查员 | 25% | 测试覆盖、边界情况、测试质量 |
| **Security Reviewer** | 安全审查员 | 25% | 安全漏洞、权限控制、输入验证 |
| **Doc Reviewer** | 文档审查员 | 10% | 文档完整性、注释、API 文档 |

---

## 审查流程

### 阶段 1: Subagent 初始化

```bash
./scripts/init-review-subagents.sh <ticket-id> [master-id]
```

**执行内容**:
1. 创建共享记忆目录 `.eket/state/shared-memory/reviews/{ticket-id}/`
2. 为每个 Subagent 创建状态文件和审查清单
3. 创建 Review 协调器状态文件
4. 生成 Review 报告模板
5. 更新 Ticket 状态为 `review`

**输出目录结构**:
```
.eket/state/shared-memory/reviews/FEAT-001/
├── coordinator.yml          # Review 协调器状态
├── review-report.md         # Review 报告
├── code_reviewer/           # 代码审查员
│   ├── status.yml           # 状态文件
│   ├── checklist.md         # 审查清单
│   └── review-result.yml    # 审查结果 (审查后生成)
├── test_reviewer/           # 测试审查员
├── security_reviewer/       # 安全审查员
└── doc_reviewer/            # 文档审查员
```

---

### 阶段 2: Subagent 独立审查

```bash
./scripts/run-subagent-review.sh <ticket-id> <subagent-role>
```

**执行内容**:
1. 加载审查清单
2. 逐项检查并记录结果
3. 输入评分、意见、问题、建议
4. 保存审查结果到共享记忆
5. 更新状态为 `complete`

**审查结果格式**:
```yaml
score: 8
status: complete
completed_at: 2026-03-25T10:30:00Z
comments:
  - "代码结构清晰"
  - "遵循编码规范"
issues:
  - "P2: 部分函数缺少注释"
recommendations:
  - "补充关键函数的文档注释"
```

---

### 阶段 3: 汇总审查结果

```bash
./scripts/finalize-review.sh <ticket-id>
```

**执行内容**:
1. 收集所有 Subagent 的审查结果
2. 计算加权总分
3. 确定审查结果 (approved/changes_requested/rejected)
4. 生成最终 Review 报告
5. 更新 Ticket 状态

**评分计算**:
```
总分 = Σ(各维度评分 × 权重)

示例:
- 代码质量：8/10 × 40% = 3.2
- 测试质量：9/10 × 25% = 2.25
- 安全性：7/10 × 25% = 1.75
- 文档质量：8/10 × 10% = 0.8
- **总分**: 8.0/10
```

**审查决策**:
| 总分 | 结果 | 决策 |
|------|------|------|
| ≥ 8.0 | approved | 批准 - 可以合并 |
| 6.0-7.9 | conditional_approved | 有条件批准 - Minor 问题 |
| 4.0-5.9 | changes_requested | 需要修改 - Major 问题 |
| < 4.0 | rejected | 拒绝 - 重新设计 |

---

## 完整流程（一键执行）

```bash
# 完整流程：初始化 → 审查 → 汇总
./scripts/init-review-subagents.sh FEAT-001
# ... 各 Subagent 独立审查 ...
./scripts/finalize-review.sh FEAT-001
```

或使用集成命令：
```bash
/eket-master-review full FEAT-001
```

---

## Ticket 模板升级 (v0.9.0)

### 新增元信息区域（文件开头）

```markdown
<!--
================================================================================
  元信息区域 - 放在文件开头，便于快速查看和解析
================================================================================
-->

**Ticket ID**: {{TICKET_ID}}
**标题**: {{TITLE}}
**类型**: {{TYPE}}
**优先级**: {{PRIORITY}}

**状态**: {{STATUS}}
**创建时间**: {{CREATED_AT}}
**最后更新**: {{UPDATED_AT}}

**负责人**: {{ASSIGEE}}
**执行 Agent**: {{SLAVER_NAME}}
**所属 Epic**: {{EPIC_ID}}
```

### 新增 Review 记录章节

```markdown
## 7. Review 记录 (v0.9.0+)

### 7.1 Master Review 初始化

**Review 发起时间**: {{REVIEW_STARTED_AT}}
**Review Master**: {{MASTER_ID}}
**共享记忆 Subagents**:

| Subagent ID | 角色 | 职责 | 状态 |
|-------------|------|------|------|
| {{SUBAGENT_1_ID}} | 代码审查员 | 代码质量、规范检查 | initialized / analyzing / complete |

### 7.2 Subagent 审查意见

#### 代码审查员
- **状态**: {{CODE_REVIEW_STATUS}}
- **意见**: {{CODE_REVIEW_COMMENTS}}
- **评分**: {{CODE_REVIEW_SCORE}} / 10
```

---

## 命令参考

### /eket-master-review

```bash
# 初始化 Subagents
/eket-master-review init FEAT-001

# 查看审查状态
/eket-master-review status FEAT-001

# 汇总审查结果
/eket-master-review finalize FEAT-001

# 完整流程
/eket-master-review full FEAT-001
```

### 脚本工具

```bash
# 初始化 Subagents
./scripts/init-review-subagents.sh FEAT-001

# 执行单个 Subagent 审查
./scripts/run-subagent-review.sh FEAT-001 code_reviewer
./scripts/run-subagent-review.sh FEAT-001 test_reviewer
./scripts/run-subagent-review.sh FEAT-001 security_reviewer
./scripts/run-subagent-review.sh FEAT-001 doc_reviewer

# 汇总审查结果
./scripts/finalize-review.sh FEAT-001
```

---

## 共享记忆设计

### 共享记忆结构

```yaml
# .eket/state/shared-memory/reviews/{ticket-id}/coordinator.yml

review_id: review-FEAT-001-20260325
ticket_id: FEAT-001
master_id: master-001

status:
  overall: completed
  started_at: 2026-03-25T10:00:00Z
  completed_at: 2026-03-25T11:00:00Z

subagents:
  - id: code_reviewer-FEAT-001
    role: code_reviewer
    status: complete
    score: 8

summary:
  all_passed: true
  total_score: 8.0
  result: approved
  decision: "批准 - 代码质量优秀，可以合并"

shared_memory:
  sync_count: 4
  last_sync: 2026-03-25T11:00:00Z
```

### 同步机制

- 每个 Subagent 审查完成后自动同步到共享记忆
- 协调器定期（30 秒）检查同步状态
- Master 在汇总时读取最新共享记忆状态

---

## 优势

### 1. 专业化审查
每个 Subagent 专注一个维度，审查更深入

### 2. 并行处理
多个 Subagent 可以同时独立审查

### 3. 共享记忆
所有审查结果集中存储，便于追溯和审计

### 4. 可配置权重
根据项目特点调整各维度权重

### 5. 可扩展
可以轻松添加新的 Subagent 角色

---

## 最佳实践

### 1. 审查前准备
- 确保 Ticket 状态为 `review`
- 确保所有相关文件已提交

### 2. Subagent 审查
- 每个 Subagent 由不同 Agent 执行
- 或同一个 Agent 分多次执行，避免偏见

### 3. 评分标准
- 保持评分标准一致
- 记录具体问题和建议

### 4. 结果汇总
- Master 最终决策前，Review 所有 Subagent 意见
- 对于分歧较大的维度，组织讨论

---

## 相关文件

- [Ticket 模板](../template/jira/ticket-template.md)
- [初始化脚本](../scripts/init-review-subagents.sh)
- [审查执行脚本](../scripts/run-subagent-review.sh)
- [汇总脚本](../scripts/finalize-review.sh)
- [Master Review 命令](../template/.claude/commands/eket-master-review.sh)

---

**维护者**: EKET Framework Team
**最后更新**: 2026-03-25
