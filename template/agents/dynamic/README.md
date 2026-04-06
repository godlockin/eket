# 动态 Agent 机制

**版本**: v2.0.0
**最后更新**: 2026-04-06

---

## 概述

动态 Agent 机制允许系统根据项目实际情况和需求，动态创建和加载特定领域专家 Agent，补充静态 Agent 之外的业务能力。

### 与静态 Agent 的区别

| 特性 | 静态 Agent | 动态 Agent |
|------|----------|----------|
| **创建时机** | 系统初始化时预定义 | 运行时按需创建 |
| **生命周期** | 长期存在 | 任务完成后可能销毁 |
| **用途** | 通用能力 (开发/测试/运维) | 领域特定能力 (业务专家) |
| **配置来源** | `template/agents/` | 动态生成 + 模板 |
| **示例** | frontend_dev, backend_dev | operation_expert, marketing_expert |

---

## 动态 Agent 类型

### 1. 业务领域专家

| Agent | 用途 | 触发条件 |
|------|------|---------|
| `operation_expert` | 运营流程、数据分析 | 任务标签包含 `operation`, `analytics` |
| `marketing_expert` | 市场营销、品牌推广 | 任务标签包含 `marketing`, `branding` |
| `legal_expert` | 法律合规、合同审查 | 任务标签包含 `legal`, `compliance` |
| `finance_expert` | 财务分析、成本核算 | 任务标签包含 `finance`, `billing` |

### 2. 技术领域专家

| Agent | 用途 | 触发条件 |
|------|------|---------|
| `ml_engineer` | 机器学习模型训练 | 任务标签包含 `ml`, `model-training` |
| `data_engineer` | 数据管道、ETL | 任务标签包含 `data-pipeline`, `etl` |
| `security_expert` | 安全审计、渗透测试 | 任务标签包含 `security`, `audit` |
| `performance_expert` | 性能优化 | 任务标签包含 `performance`, `optimization` |

---

## 动态 Agent 创建流程

```
1. 任务分析
   │
   ▼
2. 检测是否需要特殊领域专家
   │
   ├───────┐
   │       │
   ▼       ▼
需要    不需要
│       │
│       └──► 使用静态 Agent
▼
3. 查找已有动态 Agent
   │
   ├───────┐
   │       │
   ▼       ▼
已有    没有
│       │
│       ▼
│    4. 创建新 Agent
│       │
│       ▼
│    5. 注册到 Agent Registry
│       │
└───────┘
        │
        ▼
6. 分配任务给 Agent
```

---

## Agent Profile 动态生成

### 模板结构

```yaml
# 动态 Agent 配置模板
name: {agent_type}_expert
type: executor
version: 1.0.0
description: {domain} 领域专家

personality:
  mbti: {mbti_type}
  work_style:
    - {work_style_1}
    - {work_style_2}
  communication_style:
    tone: {tone}
    detail_level: {detail_level}
  decision_style:
    risk_tolerance: {risk_tolerance}
    analysis_depth: {analysis_depth}

responsibilities:
  - {responsibility_1}
  - {responsibility_2}

skills:
  - {skill_1}
  - {skill_2}

inputs:
  - type: jira_ticket
    labels: [{domain_label}]

outputs:
  - type: jira_transition
    action: transition_ticket

decision_policy:
  auto_decide: true
  escalation_rules:
    - condition: domain_expertise_required
      action: escalate_to
      target: tech_manager

lifecycle:
  mode: on_demand
  spawn_method: thread
  auto_shutdown:
    enabled: true
    idle_timeout: 600  # 10 分钟无任务自动销毁
```

---

## Agent Registry 动态更新

### 注册表结构

```yaml
# .eket/state/agent_registry.yml
version: 1.0.0
last_updated: 2026-03-23T10:30:00Z

# 静态 Agent (预定义)
static_agents:
  - name: frontend_dev
    type: executor
    status: available
    config: agents/executor/frontend_dev/agent.yml

  - name: backend_dev
    type: executor
    status: available
    config: agents/executor/backend_dev/agent.yml

# 动态 Agent (运行时创建)
dynamic_agents:
  - name: operation_expert_001
    type: executor
    domain: operation
    status: available
    created_at: 2026-03-23T10:30:00Z
    config: .eket/state/dynamic_agents/operation_expert_001.yml
    active_ticket: null
    idle_timeout: 600

  - name: ml_engineer_001
    type: executor
    domain: machine_learning
    status: busy
    created_at: 2026-03-23T09:15:00Z
    config: .eket/state/dynamic_agents/ml_engineer_001.yml
    active_ticket: ML-001
    idle_timeout: 900
```

---

## 动态 Agent 加载脚本

