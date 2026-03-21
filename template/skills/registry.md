# Skills Registry

**Version**: 1.0.0
**Last Updated**: 2026-03-20

---

## Skills 目录结构

```
skills/
├── requirements/          # 需求分析类 Skills
│   ├── user_interview.yml
│   ├── requirement_decomposition.yml
│   └── acceptance_criteria_definition.yml
├── design/               # 技术设计类 Skills
│   ├── architecture_design.yml
│   ├── api_design.yml
│   ├── database_design.yml
│   └── ui_ux_design.yml
├── development/          # 开发实现类 Skills
│   ├── frontend_development.yml
│   ├── backend_development.yml
│   ├── test_development.yml
│   └── integration_development.yml
├── testing/              # 测试验证类 Skills
│   ├── unit_test.yml
│   ├── e2e_test.yml
│   ├── integration_test.yml
│   └── performance_test.yml
├── devops/               # 运维部署类 Skills
│   ├── docker_build.yml
│   ├── kubernetes_deploy.yml
│   ├── ci_cd_setup.yml
│   └── monitoring_setup.yml
└── documentation/        # 文档类 Skills
    ├── api_documentation.yml
    ├── user_guide.yml
    ├── technical_doc.yml
    └── release_notes.yml
```

---

## Skill 定义格式

每个 Skill 由 YAML 文件定义：

```yaml
name: skill_name
version: 1.0.0
category: category_name
description: 简短描述

# 输入参数定义
inputs:
  - name: input_name
    type: string|number|boolean|object|array|file
    required: true|false
    description: 输入说明
    example: 示例值

# 输出定义
outputs:
  - name: output_name
    type: string|number|boolean|object|array|file
    description: 输出说明

# 执行步骤
steps:
  - name: step_1
    description: 步骤说明
    action: action_name
    params:
      key: value

# 依赖的其它 Skill
dependencies:
  - skill_name_1
  - skill_name_2

# 使用示例
examples:
  - name: 示例名称
    inputs:
      input_name: value
    expected_outputs:
      output_name: expected_value
```

---

## Skills 列表

### 需求分析类 (`requirements/`)

| Skill | 用途 | 状态 |
|------|------|------|
| `user_interview` | 用户需求访谈 | placeholder |
| `requirement_decomposition` | 需求拆解 | placeholder |
| `acceptance_criteria_definition` | 验收标准定义 | placeholder |

### 技术设计类 (`design/`)

| Skill | 用途 | 状态 |
|------|------|------|
| `architecture_design` | 架构设计 | placeholder |
| `api_design` | API 设计 | placeholder |
| `database_design` | 数据库设计 | placeholder |
| `ui_ux_design` | UI/UX 设计 | placeholder |

### 开发实现类 (`development/`)

| Skill | 用途 | 状态 |
|------|------|------|
| `frontend_development` | 前端开发 | placeholder |
| `backend_development` | 后端开发 | placeholder |
| `test_development` | 测试开发 | placeholder |
| `integration_development` | 集成开发 | placeholder |

### 测试验证类 (`testing/`)

| Skill | 用途 | 状态 |
|------|------|------|
| `unit_test` | 单元测试 | placeholder |
| `e2e_test` | E2E 测试 | placeholder |
| `integration_test` | 集成测试 | placeholder |
| `performance_test` | 性能测试 | placeholder |

### 运维部署类 (`devops/`)

| Skill | 用途 | 状态 |
|------|------|------|
| `docker_build` | Docker 构建 | placeholder |
| `kubernetes_deploy` | K8s 部署 | placeholder |
| `ci_cd_setup` | CI/CD 配置 | placeholder |
| `monitoring_setup` | 监控配置 | placeholder |

### 文档类 (`documentation/`)

| Skill | 用途 | 状态 |
|------|------|------|
| `api_documentation` | API 文档 | placeholder |
| `user_guide` | 用户指南 | placeholder |
| `technical_doc` | 技术文档 | placeholder |
| `release_notes` | 发布说明 | placeholder |

---

## 使用方法

### 在 Agent 中引用 Skills

```yaml
# agents/frontend_dev.yml

name: frontend_dev
type: executor

skills:
  - development/frontend_development
  - development/test_development
  - testing/unit_test
```

### 调用 Skill

```bash
# 通过 Claude Code 调用
/eket-skill backend_development --input design_spec=...
```

---

**维护者**: EKET Framework Team
