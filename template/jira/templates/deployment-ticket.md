# Deployment Ticket: DEPL-{{SEQUENCE_NUMBER}} - {{DEPL_TITLE}}

**创建时间**: {{CREATE_DATE}}
**创建者**: Master Agent
**优先级**: P0 | P1 | P2 | P3
**状态**: backlog
**标签**: `deployment`, `devops`, `{{ENVIRONMENT}}`
**关联 Feature**: {{FEATURE_ID}}
**关联 Release**: {{RELEASE_ID}}
**分配给**: null

<!-- dispatched_by: Master 的 GitHub handle，pr-reviewer-check Action 用此判定自我闭环；不得与 PR 作者相同 -->
dispatched_by: null

---

## 0. 任务元数据

### 0.1 重要性说明
<!--
critical: 关键部署，阻塞发布
high: 重要功能部署
medium: 常规部署
low: 优化类部署
-->

### 0.2 优先级说明
<!--
P0: 紧急部署（生产事故修复）
P1: 高优先级部署
P2: 正常优先级
P3: 低优先级
-->

### 0.3 依赖关系
```yaml
blocks: []  # 本部署阻塞的任务
blocked_by: []  # 本部署依赖的任务
related: []  # 相关部署任务
external: []  # 外部依赖（如：第三方服务、审批流程）
```

### 0.4 背景信息
**业务背景**：<!-- 为什么要做这件事？用户/业务痛点是什么？ -->

**当前状态**：<!-- 目前是什么样的，有什么问题或缺失？ -->

**期望变化**：<!-- 做完后，什么改变了？ -->

**成功度量**：<!-- 怎么知道做好了？最好是可量化的指标 -->

### 0.5 技能要求
<!-- 如：kubernetes, docker, ci_cd, aws, gcp, ansible, terraform -->

### 0.6 预估工时
<!-- 如：1h, 2h, 4h, 8h -->

---

## 1. 状态流转记录（必须更新）

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| {{CREATE_DATE}} | backlog → ready | Master | 初始创建 |
| {{CLAIM_DATE}} | ready → in_progress | ${Slaver_ID} | **已领取** |
| {{PREPARE_DATE}} | in_progress → preparing | ${Slaver_ID} | 部署准备中 |
| {{DRY_RUN_DATE}} | preparing → dry_run | ${Slaver_ID} | 开始预发布部署 |
| {{STAGING_DATE}} | dry_run → staging | ${Slaver_ID} | 开始测试环境部署 |
| {{PROD_DATE}} | staging → production | ${Slaver_ID} | 开始生产部署 |
| {{VERIFY_DATE}} | production → verifying | ${Slaver_ID} | 部署验证中 |
| {{APPROVE_DATE}} | verifying → done | Master | 部署完成 |

> **重要**: 生产部署必须经过预发布和测试环境验证！

---

## 2. 部署任务描述

### 2.1 部署类型
- [ ] 功能发布部署
- [ ] 缺陷修复部署 (Hotfix)
- [ ] 配置变更部署
- [ ] 基础设施部署
- [ ] 数据迁移部署
- [ ] 回滚部署
- [ ] 其他：${类型}

### 2.2 部署环境
| 环境 | 是否需要 | 部署时间 | 负责人 |
|------|----------|----------|--------|
| 预发布 (Dry Run) | Yes/No | {{TIME}} | {{OWNER}} |
| 测试 (Staging) | Yes/No | {{TIME}} | {{OWNER}} |
| 生产 (Production) | Yes/No | {{TIME}} | {{OWNER}} |

### 2.3 部署内容
| 组件 | 当前版本 | 目标版本 | 变更类型 |
|------|----------|----------|----------|
| ${Service 1} | ${v1.0.0} | ${v1.1.0} | Feature/Bugfix |
| ${Service 2} | ${v1.0.0} | ${v1.1.0} | Feature/Bugfix |

### 2.4 变更范围
- **新增功能**: {{NEW_FEATURES}}
- **修复缺陷**: {{FIXED_BUGS}}
- **配置变更**: {{CONFIG_CHANGES}}
- **数据迁移**: {{DATA_MIGRATION}}

---

## 3. 部署清单（Master 填写）

### 3.1 前置检查
- [ ] 所有关联 Feature 已完成并 Review 通过
- [ ] 测试覆盖率达标（>= {{X}}%）
- [ ] 所有单元测试通过
- [ ] 所有集成测试通过
- [ ] 性能测试通过（如适用）
- [ ] 安全扫描通过
- [ ] 部署文档已更新
- [ ] 回滚方案已准备

### 3.2 变更评审（Change Review）
| 评审项 | 评审结果 | 评审人 | 时间 |
|--------|----------|--------|------|
| 代码变更 | ✓/✗ | {{REVIEWER}} | {{TIME}} |
| 配置变更 | ✓/✗ | {{REVIEWER}} | {{TIME}} |
| 数据库变更 | ✓/✗ | {{REVIEWER}} | {{TIME}} |
| 风险评估 | ✓/✗ | {{REVIEWER}} | {{TIME}} |

### 3.3 审批记录（生产部署必需）
| 审批人 | 角色 | 审批结果 | 审批时间 |
|--------|------|----------|----------|
| {{APPROVER1}} | Tech Lead | ✓/✗ | {{TIME}} |
| {{APPROVER2}} | Product Owner | ✓/✗ | {{TIME}} |
| {{APPROVER3}} | Ops Lead | ✓/✗ | {{TIME}} |

