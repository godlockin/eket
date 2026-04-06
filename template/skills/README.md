# EKET Skills 库

本目录包含 EKET 框架的所有 Skills 定义。每个 Skill 都是独立、可配置、可复用的能力单元。

## 目录结构

```
skills/
├── registry.yml              # Skills 注册表
├── requirements/             # 需求分析类
│   ├── user_interview.yml
│   ├── requirement_decomposition.yml
│   └── acceptance_criteria_definition.yml
├── design/                   # 技术设计类
│   ├── architecture_design.yml
│   ├── api_design.yml
│   └── database_design.yml
├── development/              # 开发实现类
│   ├── frontend_development.yml
│   └── backend_development.yml
├── testing/                  # 测试验证类
│   ├── unit_test.yml
│   └── e2e_test.yml
├── devops/                   # 运维部署类
│   ├── docker_build.yml
│   └── ci_cd_setup.yml
└── documentation/            # 文档类
    ├── api_documentation.yml
    └── technical_doc.yml
```

## Skills 分类

| 分类 | 路径 | 数量 | 用途 |
|------|------|------|------|
| 需求分析 | `requirements/` | 3 | 用户访谈、需求拆解、验收标准定义 |
| 技术设计 | `design/` | 3 | 架构设计、API 设计、数据库设计 |
| 开发实现 | `development/` | 2 | 前端开发、后端开发 |
| 测试验证 | `testing/` | 2 | 单元测试、E2E 测试 |
| 运维部署 | `devops/` | 2 | Docker 构建、CI/CD 配置 |
| 文档 | `documentation/` | 2 | API 文档、技术文档 |

**总计**: 14 个 Skills

## Skill 结构

每个 Skill 由 YAML 文件定义，包含以下字段：

```yaml
name: skill_name              # Skill 名称
version: 1.0.0                # 版本号
category: category_name       # 所属分类
description: 简短描述         # 功能描述

inputs:                       # 输入参数定义
  - name: input_name
    type: string|number|boolean|object|array|file
    required: true|false
    description: 输入说明
    example: 示例值

outputs:                      # 输出定义
  - name: output_name
    type: string|number|boolean|object|array|file
    description: 输出说明

steps:                        # 执行步骤
  - name: step_1
    description: 步骤说明
    action: action_name
    params:
      key: value

dependencies:                 # 依赖的其它 Skill
  - skill_name_1
  - skill_name_2

examples:                     # 使用示例
  - name: 示例名称
    inputs:
      input_name: value
    expected_outputs:
      output_name: expected_value
```

## 在 Agent 中使用

在 Agent 配置文件中引用 Skills：

```yaml
# agents/coordinator/requirement_analyst.yml
name: requirement_analyst
type: coordinator

skills:
  - requirements/user_interview
  - requirements/requirement_decomposition
  - requirements/acceptance_criteria_definition

workflow:
  - skill: requirements/user_interview
    output: interview_notes
  - skill: requirements/requirement_decomposition
    inputs:
      raw_requirement: "{{interview_notes.requirement}}"
```

## 添加新 Skill

```bash
# 1. 创建 Skill 文件
cat > skills/{category}/{skill_name}.yml << EOF
name: {skill_name}
version: 1.0.0
category: {category}
description: 描述

inputs:
  - name: input_name
    type: string
    required: true

outputs:
  - name: output_name
    type: string

steps:
  - name: step_1
    action: action_name
EOF

# 2. 更新注册表
# 编辑 skills/registry.yml 添加新 Skill
```

## 调用 Skill

```bash
# 命令行调用
./scripts/execute-skill.sh {skill_name} --input key=value

# 在 Agent workflow 中调用
# 见上方 Agent 示例
```

---

**维护者**: EKET Framework Team
**版本**: v2.0.0
