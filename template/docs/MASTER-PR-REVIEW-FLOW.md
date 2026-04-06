# Master PR Review 流程规范

**版本**: v2.0.0
**最后更新**: 2026-04-06

---

## 1. 概述

Master PR Review 是 EKET 框架中保证代码质量的关键环节。Master 实例在收到 Slaver 提交的 PR 请求后，执行多维度的代码审查。

---

## 2. PR Review 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    Master PR Review 流程                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 接收请求 → 监听 message_queue/inbox/pr_review_request       │
│       ↓                                                         │
│  2. 加载 Skills → review/* 相关技能                              │
│       ↓                                                         │
│  3. 初步检查 → PR 格式、Ticket 关联、分支状态                      │
│       ↓                                                         │
│  4. 代码审查 → 6 维度审查（代码/功能/安全/性能/文档/Git）        │
│       ↓                                                         │
│  5. 测试验证 → 运行单元测试、集成测试                            │
│       ↓                                                         │
│  6. 生成报告 → 创建 PR Review 报告                                │
│       ↓                                                         │
│  7. 决策通知 → Approved | Changes Requested | Commented         │
│       ↓                                                         │
│  8. 后续处理 → 合并代码或等待重新提交                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. 各阶段详细说明

### 3.1 阶段 1: 接收 PR 请求

**触发条件**: 检测到 `pr_review_request` 类型消息

**消息格式**:
```json
{
  "id": "msg_20260327_103000",
  "timestamp": "2026-03-27T10:30:00+08:00",
  "from": "slaver_frontend_dev_103000",
  "to": "master",
  "type": "pr_review_request",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-001",
    "branch": "feature/FEAT-001-user-login",
    "target": "testing",
    "pr_file": "outbox/review_requests/pr_FEAT-001_20260327_103000.md",
    "summary": "请求审核 FEAT-001 的实现"
  }
}
```

**检查项**:
- [ ] 消息格式正确
- [ ] PR 文件存在
- [ ] Ticket ID 有效
- [ ] 分支名称符合规范

---

### 3.2 阶段 2: 加载 Review Skills

**加载的 Skills**:
```yaml
skills:
  # 核心 Review 技能
  - review/code_quality_review      # 代码质量审查
  - review/security_review          # 安全审查
  - review/performance_review       # 性能审查
  - review/test_coverage_review     # 测试覆盖审查
  - review/documentation_review     # 文档审查
  - review/architecture_compliance  # 架构合规审查

  # 辅助技能
  - review/git_best_practices       # Git 最佳实践
  - review/domain_knowledge         # 领域知识检查
```

**Skill 调用顺序**:
```
1. code_quality_review    → 基础代码质量
2. security_review        → 安全检查
3. performance_review     → 性能分析
4. test_coverage_review   → 测试验证
5. documentation_review   → 文档完整性
6. architecture_compliance → 架构对齐
```

---

### 3.3 阶段 3: 初步检查

**检查清单**:

| 检查项 | 说明 | 失败处理 |
|--------|------|----------|
| PR 描述完整 | 包含变更摘要、验收标准、测试情况 | 要求补充 |
| Ticket 关联 | PR 关联有效的 Ticket | 要求关联 |
| 分支命名 | 符合 `feature/{id}-{desc}` 规范 | 要求修正 |
| 提交历史 | 提交信息符合 Conventional Commits | 要求修正 |
| 变更范围 | 变更在 Ticket 范围内 | 超出范围则拒绝 |

**检查命令**:
```bash
# 检查 PR 文件
cat outbox/review_requests/pr_${TICKET_ID}_*.md

# 检查分支
git branch -a | grep feature/${TICKET_ID}

# 检查提交历史
git log --oneline origin/main..feature/${TICKET_ID}
```

---

### 3.4 阶段 4: 六维度代码审查

#### 维度 1: 代码质量 (Code Quality)

**审查要点**:
```yaml
code_quality:
  - 命名规范：变量/函数/类命名清晰有意义
  - 代码风格：遵循项目 lint 规则
  - 职责单一：函数/类职责聚焦
  - 代码复用：避免重复代码
  - 复杂度控制：圈复杂度 < 10
  - 错误处理：适当的 try-catch 和错误传播
```

**检查命令**:
```bash
# ESLint 检查 (JavaScript/TypeScript)
npm run lint

# Pylint 检查 (Python)
pylint src/

# 圈复杂度分析
lizard src/
```

---

#### 维度 2: 功能正确性 (Functional Correctness)

**审查要点**:
```yaml
functional_correctness:
  - 需求对齐：实现与 ticket 描述一致
  - 验收标准：所有验收标准已满足
  - 业务逻辑：业务规则正确实现
  - 边界条件：边界值处理正确
  - 数据一致性：事务/锁使用正确
```

**检查方法**:
```bash
# 对比 ticket 验收标准
grep -A 10 "验收标准" jira/tickets/feature/${TICKET_ID}.md

# 运行功能测试
npm run test:e2e -- --grep "${TICKET_ID}"
```

---

#### 维度 3: 安全性 (Security)

**审查要点**:
```yaml
security:
  - 输入验证：所有用户输入已验证/过滤
  - SQL 注入：使用参数化查询
  - XSS 防护：输出编码正确
  - 认证授权：登录/权限检查完整
  - 敏感数据：密码/密钥加密存储
  - 日志安全：无敏感信息泄露
```

**安全检查命令**:
```bash
# 依赖漏洞扫描
npm audit
# 或
safety check

# 静态安全分析
# JavaScript
npm run security-scan
# Python
bandit -r src/
```

---

#### 维度 4: 性能 (Performance)

**审查要点**:
```yaml
performance:
  - 算法复杂度：无明显的 O(n²) 或更差
  - 数据库查询：索引使用合理，无 N+1 查询
  - 缓存使用：热点数据有缓存
  - 资源管理：连接/句柄正确关闭
  - 内存管理：无内存泄漏风险
```

**性能分析命令**:
```bash
# 数据库查询分析
EXPLAIN ANALYZE <query>

# 性能测试
npm run test:perf

# 内存分析 (Node.js)
node --inspect --expose-gc app.js
```

---

#### 维度 5: 测试覆盖 (Test Coverage)

**审查要点**:
```yaml
test_coverage:
  - 单元测试：核心逻辑有单元测试
  - 集成测试：关键流程有集成测试
  - 覆盖率：新增代码覆盖率 ≥ 80%
  - 测试质量：测试断言明确有效
  - 边界测试：边界条件有测试覆盖
```

**测试命令**:
```bash
# 运行单元测试
npm run test

# 生成覆盖率报告
npm run test:coverage

# 检查覆盖率阈值
# 期望：Lines: 80%, Functions: 80%, Branches: 70%
```

---

#### 维度 6: 文档 (Documentation)

**审查要点**:
```yaml
documentation:
  - 代码注释：复杂逻辑有清晰注释
  - API 文档：新增/修改的 API 已文档化
  - README 更新：使用方式变更已更新
  - 变更日志：CHANGELOG.md 已更新
  - 类型定义：TypeScript 类型完整
```

---

### 3.5 阶段 5: 测试验证

**自动化测试流程**:
```bash
# 1. 单元测试
npm run test:unit

# 2. 集成测试
npm run test:integration

# 3. E2E 测试 (如需要)
npm run test:e2e

# 4. 构建验证
npm run build
```

**测试通过标准**:
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 构建成功
- [ ] 覆盖率达标

---

### 3.6 阶段 6: 生成 Review 报告

**PR Review 报告格式**:

```markdown
# PR Review 报告：{{TICKET_ID}}

**Reviewer**: Master Agent
**Review 时间**: $(date -Iseconds)
**PR**: feature/{{TICKET_ID}}-{{description}} → testing

---

## 审查总览

| 维度 | 状态 | 评分 | 备注 |
|------|------|------|------|
| 代码质量 | ✓/✗ | /10 | - |
| 功能正确性 | ✓/✗ | /10 | - |
| 安全性 | ✓/✗ | /10 | - |
| 性能 | ✓/✗ | /10 | - |
| 测试覆盖 | ✓/✗ | /10 | - |
| 文档 | ✓/✗ | /10 | - |

**总体评分**: __/60

---

## 详细审查意见

### 1. 代码质量

**优点**:
- ${优点 1}
- ${优点 2}

**需要改进**:
- [ ] ${改进建议 1}
- [ ] ${改进建议 2}

### 2. 功能正确性

**验收标准核对**:
- [ ] 验收标准 1：已满足/未满足
- [ ] 验收标准 2：已满足/未满足

**问题**:
- ${问题描述}

### 3. 安全性

**发现**:
- ${安全问题或确认}

### 4. 性能

**评估**:
- ${性能评估}

### 5. 测试覆盖

**覆盖率报告**:
```
Lines: __%
Functions: __%
Branches: __%
```

**问题**:
- ${测试相关问题}

### 6. 文档

**检查**:
- [ ] 代码注释完整
- [ ] API 文档已更新
- [ ] README 已更新

---

## Review 决定

### 决定类型

- [ ] **Approved** (批准合并)
  - 代码质量良好
  - 所有测试通过
  - 无安全问题
  - 文档完整

- [ ] **Changes Requested** (需要修改)
  - 必须修改项：
    1. ${必须修改 1}
    2. ${必须修改 2}
  - 建议修改项：
    1. ${建议修改 1}

- [ ] **Commented** (有建议但不阻塞)
  - 建议：
    1. ${建议 1}
    2. ${建议 2}

### 修改意见详情

${详细的修改意见和建议}

---

## 下一步行动

### Slaver 需要:
- [ ] ${行动 1}
- [ ] ${行动 2}

### Master 将:
- [ ] 等待重新提交 / 执行合并

---

**Review 完成时间**: $(date -Iseconds)
```

---

### 3.7 阶段 7: 决策通知

**发送消息**:

```json
{
  "id": "msg_20260327_110000",
  "timestamp": "2026-03-27T11:00:00+08:00",
  "from": "master",
  "to": "slaver_frontend_dev_103000",
  "type": "pr_approved",
  "priority": "normal",
  "payload": {
    "ticket_id": "FEAT-001",
    "pr_file": "outbox/review_requests/pr_FEAT-001_20260327_103000.md",
    "review_file": "outbox/review_requests/pr_FEAT-001_review.md",
    "decision": "approved",
    "message": "PR 已批准，即将合并到 testing 分支",
    "next_step": "等待自动合并或手动合并"
  }
}
```

**或 (如需修改)**:

```json
{
  "type": "pr_rejected",
  "payload": {
    "decision": "changes_requested",
    "message": "需要修改以下问题后重新提交",
    "required_changes": [
      "修复安全问题：用户输入未验证",
      "补充单元测试：覆盖率不足 80%"
    ],
    "next_step": "修改后重新运行 /eket-submit-pr"
  }
}
```

---

### 3.8 阶段 8: 后续处理

#### Approved 后的操作:

```bash
# 1. 更新 Ticket 状态
# jira/tickets/feature/${TICKET_ID}.md
# 状态：review → done

# 2. 合并到 testing 分支
git checkout testing
git merge feature/${TICKET_ID}-${description} --no-ff -m "merge: ${TICKET_ID} - ${description}"

# 3. 推送到远程
git push origin testing

# 4. 清理分支
git branch -d feature/${TICKET_ID}-${description}

# 5. 归档 PR 文件
mv outbox/review_requests/pr_${TICKET_ID}_*.md outbox/review_requests/archive/
```

#### Changes Requested 后的操作:

```bash
# 1. 更新 Ticket 状态
# 状态：review → in_progress

# 2. 通知 Slaver
# 发送 pr_rejected 消息

# 3. 等待重新提交
# Slaver 修改后重新运行 /eket-submit-pr
```

---

## 4. Review 决策矩阵

| 评分 | 代码质量 | 安全性 | 测试 | 决策 |
|------|----------|--------|------|------|
| ≥ 50/60 | ≥ 8/10 | ≥ 8/10 | ≥ 8/10 | **Approved** |
| 40-49/60 | ≥ 6/10 | ≥ 6/10 | ≥ 6/10 | **Changes Requested** (minor) |
| < 40/60 | < 6/10 | < 6/10 | < 6/10 | **Rejected** |
| 任何维度 < 5/10 | - | - | - | **Rejected** |

**安全一票否决**: 任何安全问题直接拒绝

---

## 5. 命令参考

### Master 专用命令

| 命令 | 功能 |
|------|------|
| `/eket-review-pr -t <ticket-id>` | 审核指定 PR |
| `/eket-merge-pr -t <ticket-id>` | 合并已批准的 PR |
| `/eket-list-prs` | 列出待审核 PR |

### 自动化命令

```bash
# 运行完整 Review 流程
/eket-review-pr -t FEAT-001

# 仅运行测试验证
npm run test && npm run test:coverage

# 仅运行安全检查
npm run security-scan

# 生成 Review 报告模板
cat jira/templates/pr-review-checklist.md
```

---

## 6. 最佳实践

### 6.1 Review 者

1. **及时响应**: 24 小时内完成 Review
2. **建设性反馈**: 指出问题的同时提供改进建议
3. **公正客观**: 基于代码质量，不针对个人
4. **优先级处理**: P0/P1 优先 Review

### 6.2 提交者

1. **自审先行**: 提交前自己先 Review 一遍
2. **小步提交**: 单次 PR 变更不超过 500 行
3. **描述清晰**: PR 描述完整准确
4. **及时响应**: 收到 Review 意见后 24 小时内响应

### 6.3 Review 重点

| 优先级 | 检查项 |
|--------|--------|
| P0 | 安全性问题、功能正确性 |
| P1 | 代码质量、测试覆盖 |
| P2 | 性能优化、文档完整 |

---

**维护者**: EKET Framework Team
**版本**: v2.0.0
