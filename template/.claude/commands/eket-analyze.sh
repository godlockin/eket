#!/bin/bash
# /eket-analyze - Master 实例分析需求并拆解任务

# 不使用 set -e，避免在可恢复错误处退出

# 动态路径配置 (v0.6.1)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "EKET 需求分析 v0.5"
echo "========================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# 检查实例角色
CONFIG_FILE=".eket/state/instance_config.yml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}✗${NC} 实例配置文件不存在"
    echo "请先运行 /eket-start 初始化实例"
    exit 1
fi

INSTANCE_ROLE=$(grep "^role:" "$CONFIG_FILE" 2>/dev/null | cut -d':' -f2 | tr -d ' "' || echo "null")

if [ "$INSTANCE_ROLE" != "master" ]; then
    echo -e "${RED}✗${NC} 当前实例不是 Master 角色"
    echo "当前角色：$INSTANCE_ROLE"
    echo "/eket-analyze 仅 Master 实例可用"
    exit 1
fi

echo -e "${GREEN}✓${NC} Master 实例已确认"
echo ""

# 检查需求输入
INPUT_FILE="inbox/human_input.md"

if [ ! -f "$INPUT_FILE" ]; then
    echo -e "${RED}✗${NC} 需求输入文件不存在：$INPUT_FILE"
    echo "请创建需求输入文件"
    exit 1
fi

# 检查需求内容
HAS_CONTENT=$(grep -v "^#" "$INPUT_FILE" | grep -v "^$" | grep -v "^---" | wc -l | tr -d ' ')

if [ "$HAS_CONTENT" -lt 5 ]; then
    echo -e "${YELLOW}⚠${NC} 需求内容不完整 (当前 $HAS_CONTENT 行，建议至少 5 行)"
    echo "请补充项目愿景、目标用户、核心功能等信息"
    echo ""
    echo "当前内容:"
    head -20 "$INPUT_FILE"
    exit 1
fi

echo -e "${BLUE}## 步骤 1: 读取需求输入${NC}"
echo ""
echo "需求文件：$INPUT_FILE"
echo "内容摘要:"
echo "┌──────────────────────────────────────────────────────────────┐"
head -15 "$INPUT_FILE" | sed 's/^/│  /'
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 需求分析
echo -e "${BLUE}## 步骤 2: 需求分析（加载需求整理 Skills）${NC}"
echo ""
echo "正在加载 Skills:"
echo "  - requirements/user_interview"
echo "  - requirements/requirement_decomposition"
echo "  - requirements/acceptance_criteria_definition"
echo ""
echo "正在分析需求..."
echo ""

# 创建需求分析文档
ANALYSIS_DIR="confluence/projects/requirements"
mkdir -p "$ANALYSIS_DIR"

ANALYSIS_FILE="$ANALYSIS_DIR/requirements_analysis_$(date +%Y%m%d_%H%M%S).md"

cat > "$ANALYSIS_FILE" << EOF
# 需求分析报告

**生成时间**: $(date -Iseconds)
**分析者**: Master Agent (Product Manager)
**状态**: analysis

---

## 项目愿景

<!-- 基于人类输入整理 -->

## 目标用户

<!-- 分析目标用户群体 -->

## 核心功能列表

<!-- 从需求中提取的核心功能 -->

## 非功能需求

- 性能要求
- 安全要求
- 可扩展性要求

## 技术栈建议

<!-- 基于需求的技术选型建议 -->

## 风险与约束

- 技术风险
- 时间约束
- 资源约束

---

## 下一步

- [ ] 创建 Epic 文档
- [ ] 拆解为 Jira tickets
- [ ] 设定优先级和依赖关系
EOF

echo -e "${GREEN}✓${NC} 需求分析文档已创建：$ANALYSIS_FILE"
echo ""

# 任务拆解
echo -e "${BLUE}## 步骤 3: 任务拆解${NC}"
echo ""

# 创建 Epic
EPICS_DIR="jira/epics"
mkdir -p "$EPICS_DIR"

EPIC_FILE="$EPICS_DIR/EPIC-$(date +%Y%m%d).md"
EPIC_ID="EPIC-$(date +%Y%m%d)"

cat > "$EPIC_FILE" << EOF
# $EPIC_ID: 核心功能开发

**状态**: approved
**优先级**: high
**创建时间**: $(date -Iseconds)

---

## 描述

基于需求分析，创建核心功能开发 Epic。

## 目标

- [ ] 完成基础架构搭建
- [ ] 实现核心功能
- [ ] 完成测试验证

## 验收标准

- 所有功能 tickets 完成
- 测试覆盖率达标
- 通过代码 Review

## 相关 Tickets

<!-- 任务拆解后在此列出 -->
EOF

echo -e "${GREEN}✓${NC} Epic 已创建：$EPIC_FILE"
echo ""

# 创建示例 Tickets
TICKETS_DIR="jira/tickets/feature"
mkdir -p "$TICKETS_DIR"

# 生成示例 ticket
SAMPLE_TICKET="$TICKETS_DIR/FEAT-$(date +%Y%m%d)-001.md"

cat > "$SAMPLE_TICKET" << EOF
# FEAT-$(date +%Y%m%d)-001: 项目初始化

**创建时间**: $(date -Iseconds)
**创建者**: Master Agent
**重要性**: high
**优先级**: P1
**状态**: ready
**标签**: \`feature\`, \`setup\`
**Epic**: $EPIC_ID
**分配给**: null

---

## 0. 任务元数据

### 0.1 重要性说明
high: 重要功能，影响核心体验

### 0.2 优先级说明
P1: 高优先级功能

### 0.3 依赖关系
\`\`\`yaml
blocks: []
blocked_by: []
related: []
external: []
\`\`\`

### 0.4 背景信息
项目初始化是基础任务，为后续开发提供环境和配置支持。

### 0.5 技能要求
- git
- project_setup

### 0.6 预估工时
2h

---

## 1. 验收标准

- [ ] 创建项目目录结构
- [ ] 配置 Git 仓库
- [ ] 初始化配置文件
- [ ] 创建基础文档

## 2. 技术说明

使用框架推荐的项目结构。

## 3. 状态流转记录

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| $(date -Iseconds) | backlog → ready | Master | 初始创建 |
EOF

echo -e "${GREEN}✓${NC} 示例 Ticket 已创建：$SAMPLE_TICKET"
echo ""

# 更新 Jira 状态
STATE_DIR="jira/state"
mkdir -p "$STATE_DIR"

cat > "$STATE_DIR/active_tasks.json" << EOF
{
  "last_updated": "$(date -Iseconds)",
  "epics": [
    {
      "id": "$EPIC_ID",
      "status": "approved",
      "ticket_count": 1
    }
  ],
  "ready_tickets": [
    {
      "id": "FEAT-$(date +%Y%m%d)-001",
      "title": "项目初始化",
      "priority": "high",
      "status": "ready"
    }
  ]
}
EOF

echo -e "${GREEN}✓${NC} Jira 状态已更新"
echo ""

# 总结
echo "┌──────────────────────────────────────────────────────────────┐"
echo "│  需求分析完成                                                │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│  产出物：                                                    │"
echo "│  - 需求分析文档：$ANALYSIS_FILE                    │"
echo "│  - Epic: $EPIC_FILE                           │"
echo "│  - 示例 Ticket: $SAMPLE_TICKET                 │"
echo "│                                                              │"
echo "│  下一步：                                                    │"
echo "│  - Slaver 实例可运行 /eket-claim 领取任务                      │"
echo "│  - 或等待更多 tickets 创建完成                                │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

echo "========================================"
echo "需求分析完成"
echo "========================================"
