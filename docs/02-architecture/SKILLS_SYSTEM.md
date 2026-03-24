# EKET Skills 体系

**版本**: 0.6.2
**日期**: 2026-03-23

---

## 概述

SKILL 是 EKET 框架中的基本能力单元，每个 SKILL 都是独立、可配置、可复用的能力模块。智能体通过组合不同的 SKILL 来完成复杂任务。

```
┌─────────────────────────────────────────────────────────────────┐
│                        SKILL 体系架构                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Agent (智能体)                                                 │
│   │                                                             │
│   ├── 依赖 SKILL 组合                                            │
│   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│   │   │  Skill A    │  │  Skill B    │  │  Skill C    │        │
│   │   └─────────────┘  └─────────────┘  └─────────────┘        │
│   │                                                             │
│   └── 动态加载 SKILL                                            │
│                                                                 │
│   SKILL 特点：                                                   │
│   • 独立性 - 每个 SKILL 独立完成特定功能                          │
│   • 可配置 - 通过 YAML 配置 SKILL 参数                            │
│   • 可复用 - 多个 Agent 可以共享同一 SKILL                        │
│   • 可组合 - 多个 SKILL 组合完成复杂任务                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## SKILL 分类

### 1. 需求分析类 (`requirements/`)

| SKILL | 用途 | 输入 | 输出 |
|------|------|------|------|
| `user_interview` | 用户需求访谈 | 用户描述 | 需求要点 |
| `requirement_decomposition` | 需求拆解 | 原始需求 | 功能点列表 |
| `acceptance_criteria_definition` | 验收标准定义 | 功能点 | 验收标准 |
| `user_story_mapping` | 用户故事地图 | 需求要点 | 用户故事 |

### 2. 技术设计类 (`design/`)

| SKILL | 用途 | 输入 | 输出 |
|------|------|------|------|
| `architecture_design` | 架构设计 | 需求文档 | 架构设计稿 |
| `api_design` | API 设计 | 功能需求 | API 接口定义 |
| `database_design` | 数据库设计 | 数据需求 | Schema 设计 |
| `ui_ux_design` | UI/UX 设计 | 界面需求 | 设计稿 |

### 3. 开发实现类 (`development/`)

| SKILL | 用途 | 输入 | 输出 |
|------|------|------|------|
| `frontend_development` | 前端开发 | 设计稿、API 定义 | 前端代码 |
| `backend_development` | 后端开发 | API 定义、Schema | 后端代码 |
| `test_development` | 测试开发 | 需求、代码 | 测试代码 |
| `integration_development` | 集成开发 | 接口定义 | 集成代码 |

### 4. 测试验证类 (`testing/`)

| SKILL | 用途 | 输入 | 输出 |
|------|------|------|------|
| `unit_test` | 单元测试 | 代码 | 测试报告 |
| `e2e_test` | E2E 测试 | 完整流程 | 测试报告 |
| `integration_test` | 集成测试 | 接口 | 测试报告 |
| `performance_test` | 性能测试 | 系统 | 性能报告 |

### 5. 运维部署类 (`devops/`)

| SKILL | 用途 | 输入 | 输出 |
|------|------|------|------|
| `docker_build` | Docker 构建 | 代码、Dockerfile | 镜像 |
| `kubernetes_deploy` | K8s 部署 | 镜像、Manifest | 部署状态 |
| `ci_cd_setup` | CI/CD 配置 | 代码仓库 | 流水线 |
| `monitoring_setup` | 监控配置 | 系统指标 | 监控仪表板 |

### 6. 文档类 (`documentation/`)

| SKILL | 用途 | 输入 | 输出 |
|------|------|------|------|
| `api_documentation` | API 文档 | 接口定义 | 文档 |
| `user_guide` | 用户指南 | 功能说明 | 使用手册 |
| `technical_doc` | 技术文档 | 设计稿 | 技术文档 |
| `release_notes` | 发布说明 | 变更记录 | 发布说明 |

---

## SKILL 定义格式

每个 SKILL 由 YAML 文件定义：

```yaml
# skills/{category}/{skill_name}.yml

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

# 依赖的其它 SKILL
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

## SKILL 示例

### 示例 1: 需求拆解

```yaml
# skills/requirements/requirement_decomposition.yml

name: requirement_decomposition
version: 1.0.0
category: requirements
description: 将原始需求拆解为可执行的功能点

inputs:
  - name: raw_requirement
    type: string
    required: true
    description: 用户的原始需求描述
    example: "我想要一个用户登录功能"

  - name: project_context
    type: object
    required: false
    description: 项目背景信息
    example:
      project_type: web_application
      tech_stack: [react, nodejs]

outputs:
  - name: feature_list
    type: array
    description: 拆解后的功能点列表

  - name: dependencies
    type: array
    description: 功能点之间的依赖关系

steps:
  - name: analyze_requirement
    description: 分析需求关键词
    action: extract_keywords
    params:
      text: "{{inputs.raw_requirement}}"

  - name: identify_features
    description: 识别功能模块
    action: map_to_features
    params:
      keywords: "{{steps.analyze_requirement.keywords}}"
      context: "{{inputs.project_context}}"

  - name: define_dependencies
    description: 定义依赖关系
    action: analyze_dependencies
    params:
      features: "{{steps.identify_features.list}}"

examples:
  - name: 用户登录功能拆解
    inputs:
      raw_requirement: "我想要一个用户登录功能，支持用户名密码登录"
      project_context:
        project_type: web_application
        tech_stack: [react, nodejs]
    expected_outputs:
      feature_list:
        - "创建登录表单组件"
        - "实现登录 API 接口"
        - "添加表单验证逻辑"
        - "实现会话管理"
```

### 示例 2: 前端开发

