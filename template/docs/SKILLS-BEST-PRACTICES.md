# SKILLS-BEST-PRACTICES.md

> **来源灵感**：claude-code-best-practice（Anthropic 核心团队，44k ⭐）
>
> **核心原则**：Skill `description` 是触发器，不是摘要。**为模型写，描述"何时应该触发"，而不是描述功能。**

---

## 1. 写法对比：摘要 vs 触发条件

### 错误写法（功能摘要 — 对模型无意义）

```yaml
# ❌ 摘要式 — 模型不知道什么时候该调用这个 Skill
description: "管理 Redis 连接的工具"
description: "执行单元测试"
description: "API 文档生成"
description: "用户需求访谈"
description: "Kubernetes 部署"
```

**问题**：这些描述告诉模型"这个 Skill 能做什么"，但没有告诉模型"什么情况下应该用这个 Skill"。结果是模型在正确的场景下不会自动调用，降低了协作效率。

---

### 正确写法（触发条件 — 模型知道何时调用）

```yaml
# ✅ 触发条件式 — 模型能在正确场景下自动选择
description: "Use when checking Redis connectivity, listing Slavers, or diagnosing
  connection issues. Triggers when user mentions 'redis', 'connection failed',
  or 'slaver list'. Provides connection status and diagnostics."

description: "Use when newly written code needs unit test coverage or when existing
  tests need updating to meet a coverage target. Triggers when user mentions
  'unit test', 'write tests', 'test coverage', 'jest', or 'pytest'."

description: "Use when an API implementation is complete and developers need reference
  documentation. Triggers when user mentions 'API docs', 'OpenAPI spec',
  'Swagger', or 'document endpoints'."
```

**为什么有效**：LLM 选择 Skill 时，会将用户的意图与 `description` 做语义匹配。触发条件式描述提供了明确的"激活信号"，让模型能精准匹配用户需求。

---

## 2. 触发条件 description 模板

```
Use when [用户场景/意图].
Triggers when user mentions [触发关键词列表].
Provides [核心输出/能力简述].
```

### 各字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `Use when [场景]` | ✅ 必填 | 描述触发此 Skill 的业务场景或用户意图 |
| `Triggers when user mentions [关键词]` | ✅ 必填 | 列举 3-6 个最典型的触发词或短语 |
| `Provides [输出]` | 推荐 | 简述 Skill 的核心产出，帮助模型区分相似 Skill |

---

## 3. 9 类 Skill 类型与触发关键词模板

### Type 1: Library（知识库查询类）

**场景**：检索最佳实践、规范、参考资料

```yaml
description: "Use when needing to look up [domain] best practices, standards, or
  reference patterns. Triggers when user mentions '[keyword1]', '[keyword2]',
  'how to [action]', or 'best practice for [topic]'."
```

**示例关键词**：`best practice`, `reference`, `standard`, `convention`, `how to`

---

### Type 2: Product Verification（产品验证类）

**场景**：验证功能是否符合产品需求或验收标准

```yaml
description: "Use when a feature implementation needs to be verified against product
  requirements or acceptance criteria. Triggers when user mentions 'verify feature',
  'check requirements', 'acceptance test', or 'does this meet the spec'."
```

**示例关键词**：`verify`, `validate`, `acceptance criteria`, `does this meet`, `check requirement`

---

### Type 3: Data Fetching（数据获取类）

**场景**：从外部系统、API 或数据库获取数据

```yaml
description: "Use when real-time data needs to be fetched from [system/API] to
  answer questions or populate a workflow. Triggers when user mentions
  '[system name]', 'fetch data', 'get [resource]', or 'query [source]'."
```

**示例关键词**：`fetch`, `get`, `query`, `retrieve`, `pull from`, `look up`

---

### Type 4: Business Process（业务流程类）

**场景**：执行标准化的多步骤业务流程（如需求分析、发版流程）

```yaml
description: "Use when [business process] needs to be executed following the
  standard [team/org] workflow. Triggers when user mentions '[process name]',
  '[trigger action]', or '[business event]'."
```

**示例关键词**：需求分析 `requirement`, 发版 `release`, 评审 `review`, 上线 `deploy`

---

### Type 5: Code Scaffolding（代码脚手架类）

**场景**：生成项目结构、组件、模板代码

```yaml
description: "Use when bootstrapping a new [component/service/project] from scratch
  or from a template. Triggers when user mentions 'create new [type]',
  'scaffold [name]', 'generate [component]', or 'bootstrap project'."
```

**示例关键词**：`create new`, `scaffold`, `generate`, `boilerplate`, `template`, `bootstrap`

---

### Type 6: Code Quality（代码质量类）

**场景**：代码审查、重构建议、lint、格式化

```yaml
description: "Use when code quality issues need to be identified and fixed, including
  linting errors, style violations, or refactoring opportunities. Triggers when
  user mentions 'code review', 'refactor', 'lint', 'clean up code', or
  'code quality'."
```

**示例关键词**：`code review`, `refactor`, `lint`, `clean up`, `code smell`, `tech debt`

