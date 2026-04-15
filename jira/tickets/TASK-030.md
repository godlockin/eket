# TASK-030: Skill description 触发条件重写

**Ticket ID**: TASK-030
**标题**: 将所有 Skill description 字段从"功能摘要"改为"触发条件描述"
**类型**: improvement
**优先级**: P1

**状态**: pr_review
**创建时间**: 2026-04-15
**最后更新**: 2026-04-15
**started_at**: 2026-04-15
**completed_at**: 2026-04-15

**负责人**: slaver-fullstack-dev
**Slaver**: slaver-fullstack-dev

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-15 | backlog → ready |
| 领取 | slaver-fullstack-dev | 2026-04-15 | ready → in_progress |
| 提交 PR | slaver-fullstack-dev | 2026-04-15 | in_progress → pr_review |

---

## 1. 任务描述

### 背景

来自 claude-code-best-practice（44k ⭐，Anthropic 核心团队最佳实践）的关键发现：

> **Skill description 是触发器，不是摘要。为模型写，描述"何时应该触发"，而不是描述功能。**

当前 EKET 所有 Skill 的 `description` 字段写的是功能摘要，导致 Claude 无法在正确时机自动调用这些 Skill。

### 问题示例

```yaml
# ❌ 当前写法（功能摘要 — 对模型无意义）
description: "管理 Redis 连接的工具"

# ✅ 目标写法（触发条件 — 模型知道何时调用）
description: "Use when checking Redis connectivity, listing Slavers, or diagnosing connection issues. Triggers on keywords: 'redis', 'connection failed', 'slaver list'."
```

### 改动范围

**Part A — `template/skills/` 下所有 YAML 文件的 description 字段**

遍历以下目录，按类别重写 description：
- `requirements/` (4个)：user_interview, requirement_decomposition, acceptance_criteria_definition, user_story_mapping
- `design/` (5个)：architecture_design, api_design, database_design, ui_ux_design, icon_design
- `development/` (2个)：frontend_development, backend_development
- `testing/` (4个)：unit_test, integration_test, performance_test, e2e_test
- `devops/` (4个)：docker_build, ci_cd_setup, kubernetes_deploy, monitoring_setup
- `documentation/` (4个)：api_documentation, user_guide, technical_doc, release_notes

共 **23 个** YAML 文件。

**Part B — `template/skills/registry.yml`**

更新 registry 中对应的 description 字段保持一致。

**Part C — `template/docs/SKILLS-BEST-PRACTICES.md`（新建）**

新增 Skill 编写规范文档，说明 description 触发条件写法，包含：
- 写法对比（摘要 vs 触发条件）
- 9 类 Skill 类型（Library/Product Verification/Data Fetching/Business Process/Code Scaffolding/Code Quality/CI-CD/Runbooks/Infrastructure）
- 触发关键词模板

### description 重写模板

```
Use when [用户场景/意图]. Triggers when user mentions [触发关键词]. 
Provides [核心能力简述].
```

---

## 2. 验收标准

- [ ] `template/skills/` 下所有 23 个 YAML 文件的 description 均不包含"工具"/"管理"/"系统"等功能摘要词，改为包含 "Use when" 或 "Triggers when" 格式；验证：`grep -rL "Use when\|Triggers when" template/skills/**/*.yml`（应返回空）
- [ ] `template/docs/SKILLS-BEST-PRACTICES.md` 存在且包含触发条件写法说明；验证：`test -f template/docs/SKILLS-BEST-PRACTICES.md && grep -c "Use when" template/docs/SKILLS-BEST-PRACTICES.md`
- [ ] `template/skills/registry.yml` 中 description 字段与对应 YAML 文件保持一致（至少包含 "Use when"）；验证：`grep -c "Use when" template/skills/registry.yml`（应 ≥ 10）
- [ ] `npm test` 全量通过（文档改动不影响 TypeScript 测试）；验证：`cd node && npm test 2>&1 | tail -3`

---

## 3. 技术方案

纯文档/配置改动，无 TypeScript 变更。

