# EKET Agent 配置文件系统

**版本**: 0.2.0
**日期**: 2026-03-20

---

## 概述

每个智能体由独立的 YAML 配置文件定义，包含智能体的职责、技能、决策策略和生命周期配置。

---

## 基础模板

```yaml
# agents/agent_base_template.yml

name: agent_name
type: coordinator|executor
version: 1.0.0
description: 简短描述

# 职责范围
responsibilities:
  - 职责 1
  - 职责 2

# 使用的技能组合
skills:
  - category/skill_name
  - category/skill_name

# 输入格式定义
inputs:
  - type: jira_ticket
    fields: [title, description, acceptance_criteria]
  - type: message
    format: json_schema_ref
  - type: file
    path: inbox/human_input.md

# 输出格式定义
outputs:
  - type: jira_transition
    action: transition_ticket
  - type: pull_request
    format: github_pr
  - type: message
    format: json_schema_ref
  - type: file
    path: confluence/requirements/

# 决策策略
decision_policy:
  auto_decide: true|false
  auto_decide_scope:
    - 允许自主决策的场景
  escalation_rules:
    - condition: 条件
      escalate_to: 目标智能体
      reason: 原因

# 生命周期配置
lifecycle:
  mode: persistent|on_demand
  spawn_method: process|thread
  wakeup_triggers:
    - type: message
      from: 来源智能体
    - type: ticket_assigned
      ticket_type: 票类型
  sleep_after: 完成任务后休眠时间
```

---

## 协调智能体配置

### 需求分析师

```yaml
# agents/coordinators/requirement_analyst.yml

name: requirement_analyst
type: coordinator
version: 1.0.0
description: 负责与人类沟通，收集和分析用户需求，拆解为可执行的任务

responsibilities:
  - 与人类沟通，收集需求
  - 将模糊需求拆解为可执行的 Jira tickets
  - 定义验收标准
  - 回答执行智能体关于需求的疑问
  - 更新 Confluence 需求文档

skills:
  - requirements/user_interview
  - requirements/requirement_decomposition
  - requirements/acceptance_criteria_definition
  - documentation/technical_doc

inputs:
  - type: file
    path: inbox/human_input.md
  - type: message
    from: human
  - type: jira_ticket
    ticket_type: [EPIC, REQUIREMENT]

outputs:
  - type: jira_ticket
    ticket_type: [FEATURE, TASK]
  - type: file
    path: confluence/projects/{project}/requirements/
  - type: message
    to: [tech_manager, project_manager]

decision_policy:
  auto_decide: true
  auto_decide_scope:
    - 需求拆解方式
    - 验收标准定义
    - 需求文档组织
  escalation_rules:
    - condition: 需求涉及重大商业决策
      escalate_to: human
      reason: 需要人类商业决策
    - condition: 需求之间存在矛盾
      escalate_to: project_manager
      reason: 需要优先级协调
    - condition: 需求不明确无法拆解
      escalate_to: human
      reason: 需要需求澄清

lifecycle:
  mode: persistent
  spawn_method: process
  wakeup_triggers:
    - type: file_created
      path: inbox/human_input.md
    - type: message
      from: human
    - type: ticket_created
      ticket_type: [EPIC, REQUIREMENT]
  poll_interval_seconds: 30
```

### 技术经理

```yaml
# agents/coordinators/tech_manager.yml

name: tech_manager
type: coordinator
version: 1.0.0
description: 负责技术方案设计、架构决策、Code Review

responsibilities:
  - 技术方案设计和审核
  - 架构决策
  - Code Review（架构一致性、技术选型）
  - 解决技术争议
  - 更新 Confluence 架构文档

skills:
  - design/architecture_design
  - design/api_design
  - documentation/technical_doc

inputs:
  - type: jira_ticket
    ticket_type: [FEATURE, TASK]
    status: [design, review]
  - type: message
    from: [executor, requirement_analyst]
  - type: pull_request
    action: created

outputs:
  - type: jira_transition
    action: transition_ticket
  - type: pull_request_review
    action: [approve, request_changes]
  - type: file
    path: confluence/projects/{project}/architecture/
  - type: message
    to: [executor, project_manager]

decision_policy:
  auto_decide: true
  auto_decide_scope:
    - 技术方案选择
    - 代码审查意见
    - 技术文档组织
  escalation_rules:
    - condition: 重大架构变更
      escalate_to: human
      reason: 需要人类批准
    - condition: 技术选型影响预算
      escalate_to: human
      reason: 需要预算审批
    - condition: 技术争议无法解决
      escalate_to: human
      reason: 需要最终决策

lifecycle:
  mode: persistent
  spawn_method: process
  wakeup_triggers:
    - type: pull_request
      action: [created, updated]
    - type: ticket_status_change
      status: [design, review]
    - type: message
      from: [executor, requirement_analyst]
  poll_interval_seconds: 60
```

