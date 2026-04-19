# 功能开发任务 SOP

**版本**: 1.0.0
**最后更新**: 2026-03-23
**适用任务类型**: Feature

---

## 概述

功能开发任务是最常见的任务类型，用于开发新的功能模块。

### 任务特点

| 特点 | 说明 |
|------|------|
| **复杂度** | 中 - 高 |
| **预估工时** | 4-8 小时 |
| **参与智能体** | 前端开发/后端开发 |
| **产出物** | 功能代码、单元测试、文档 |

---

## 流程概览

```
任务认领 → 任务分析 → 创建分支 → 功能实现 → 测试验证 → PR 提交 → Review → 合并
```

---

## 详细步骤

### 1. 任务认领

**命令**:
```bash
/eket-claim FEAT-XXX
```

**检查项**:
- [ ] 任务状态为 `ready` 或 `backlog`
- [ ] 无阻塞依赖
- [ ] 任务标签与角色匹配
- [ ] 验收标准清晰

**输出**:
- 任务状态：`in_progress`
- 计时器启动
- Checkpoint: `task_start`

---

### 2. 任务分析

**输入**: Jira ticket、Confluence 文档

**步骤**:
1. 阅读任务描述和验收标准
2. 阅读相关架构文档和 API 设计
3. 识别技术要点和潜在风险
4. 制定实现计划

**分析记录模板**:
```markdown
# 任务分析：FEAT-XXX

## 功能描述

{功能简述}

## 验收标准

1. {验收标准 1}
2. {验收标准 2}

## 技术要点

- {技术点 1}
- {技术点 2}

## 潜在风险

- {风险 1}
- {风险 2}

## 实现计划

1. {步骤 1}
2. {步骤 2}
3. {步骤 3}
```

---

### 3. 创建分支和 Worktree

**命令**:
```bash
# 创建 worktree
git worktree add .eket/worktrees/{slaver_name}-{ticket_id} \
  -b feature/{slaver_name}-{ticket_id}-{short_desc}

# 进入 worktree
cd .eket/worktrees/{slaver_name}-{ticket_id}
```

**分支命名规范**:
```bash
feature/{slaver_name}-{ticket_id}-{short_desc}
# 示例：
feature/slave-004-FEAT-001-user-auth
```

**检查项**:
- [ ] 分支命名符合规范
- [ ] worktree 路径正确
- [ ] 基于最新 main 分支

---

### 4. 功能实现

**步骤**:
1. 按照实现计划编写代码
2. 遵循编码规范
3. 编写单元测试
4. 定期提交代码

**提交规范**:
```bash
# Conventional Commits
<type>(<scope>): <description>

# 示例：
feat(auth): add user registration endpoint
fix(auth): handle duplicate email error
test(auth): add unit tests for registration
```

**心跳更新**（每 30 分钟）:
```bash
./scripts/task-time-tracker.sh heartbeat FEAT-XXX slave-004 "完成用户注册表单开发"
```

---

### 5. 测试验证

**命令**:
```bash
# 运行单元测试
./tests/run-unit-tests.sh --ticket FEAT-XXX

# 运行 Lint
npm run lint  # 或对应的 lint 命令

# 检查覆盖率
npm run test:coverage
```

**通过标准**:
- [ ] 所有测试通过
- [ ] 无 Lint 错误
- [ ] 覆盖率 > 80%

---

### 6. PR 提交

**命令**:
```bash
# 提交代码
git add .
git commit -m "feat: implement {feature_name}"
git push origin feature/{slaver_name}-{ticket_id}-{short_desc}

# 创建 PR（到 testing 分支）
# 在 GitHub/GitLab 上创建 PR
```

**PR 描述模板**:
```markdown
## 关联任务

FEAT-XXX

## 变更内容

- 实现 {功能 1}
- 实现 {功能 2}

## 验收标准

- [ ] {验收标准 1}
- [ ] {验收标准 2}

## 测试

- [ ] 单元测试通过
- [ ] 手动测试完成

## 截图（如适用）

{截图}
```

---

### 7. Review 反馈处理

**接收 Review 意见**:
1. 阅读 Review 意见
2. 分类问题（Major/Minor）
3. 逐个修复问题
4. 提交修复代码

**修复记录模板**:
```markdown
# Review 修复记录：FEAT-XXX

| 问题 | 修复方式 | 状态 |
|------|---------|------|
| 问题 1 | 修复描述 | ✓ |
| 问题 2 | 修复描述 | ✓ |
```

---

### 8. 合并和任务完成

**合并后操作**:
1. 验证合并结果
2. 删除 feature 分支
3. 更新任务状态为 `done`
4. 创建 Checkpoint: `task_complete`

**任务完成记录**:
```markdown
# 任务完成报告：FEAT-XXX

**完成时间**: {timestamp}
**实际工时**: {X} 小时

## 完成的功能

- [ ] {功能 1}
- [ ] {功能 2}

## 经验教训

{记录经验教训}

## 后续任务

- {后续任务 1}
- {后续任务 2}
```

---

## 质量检查清单

### 代码质量

- [ ] 遵循编码规范
- [ ] 无 Lint 错误
- [ ] 代码可读性好
- [ ] 无重复代码
- [ ] 函数职责单一

### 测试质量

- [ ] 单元测试覆盖核心逻辑
- [ ] 测试通过
- [ ] 覆盖率 > 80%
- [ ] 边界情况已测试

### 文档质量

- [ ] 代码注释清晰
- [ ] PR 描述完整
- [ ] 变更已记录

---

## 常见问题

### Q1: 任务复杂度过高怎么办？

**A**: 创建子任务拆解：
```bash
# 创建子任务
FEAT-XXX-1: {子任务 1}
FEAT-XXX-2: {子任务 2}
```

### Q2: 发现依赖缺失怎么办？

**A**: 创建依赖澄清任务：
```bash
# 创建依赖任务
DEP-XXX: {依赖描述}
```

### Q3: Review 不通过怎么办？

**A**: 根据 Review 意见修复，重新提交：
1. 阅读 Review 意见
2. 修复问题
3. 重新提交
4. 请求再次 Review

---

## 相关文件

- [Phase 2 SOP](../phase-2-development/README.md)
- [任务认领 SOP](step-1-task-claim.md)
- [代码审查清单](../../05-reference/CODE_REVIEW_CHECKLIST.md)

---

**SOP 版本**: 1.0.0
**创建日期**: 2026-03-23
**维护者**: EKET Framework Team