```bash
#!/bin/bash
# scripts/load-dynamic-agent.sh

AGENT_TYPE=$1
TICKET_LABELS=$2

# 检查是否已有相同领域的动态 Agent
EXISTING_AGENT=$(grep -l "domain: $AGENT_TYPE" .eket/state/dynamic_agents/*.yml 2>/dev/null)

if [ -n "$EXISTING_AGENT" ]; then
    echo "找到已有 Agent: $EXISTING_AGENT"
    # 检查是否空闲
    STATUS=$(grep "status:" "$EXISTING_AGENT" | cut -d: -f2 | tr -d ' ')
    if [ "$STATUS" = "available" ]; then
        echo "使用现有 Agent"
        echo "$EXISTING_AGENT"
        exit 0
    fi
fi

# 创建新 Agent
echo "创建新的动态 Agent: ${AGENT_TYPE}_expert"

# 从模板生成配置
TEMPLATE="template/agents/dynamic/${AGENT_TYPE}_template.yml"
if [ ! -f "$TEMPLATE" ]; then
    # 使用通用模板
    TEMPLATE="template/agents/dynamic/generic_expert_template.yml"
fi

# 生成配置文件
OUTPUT=".eket/state/dynamic_agents/${AGENT_TYPE}_expert_$(date +%s).yml"
cp "$TEMPLATE" "$OUTPUT"

# 更新注册表
echo "- name: ${AGENT_TYPE}_expert" >> .eket/state/agent_registry.yml
echo "  type: executor" >> .eket/state/agent_registry.yml
echo "  domain: $AGENT_TYPE" >> .eket/state/agent_registry.yml
echo "  status: available" >> .eket/state/agent_registry.yml

echo "$OUTPUT"
```

---

## 使用示例

### 场景 1: 运营数据分析任务

**输入 Ticket**:
```markdown
---
id: OPS-001
title: 分析用户留存数据
labels: [operation, analytics, data-analysis]
---
```

**处理流程**:
1. 调度器检测到 `operation` 标签
2. 查找 `operation_expert` 动态 Agent
3. 不存在则创建 `operation_expert_001`
4. 分配任务 OPS-001

### 场景 2: 机器学习模型训练

**输入 Ticket**:
```markdown
---
id: ML-001
title: 训练用户行为预测模型
labels: [ml, model-training, python]
---
```

**处理流程**:
1. 调度器检测到 `ml` 标签
2. 查找 `ml_engineer` 动态 Agent
3. 创建 `ml_engineer_001`
4. 加载相关 Skills: `ml/model_training`, `data/preprocessing`
5. 分配任务 ML-001

---

## 动态 Agent 销毁

### 自动销毁条件

- 空闲时间超过 `idle_timeout` (默认 10 分钟)
- 任务完成且无新任务匹配
- 系统资源紧张时触发清理

### 销毁流程

```bash
#!/bin/bash
# scripts/cleanup-idle-agents.sh

TIMEOUT=${1:-600}  # 默认 10 分钟

for agent_file in .eket/state/dynamic_agents/*.yml; do
    # 检查状态
    STATUS=$(grep "status:" "$agent_file" | cut -d: -f2 | tr -d ' ')
    if [ "$STATUS" = "available" ]; then
        # 检查空闲时间
        LAST_ACTIVE=$(grep "last_active:" "$agent_file" | cut -d: -f2 | tr -d ' ')
        CURRENT=$(date +%s)
        IDLE_TIME=$((CURRENT - LAST_ACTIVE))

        if [ $IDLE_TIME -gt $TIMEOUT ]; then
            echo "销毁空闲 Agent: $agent_file (空闲 ${IDLE_TIME}s)"
            rm "$agent_file"
            # 从注册表移除
            # ...
        fi
    fi
done
```

---

## 配置动态 Agent 模板

### 运营专家模板

```yaml
# template/agents/dynamic/operation_template.yml

name: operation_expert
type: executor
version: 1.0.0
description: 运营数据分析专家

personality:
  mbti: ISTJ  # 物流师型 - 注重数据细节
  work_style:
    - 数据驱动
    - 逻辑严密
  communication_style:
    tone: 专业且简洁
    detail_level: medium
  decision_style:
    risk_tolerance: low
    analysis_depth: thorough

responsibilities:
  - 分析用户行为数据
  - 生成运营报告
  - 提供数据洞察建议

skills:
  - data/analysis
  - data/visualization
  - reporting/dashboard

inputs:
  - type: jira_ticket
    labels: [operation, analytics]
  - type: file
    path: data/*.csv

outputs:
  - type: jira_transition
    action: transition_ticket
  - type: file
    destination: confluence/reports/

lifecycle:
  mode: on_demand
  auto_shutdown:
    enabled: true
    idle_timeout: 600
```

---

**维护者**: EKET Framework Team