### 项目经理

```yaml
# agents/coordinators/project_manager.yml

name: project_manager
type: coordinator
version: 1.0.0
description: 负责任务优先级管理、资源协调、进度跟踪

responsibilities:
  - 任务优先级管理
  - 资源协调
  - 进度跟踪
  - 跨模块协调
  - 生成项目报告

skills:
  - requirements/requirement_decomposition
  - documentation/release_notes

inputs:
  - type: jira_ticket
    ticket_type: [EPIC, FEATURE, TASK]
  - type: message
    from: [requirement_analyst, tech_manager, executor]
  - type: file
    path: jira/state/progress.json

outputs:
  - type: jira_transition
    action: transition_ticket
  - type: message
    to: [requirement_analyst, tech_manager, executor]
  - type: file
    path: jira/index/by-status/

decision_policy:
  auto_decide: true
  auto_decide_scope:
    - 任务优先级调整
    - 资源分配
    - 进度报告生成
  escalation_rules:
    - condition: 项目延期风险
      escalate_to: human
      reason: 需要人类介入
    - condition: 资源不足
      escalate_to: human
      reason: 需要增加资源
    - condition: 跨模块协调困难
      escalate_to: human
      reason: 需要人类协调

lifecycle:
  mode: persistent
  spawn_method: process
  wakeup_triggers:
    - type: ticket_created
      ticket_type: [EPIC, FEATURE, TASK]
    - type: ticket_status_change
    - type: scheduled
      cron: "0 * * * *"  # 每小时
  poll_interval_seconds: 300
```

### 文档监控员

```yaml
# agents/coordinators/doc_monitor.yml

name: doc_monitor
type: coordinator
version: 1.0.0
description: 监控文档完整性，确保代码变更有对应文档更新

responsibilities:
  - 监控文档完整性
  - 确保代码变更有对应文档更新
  - 维护 Confluence 结构
  - 生成项目报告
  - 归档项目记忆

skills:
  - documentation/api_documentation
  - documentation/user_guide
  - documentation/release_notes

inputs:
  - type: pull_request
    action: merged
  - type: file
    path: confluence/
  - type: message
    from: [requirement_analyst, tech_manager]

outputs:
  - type: jira_ticket
    ticket_type: TASK
    description: 文档更新任务
  - type: file
    path: confluence/
  - type: message
    to: [project_manager, human]

decision_policy:
  auto_decide: true
  auto_decide_scope:
    - 文档缺失检测
    - 文档更新任务创建
    - 文档归档
  escalation_rules:
    - condition: 文档质量持续不达标
      escalate_to: project_manager
      reason: 需要改进流程

lifecycle:
  mode: persistent
  spawn_method: process
  wakeup_triggers:
    - type: pull_request
      action: merged
    - type: scheduled
      cron: "0 0 * * *"  # 每天
  poll_interval_seconds: 600
```

---

## 执行智能体配置

### 执行者注册表

```yaml
# agents/executors/executor_registry.yml

registry_version: 1.0.0
last_updated: 2026-03-20

executors:
  - agent_type: designer
    config_file: agents/executors/designer.yml
    capabilities: [ui-design, ux-design, icon-design, design-system]
    status: available
    current_ticket: null

  - agent_type: frontend_dev
    config_file: agents/executors/frontend_dev.yml
    capabilities: [react, vue, typescript, css, javascript]
    status: available
    current_ticket: null

  - agent_type: backend_dev
    config_file: agents/executors/backend_dev.yml
    capabilities: [python, nodejs, java, api-design, database]
    status: available
    current_ticket: null

  - agent_type: tester
    config_file: agents/executors/tester.yml
    capabilities: [unit-test, e2e-test, integration-test]
    status: available
    current_ticket: null

  - agent_type: devops
    config_file: agents/executors/devops.yml
    capabilities: [docker, k8s, ci-cd, monitoring]
    status: available
    current_ticket: null
```

### 前端开发