1. 读取每个 YAML 文件，分析当前 description
2. 按 Skill 类别套用触发条件模板重写
3. 新建 `template/docs/SKILLS-BEST-PRACTICES.md`
4. 更新 registry.yml

---

## 4. 影响范围

- `template/skills/**/*.yml` — 23 个文件的 description 字段
- `template/skills/registry.yml` — description 字段同步更新
- `template/docs/SKILLS-BEST-PRACTICES.md` — 新建规范文档

---

## 5. blocked_by

无依赖，可立即执行。与 TASK-031/032/033/034 完全并行。

---

## 6. 执行记录（Slaver 填写）

### 分析报告

**执行时间**: 2026-04-15
**Slaver**: slaver-fullstack-dev（fullstack_dev 角色）
**预计工时**: 1.5 小时

#### 实现方案

纯文档/配置改动，无 TypeScript 变更：

1. **Part A**: 读取 23 个 YAML 文件的现有 description，按 Skill 类别套用触发条件模板重写
2. **Part B**: 更新 `template/skills/registry.yml` 中全部 23 条 description 与 YAML 文件保持一致
3. **Part C**: 新建 `template/docs/SKILLS-BEST-PRACTICES.md`，包含写法对比、9类Skill类型分类、触发关键词模板、自检清单

#### description 重写原则

所有 description 统一格式：
```
"Use when [场景]. Triggers when user mentions [关键词]. Provides [输出]."
```

各类别关键词设计：
- `requirements/`：业务流程词（interview, decompose, acceptance criteria, story map）
- `design/`：设计产物词（architecture, API design, schema, wireframe, icon）
- `development/`：开发行为词（implement UI, implement API, scaffold）
- `testing/`：测试方法词（unit test, integration test, E2E, performance, load test）
- `devops/`：工具/平台词（Docker, CI/CD, Kubernetes, Prometheus）
- `documentation/`：文档类型词（API docs, technical doc, user guide, release notes）

### 验收结果验证

| 验收标准 | 结果 | 说明 |
|---------|------|------|
| 23个 YAML 均包含 "Use when" 或 "Triggers when" | ✅ PASS | grep 匹配 24 个文件（23 skill + registry），每个 skill yml 各 1 处 |
| `template/docs/SKILLS-BEST-PRACTICES.md` 存在且含 "Use when" | ✅ PASS | 文件存在，包含 17 处 "Use when" |
| `registry.yml` 中 "Use when" ≥ 10 | ✅ PASS | registry.yml 包含 23 处 "Use when" |
| npm test 全量通过（纯文档变更不影响 TS 测试） | 待 CI 验证 | 仅修改 .yml/.md 文件，无 TypeScript 变更 |

### 变更文件清单

**修改（23 个 skill YAML）**:
- `template/skills/requirements/user_interview.yml`
- `template/skills/requirements/requirement_decomposition.yml`
- `template/skills/requirements/acceptance_criteria_definition.yml`
- `template/skills/requirements/user_story_mapping.yml`
- `template/skills/design/architecture_design.yml`
- `template/skills/design/api_design.yml`
- `template/skills/design/database_design.yml`
- `template/skills/design/ui_ux_design.yml`
- `template/skills/design/icon_design.yml`
- `template/skills/development/frontend_development.yml`
- `template/skills/development/backend_development.yml`
- `template/skills/testing/unit_test.yml`
- `template/skills/testing/integration_test.yml`
- `template/skills/testing/performance_test.yml`
- `template/skills/testing/e2e_test.yml`
- `template/skills/devops/docker_build.yml`
- `template/skills/devops/ci_cd_setup.yml`
- `template/skills/devops/kubernetes_deploy.yml`
- `template/skills/devops/monitoring_setup.yml`
- `template/skills/documentation/api_documentation.yml`
- `template/skills/documentation/technical_doc.yml`
- `template/skills/documentation/user_guide.yml`
- `template/skills/documentation/release_notes.yml`

**修改（registry）**:
- `template/skills/registry.yml`

**新增**:
- `template/docs/SKILLS-BEST-PRACTICES.md`