---

## 4. 部署步骤（Slaver 填写）

### 4.1 部署脚本
```bash
# 预发布部署
{{DRY_RUN_COMMAND}}

# 测试环境部署
{{STAGING_COMMAND}}

# 生产环境部署
{{PROD_COMMAND}}
```

### 4.2 回滚方案
```bash
# 回滚命令
{{ROLLBACK_COMMAND}}
```

**回滚条件**:
- [ ] 部署后 {{X}} 分钟内错误率 > {{Y}}%
- [ ] 核心功能验证失败
- [ ] 性能指标不达标
- [ ] 人类要求回滚

---

## 5. 执行记录（Slaver 领取后填写）

### 5.1 领取信息
- **领取者**: ${Slaver_ID}
- **领取时间**: {{CLAIM_DATE}}
- **预计工时**: {{ESTIMATED_HOURS}}h
- **状态已更新**: [ ] 是

### 5.2 必需执行流程

#### 步骤 1: 部署准备
- [ ] 已完成前置检查
- [ ] 已准备部署脚本
- [ ] 已准备回滚方案
- [ ] 已更新状态：`ready` → `preparing`

#### 步骤 2: 预发布部署（Dry Run）
- [ ] 已在预发布环境部署
- [ ] 部署时间：{{DRY_RUN_TIME}}
- [ ] 部署结果：成功/失败
- [ ] 问题记录：{{ISSUES}}
- [ ] 已更新状态：`preparing` → `dry_run`

#### 步骤 3: 测试环境部署（Staging）
- [ ] 已在测试环境部署
- [ ] 部署时间：{{STAGING_TIME}}
- [ ] 部署结果：成功/失败
- [ ] 已验证功能：{{VERIFIED_FEATURES}}
- [ ] 已更新状态：`dry_run` → `staging`

#### 步骤 4: 生产环境部署（Production）
- [ ] 已获得生产部署审批
- [ ] 部署时间：{{PROD_TIME}}
- [ ] 部署结果：成功/失败
- [ ] 已更新状态：`staging` → `production`

#### 步骤 5: 部署验证
- [ ] 健康检查通过
- [ ] 核心功能验证通过
- [ ] 监控指标正常
- [ ] 日志无异常
- [ ] 已更新状态：`production` → `verifying`

#### 步骤 6: 部署完成
- [ ] 所有验证通过
- [ ] 已通知相关方
- [ ] 已更新状态：`verifying` → `done`

### 5.3 执行状态
| 阶段 | 状态 | 完成时间 | 备注 |
|------|------|----------|------|
| 部署准备 | ✓/✗ | {{PREPARE_DATE}} | - |
| 预发布部署 | ✓/✗ | {{DRY_RUN_DATE}} | {{RESULT}} |
| 测试环境部署 | ✓/✗ | {{STAGING_DATE}} | {{RESULT}} |
| 生产部署 | ✓/✗ | {{PROD_DATE}} | {{RESULT}} |
| 部署验证 | ✓/✗ | {{VERIFY_DATE}} | {{RESULT}} |

---

## 6. 验证结果

### 6.1 健康检查
| 检查项 | 状态 | 详情 |
|--------|------|------|
| 服务启动 | ✓/✗ | {{DETAIL}} |
| 端口监听 | ✓/✗ | {{DETAIL}} |
| 数据库连接 | ✓/✗ | {{DETAIL}} |
| 缓存连接 | ✓/✗ | {{DETAIL}} |
| 外部 API | ✓/✗ | {{DETAIL}} |

### 6.2 功能验证
| 功能 | 验证结果 | 验证人 | 时间 |
|------|----------|--------|------|
| ${功能 1} | ✓/✗ | {{VERIFIER}} | {{TIME}} |
| ${功能 2} | ✓/✗ | {{VERIFIER}} | {{TIME}} |

### 6.3 监控指标
| 指标 | 部署前 | 部署后 | 状态 |
|------|--------|--------|------|
| 错误率 | {{X}}% | {{Y}}% | ✓/✗ |
| 响应时间 | {{X}}ms | {{Y}}ms | ✓/✗ |
| QPS | {{X}} | {{Y}} | ✓/✗ |
| CPU 使用率 | {{X}}% | {{Y}}% | ✓/✗ |
| 内存使用率 | {{X}}% | {{Y}}% | ✓/✗ |

---

## 7. 批准记录（Master/Human 填写）

### 7.1 部署批准
- [ ] 预发布部署批准
- [ ] 测试环境部署批准
- [ ] 生产部署批准（需要人类审批）

### 7.2 批准结果
- [ ] **批准完成** - 部署成功，可以关闭
- [ ] **需要观察** - 继续监控 {{X}} 小时
- [ ] **需要回滚** - ${原因}
- [ ] **部署失败** - ${原因}

**批准者**: {{APPROVER}}
**批准时间**: {{APPROVE_DATE}}

---

## 8. 知识沉淀

### 8.1 部署经验
${部署过程中学到的经验和教训}

### 8.2 改进建议
${部署流程的改进建议}

### 8.3 部署报告
```
部署总结：
- 部署成功/失败
- 部署时长：{{DURATION}}
- 问题数：{{ISSUE_COUNT}}
- 回滚次数：{{ROLLBACK_COUNT}}
```

---

**状态流转**: `backlog` → `ready` → `in_progress` → `preparing` → `dry_run` → `staging` → `production` → `verifying` → `done`