---

### Type 7: CI/CD（持续集成部署类）

**场景**：设置或修改 CI/CD 流水线、部署脚本

```yaml
description: "Use when setting up or modifying automated build, test, and deployment
  pipelines. Triggers when user mentions 'CI/CD', 'GitHub Actions', 'pipeline',
  'automated deploy', 'workflow', or 'branch protection'."
```

**示例关键词**：`CI/CD`, `pipeline`, `GitHub Actions`, `workflow`, `automated deploy`, `branch protection`

---

### Type 8: Runbooks（运维手册类）

**场景**：处理生产告警、故障排查、应急响应

```yaml
description: "Use when a production incident or alert needs a structured runbook
  for diagnosis and remediation. Triggers when user mentions 'production issue',
  'alert firing', 'runbook', 'incident response', 'on-call', or 'outage'."
```

**示例关键词**：`production issue`, `alert`, `runbook`, `incident`, `on-call`, `outage`, `debug`

---

### Type 9: Infrastructure（基础设施类）

**场景**：管理云资源、容器编排、IaC（基础设施即代码）

```yaml
description: "Use when provisioning or managing [infrastructure type] resources,
  or when IaC templates need to be created/updated. Triggers when user mentions
  'Terraform', 'Kubernetes', 'cloud resources', 'infra', 'provision', or
  '[cloud provider] setup'."
```

**示例关键词**：`Terraform`, `Kubernetes`, `k8s`, `cloud`, `provision`, `infra`, `IaC`

---

## 4. EKET 已有 Skill 分类对照

| Skill 名称 | 类型 | 核心触发词 |
|-----------|------|-----------|
| `user_interview` | Business Process | user interview, requirements gathering, customer research |
| `requirement_decomposition` | Business Process | break down requirements, decompose feature, create tickets |
| `acceptance_criteria_definition` | Product Verification | acceptance criteria, definition of done, test conditions |
| `user_story_mapping` | Business Process | user story map, sprint planning, user journey |
| `architecture_design` | Code Scaffolding | system architecture, tech stack, component design, microservices |
| `api_design` | Code Scaffolding | API design, REST endpoints, OpenAPI, API contract |
| `database_design` | Code Scaffolding | database design, schema, ERD, data modeling |
| `ui_ux_design` | Code Scaffolding | UI design, UX, wireframe, mockup, user flow |
| `icon_design` | Code Scaffolding | icon design, SVG icon, app icon, favicon |
| `frontend_development` | Code Scaffolding | frontend development, React component, implement UI |
| `backend_development` | Code Scaffolding | backend development, implement API, server-side logic |
| `unit_test` | Code Quality | unit test, test coverage, jest, pytest |
| `integration_test` | Code Quality | integration test, test modules together, API integration test |
| `performance_test` | Code Quality | performance test, load test, QPS, bottleneck analysis |
| `e2e_test` | Code Quality | E2E test, Playwright, Cypress, browser automation |
| `docker_build` | Infrastructure | Docker, containerize, Dockerfile, docker-compose |
| `ci_cd_setup` | CI/CD | CI/CD, GitHub Actions, pipeline, automated deployment |
| `kubernetes_deploy` | Infrastructure | Kubernetes, k8s, kubectl, HPA, container orchestration |
| `monitoring_setup` | Runbooks | monitoring, Prometheus, Grafana, alerting, observability |
| `api_documentation` | Library | API docs, OpenAPI spec, Swagger, document endpoints |
| `technical_doc` | Library | technical documentation, architecture doc, developer guide |
| `user_guide` | Library | user guide, user manual, how-to docs, quick start |
| `release_notes` | Library | release notes, changelog, version announcement, migration guide |

---

## 5. 常见反模式（避免）

| 反模式 | 问题 | 修正方向 |
|--------|------|---------|
| `description: "管理 X 的工具"` | 只描述功能，没有触发条件 | 改为 "Use when managing X..." |
| `description: "执行 Y 操作"` | 动词开头但仍是功能摘要 | 加入 "Use when Y is needed..." |
| `description: "X 和 Y 功能"` | 列举功能，无场景 | 加入 "Triggers when user mentions..." |
| 过长 description（>3行） | 降低匹配精度，模型注意力稀释 | 聚焦最核心的 1-2 个场景 |
| 过短 description（<1句） | 触发关键词不足，召回率低 | 补充 "Triggers when..." 段落 |

---

## 6. 自检清单

在编写或审查 Skill description 时，逐项检查：

- [ ] description 以 `"Use when..."` 或 `"Triggers when..."` 开头
- [ ] 包含至少 3 个具体触发关键词或短语
- [ ] 描述的是**触发场景**（用户意图），而非**功能实现**
- [ ] 避免"管理"、"工具"、"系统"、"执行"等功能摘要词作为核心词
- [ ] 与同类别其他 Skill 的 description 有明显区分度
- [ ] 长度在 1-3 句之间（50-150 字符为佳）

---

**维护者**: EKET Framework Team
**最后更新**: 2026-04-15
**版本**: 1.0.0