```yaml
# skills/development/frontend_development.yml

name: frontend_development
version: 1.0.0
category: development
description: 根据设计稿和 API 定义实现前端界面

inputs:
  - name: design_spec
    type: object
    required: true
    description: 设计规格说明
    example:
      components: [LoginForm, Header]
      styles: tailwind

  - name: api_definition
    type: object
    required: true
    description: API 接口定义
    example:
      endpoints:
        - path: /api/login
          method: POST

  - name: tech_stack
    type: array
    required: true
    description: 技术栈
    example: [react, typescript, tailwind]

outputs:
  - name: frontend_code
    type: file
    description: 生成的前端代码

  - name: component_docs
    type: file
    description: 组件文档

steps:
  - name: setup_project
    description: 设置项目结构
    action: create_structure
    params:
      framework: "{{inputs.tech_stack.0}}"
      language: typescript

  - name: create_components
    description: 创建组件
    action: generate_components
    params:
      components: "{{inputs.design_spec.components}}"
      styles: "{{inputs.design_spec.styles}}"

  - name: integrate_api
    description: 集成 API
    action: implement_api_calls
    params:
      endpoints: "{{inputs.api_definition.endpoints}}"

  - name: write_tests
    description: 编写测试
    action: generate_tests
    params:
      components: "{{steps.create_components.list}}"
```

### 示例 3: API 设计

```yaml
# skills/design/api_design.yml

name: api_design
version: 1.0.0
category: design
description: 根据功能需求设计 RESTful API

inputs:
  - name: functional_requirements
    type: array
    required: true
    description: 功能需求列表
    example:
      - "用户可以注册"
      - "用户可以登录"
      - "用户可以查看个人信息"

  - name: data_models
    type: array
    required: false
    description: 数据模型
    example:
      - name: User
        fields: [id, username, email, password]

outputs:
  - name: api_spec
    type: object
    description: API 规格说明

  - name: openapi_doc
    type: file
    description: OpenAPI 文档

steps:
  - name: identify_resources
    description: 识别资源
    action: extract_resources
    params:
      requirements: "{{inputs.functional_requirements}}"

  - name: define_endpoints
    description: 定义端点
    action: design_endpoints
    params:
      resources: "{{steps.identify_resources.list}}"
      style: restful

  - name: generate_openapi
    description: 生成 OpenAPI 文档
    action: write_openapi
    params:
      endpoints: "{{steps.define_endpoints.list}}"
      format: yaml
```

---

## SKILL 调用机制

### 调用方式

```python
# 伪代码示例

class SkillExecutor:
    def __init__(self):
        self.skills = {}
        self.load_skills()

    def load_skills(self):
        """加载所有可用的 SKILL"""
        for skill_file in glob("skills/**/*.yml"):
            skill = self.parse_yaml(skill_file)
            self.skills[skill["name"]] = skill

    def execute_skill(self, skill_name, inputs):
        """执行 SKILL"""
        skill = self.skills[skill_name]

        # 1. 验证输入
        self.validate_inputs(skill, inputs)

        # 2. 执行依赖 SKILL
        for dep in skill.get("dependencies", []):
            self.execute_skill(dep, inputs)

        # 3. 执行步骤
        results = {}
        for step in skill["steps"]:
            results[step["name"]] = self.execute_step(step, inputs, results)

        # 4. 返回输出
        return self.format_outputs(skill["outputs"], results)

    def execute_step(self, step, inputs, previous_results):
        """执行单个步骤"""
        action = self.get_action(step["action"])
        params = self.resolve_params(step["params"], inputs, previous_results)
        return action.execute(**params)
```

### 在 Agent 中使用

```yaml
# agents/coordinator/requirement_analyst.yml

name: requirement_analyst
type: coordinator

# 使用的 SKILL 组合
skills:
  - requirements/user_interview
  - requirements/requirement_decomposition
  - requirements/acceptance_criteria_definition
  - design/api_design

# SKILL 调用顺序
workflow:
  - skill: requirements/user_interview
    output: interview_notes

  - skill: requirements/requirement_decomposition
    inputs:
      raw_requirement: "{{interview_notes.requirement}}"
    output: feature_list

  - skill: requirements/acceptance_criteria_definition
    inputs:
      feature_list: "{{feature_list}}"
    output: acceptance_criteria
```

---

## SKILL 注册表

```yaml
# skills/registry.yml

version: 1.0.0
last_updated: 2026-03-20

skills:
  # 需求分析类
  - name: user_interview
    path: requirements/user_interview.yml
    status: active

  - name: requirement_decomposition
    path: requirements/requirement_decomposition.yml
    status: active

  # 技术设计类
  - name: architecture_design
    path: design/architecture_design.yml
    status: active

  - name: api_design
    path: design/api_design.yml
    status: active

  # 开发实现类
  - name: frontend_development
    path: development/frontend_development.yml
    status: active

  - name: backend_development
    path: development/backend_development.yml
    status: active

  # 测试验证类
  - name: unit_test
    path: testing/unit_test.yml
    status: active

  # 运维部署类
  - name: docker_build
    path: devops/docker_build.yml
    status: active

  # 文档类
  - name: api_documentation
    path: documentation/api_documentation.yml
    status: active
```

---

## 快速开始

### 创建新 SKILL

```bash
# 1. 创建 SKILL 文件
mkdir -p skills/{category}
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
# 编辑 skills/registry.yml 添加新 SKILL

# 3. 测试 SKILL
./scripts/test-skill.sh {skill_name}
```

### 调用 SKILL

```bash
# 通过命令行调用
./scripts/execute-skill.sh {skill_name} --input key=value

# 在 Agent 配置中引用
# 见上方 Agent 示例
```

---

**维护者**: EKET Framework Team