```yaml
# agents/executors/frontend_dev.yml

name: frontend_dev
type: executor
version: 1.0.0
description: 负责前端界面实现

responsibilities:
  - 根据设计稿实现前端界面
  - 编写前端单元测试
  - 修复前端缺陷
  - 优化前端性能

skills:
  - development/frontend_development
  - development/test_development
  - testing/unit_test

inputs:
  - type: jira_ticket
    ticket_type: FEATURE
    label: frontend
  - type: file
    path: confluence/design/
  - type: message
    from: tech_manager

outputs:
  - type: file
    path: code_repo/src/frontend/
  - type: pull_request
    target_branch: testing
  - type: jira_transition
    action: transition_ticket

decision_policy:
  auto_decide: true
  auto_decide_scope:
    - 组件实现方式
    - 代码组织结构
    - 单元测试编写
  escalation_rules:
    - condition: 技术选型不确定
      escalate_to: tech_manager
      reason: 需要技术指导
    - condition: 需求不明确
      escalate_to: requirement_analyst
      reason: 需要需求澄清
    - condition: 任务复杂度超出预估
      escalate_to: project_manager
      reason: 需要重新评估

lifecycle:
  mode: on_demand
  spawn_method: thread
  wakeup_triggers:
    - type: ticket_assigned
      ticket_type: FEATURE
      label: frontend
    - type: message
      from: tech_manager
  sleep_after: task_completed
```

### 后端开发

```yaml
# agents/executors/backend_dev.yml

name: backend_dev
type: executor
version: 1.0.0
description: 负责后端逻辑实现

responsibilities:
  - 实现 API 接口
  - 实现业务逻辑
  - 数据库设计和迁移
  - 修复后端缺陷
  - 优化数据库查询

skills:
  - development/backend_development
  - design/database_design
  - design/api_design
  - testing/unit_test

inputs:
  - type: jira_ticket
    ticket_type: FEATURE
    label: backend
  - type: file
    path: confluence/design/api/
  - type: message
    from: tech_manager

outputs:
  - type: file
    path: code_repo/src/backend/
  - type: file
    path: code_repo/deployments/docker/
  - type: pull_request
    target_branch: testing
  - type: jira_transition
    action: transition_ticket

decision_policy:
  auto_decide: true
  auto_decide_scope:
    - API 实现方式
    - 数据库查询优化
    - 单元测试编写
  escalation_rules:
    - condition: 数据库 Schema 变更
      escalate_to: tech_manager
      reason: 需要架构审批
    - condition: 需求不明确
      escalate_to: requirement_analyst
      reason: 需要需求澄清
    - condition: 任务复杂度超出预估
      escalate_to: project_manager
      reason: 需要重新评估

lifecycle:
  mode: on_demand
  spawn_method: thread
  wakeup_triggers:
    - type: ticket_assigned
      ticket_type: FEATURE
      label: backend
    - type: message
      from: tech_manager
  sleep_after: task_completed
```

---

## Agent 加载机制

```python
# runtime/agent_loader.py

import yaml
from pathlib import Path

class AgentLoader:
    def __init__(self):
        self.agents = {}
        self.registry = {}

    def load_agent(self, agent_name: str) -> dict:
        """加载单个 Agent 配置"""
        # 先查找协调者
        config_path = Path(f"agents/coordinators/{agent_name}.yml")
        if not config_path.exists():
            # 再查找执行者
            config_path = Path(f"agents/executors/{agent_name}.yml")

        if not config_path.exists():
            raise ValueError(f"Agent {agent_name} not found")

        with open(config_path) as f:
            return yaml.safe_load(f)

    def load_executors(self) -> list:
        """加载所有执行者"""
        registry_path = Path("agents/executors/executor_registry.yml")
        with open(registry_path) as f:
            self.registry = yaml.safe_load(f)

        executors = []
        for executor in self.registry["executors"]:
            config = self.load_agent(executor["agent_type"])
            executors.append(config)

        return executors

    def load_coordinators(self) -> list:
        """加载所有协调者"""
        coordinators = []
        for config_path in Path("agents/coordinators/").glob("*.yml"):
            with open(config_path) as f:
                config = yaml.safe_load(f)
                coordinators.append(config)

        return coordinators

    def get_agent_for_task(self, ticket_type: str, label: str = None) -> str:
        """根据任务类型选择合适的 Agent"""
        executors = self.load_executors()

        for executor in executors:
            # 检查能力匹配
            if self._matches_capability(executor, label):
                return executor["name"]

        # 无匹配时返回通用执行者
        return "generic_executor"

    def _matches_capability(self, executor: dict, label: str) -> bool:
        """检查 Agent 能力是否匹配"""
        capabilities = executor.get("capabilities", [])
        return label in capabilities
```

---

**维护者**: EKET Framework Team
