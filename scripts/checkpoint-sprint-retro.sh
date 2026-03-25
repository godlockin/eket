#!/bin/bash
# EKET Checkpoint/Sprint/Retrospective 机制 v0.5
# 实现任务检查点、Sprint 管理、回顾总结

# 不使用 set -e，避免在可恢复错误处退出

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置文件
CONFIG_FILE=".eket/config.yml"
STATE_DIR=".eket/state"
RETROSPECTIVE_DIR="confluence/projects/searcher/retrospectives"

# ==========================================
# 读取配置
# ==========================================

read_config() {
    if [ -f "$CONFIG_FILE" ]; then
        SPRINT_DURATION=$(grep -A 3 "sprint:" "$CONFIG_FILE" | grep "duration_days:" | cut -d':' -f2 | tr -d ' ' || echo "7")
        TASKS_PER_SPRINT=$(grep -A 3 "sprint:" "$CONFIG_FILE" | grep "tasks_per_sprint:" | cut -d':' -f2 | tr -d ' ' || echo "5")
        REVIEW_AFTER_SPRINTS=$(grep -A 3 "sprint:" "$CONFIG_FILE" | grep "review_after_sprints:" | cut -d':' -f2 | tr -d ' ' || echo "2")
    else
        SPRINT_DURATION=7
        TASKS_PER_SPRINT=5
        REVIEW_AFTER_SPRINTS=2
    fi
}

# ==========================================
# Checkpoint 管理
# ==========================================

create_checkpoint() {
    local checkpoint_type="$1"  # task_start, task_dev_complete, task_test_complete, task_complete
    local ticket_id="$2"
    local slaver_name="${3:-unknown}"

    local checkpoint_file="$STATE_DIR/checkpoints/${ticket_id}-${checkpoint_type}-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p "$STATE_DIR/checkpoints"

    echo -e "${BLUE}## 创建 Checkpoint: $checkpoint_type${NC}"

    case "$checkpoint_type" in
        task_start)
            create_task_start_checkpoint "$checkpoint_file" "$ticket_id" "$slaver_name"
            ;;
        task_dev_complete)
            create_task_dev_complete_checkpoint "$checkpoint_file" "$ticket_id" "$slaver_name"
            ;;
        task_test_complete)
            create_task_test_complete_checkpoint "$checkpoint_file" "$ticket_id" "$slaver_name"
            ;;
        task_complete)
            create_task_complete_checkpoint "$checkpoint_file" "$ticket_id" "$slaver_name"
            ;;
        *)
            echo -e "${RED}✗${NC} 未知 checkpoint 类型：$checkpoint_type"
            return 1
            ;;
    esac

    echo -e "${GREEN}✓${NC} Checkpoint 已创建：$checkpoint_file"
}

create_task_start_checkpoint() {
    local file="$1"
    local ticket_id="$2"
    local slaver_name="$3"

    cat > "$file" << EOF
# Checkpoint: Task Start

**Ticket**: $ticket_id
**Slaver**: $slaver_name
**时间**: $(date -Iseconds)

---

## 检查项

- [ ] 依赖检查完成
- [ ] 分支已创建
- [ ] 计时器已启动
- [ ] Confluence 文档已阅读

---

## 前置条件确认

1. **需求理解**: [确认任务目标]
2. **技术方案**: [确认技术实现方案]
3. **依赖资源**: [列出所需资源]

---

## 下一步计划

[Slaver 填写具体执行计划]

---

**状态**: checkpoint_recorded
EOF
}

create_task_dev_complete_checkpoint() {
    local file="$1"
    local ticket_id="$2"
    local slaver_name="$3"

    cat > "$file" << EOF
# Checkpoint: Task Dev Complete

**Ticket**: $ticket_id
**Slaver**: $slaver_name
**时间**: $(date -Iseconds)

---

## 检查项

- [ ] 单元测试通过
- [ ] Lint 检查通过
- [ ] 代码覆盖率检查
- [ ] 自测完成

---

## 开发成果

### 修改的文件

[列出修改的文件]

### 新增的功能

[描述新增功能]

---

## 下一步计划

- [ ] 创建 PR
- [ ] 请求 Review
- [ ] 准备测试

---

**状态**: ready_for_test
EOF
}

create_task_test_complete_checkpoint() {
    local file="$1"
    local ticket_id="$2"
    local slaver_name="$3"

    cat > "$file" << EOF
# Checkpoint: Task Test Complete

**Ticket**: $ticket_id
**Slaver**: $slaver_name
**时间**: $(date -Iseconds)

---

## 检查项

- [ ] E2E 测试通过
- [ ] 集成测试通过
- [ ] PR 已创建 (Draft)
- [ ] 测试报告已生成

---

## 测试结果

### 通过的测试

[列出通过的测试]

### 已知问题

[列出已知问题]

---

## 下一步计划

- [ ] 请求 Master Review
- [ ] 准备合并

---

**状态**: ready_for_review
EOF
}

create_task_complete_checkpoint() {
    local file="$1"
    local ticket_id="$2"
    local slaver_name="$3"

    cat > "$file" << EOF
# Checkpoint: Task Complete

**Ticket**: $ticket_id
**Slaver**: $slaver_name
**时间**: $(date -Iseconds)

---

## 检查项

- [ ] 所有功能点已验证
- [ ] 后续任务已创建
- [ ] 文档已更新
- [ ] PR 已合并

---

## 任务总结

### 完成的功能

[列出完成的功能]

### 未完成的功能 (如有)

[列出未完成的功能，将创建后续任务]

### 经验教训

[记录经验教训]

---

## 后续任务

[列出创建的后续任务]

---

**状态**: task_completed
EOF
}

# ==========================================
# Sprint 管理
# ==========================================

start_sprint() {
    local sprint_number="$1"
    local sprint_goal="$2"

    local sprint_file="$STATE_DIR/sprints/sprint-$sprint_number.md"
    mkdir -p "$STATE_DIR/sprints"

    local start_date=$(date -Iseconds)
    local end_date=$(date -Iseconds -d "+$SPRINT_DURATION days" 2>/dev/null || date -v+${SPRINT_DURATION}d -Iseconds 2>/dev/null)

    cat > "$sprint_file" << EOF
# Sprint $sprint_number

**目标**: $sprint_goal
**开始日期**: $start_date
**结束日期**: $end_date
**持续时间**: $SPRINT_DURATION 天
**计划任务数**: $TASKS_PER_SPRINT

---

## 计划任务

[领取任务后填写]

---

## 进度追踪

| 日期 | 完成任务 | 进行中任务 | 备注 |
|------|----------|------------|------|
| $(date +%Y-%m-%d) | | | Sprint 开始 |

---

## 每日站会

### Day 1 $(date +%Y-%m-%d)

- 昨日完成：
- 今日计划：
- 阻塞问题：

---

## Sprint 总结

[结束时填写]

---

**状态**: in_progress
EOF

    echo -e "${GREEN}✓${NC} Sprint $sprint_number 已启动"
    echo "  - 目标：$sprint_goal"
    echo "  - 开始：$start_date"
    echo "  - 结束：$end_date"
}

update_sprint_progress() {
    local sprint_number="$1"
    local completed_tasks="$2"
    local in_progress_tasks="$3"
    local notes="${4:-}"

    local sprint_file="$STATE_DIR/sprints/sprint-$sprint_number.md"

    if [ ! -f "$sprint_file" ]; then
        echo -e "${RED}✗${NC} Sprint 文件不存在：$sprint_file"
        return 1
    fi

    local today=$(date +%Y-%m-%d)
    local today_status="| $today | $completed_tasks | $in_progress_tasks | $notes |"

    # 添加今日进度到表格
    if grep -q "| 日期 |" "$sprint_file"; then
        sed -i '' "/| 日期 |/a\\
(today_status)" "$sprint_file" 2>/dev/null || \
        sed -i "/| 日期 |/a\\
(today_status)" "$sprint_file"
    fi

    echo -e "${GREEN}✓${NC} Sprint $sprint_number 进度已更新"
}

complete_sprint() {
    local sprint_number="$1"
    local summary="$2"

    local sprint_file="$STATE_DIR/sprints/sprint-$sprint_number.md"

    if [ ! -f "$sprint_file" ]; then
        echo -e "${RED}✗${NC} Sprint 文件不存在：$sprint_file"
        return 1
    fi

    # 更新状态
    sed -i '' "s/\*\*状态\*\*: in_progress/**状态**: completed/" "$sprint_file" 2>/dev/null || \
    sed -i "s/\*\*状态\*\*: in_progress/**状态**: completed/" "$sprint_file"

    # 添加总结
    cat >> "$sprint_file" << EOF

---

## Sprint 完成总结

**完成日期**: $(date -Iseconds)

### 完成的任务

$summary

### 未完成的任务

[列出未完成任务]

### Sprint 回顾

[记录 Sprint 回顾内容]

EOF

    echo -e "${GREEN}✓${NC} Sprint $sprint_number 已完成"

    # 检查是否需要进行回顾
    check_retrospective_needed "$sprint_number"
}

# ==========================================
# 回顾管理
# ==========================================

check_retrospective_needed() {
    local current_sprint="$1"

    # 检查是否是第 2 个 Sprint 的倍数
    if [ $((current_sprint % REVIEW_AFTER_SPRINTS)) -eq 0 ]; then
        echo -e "${YELLOW}⚠${NC} 已达成 $REVIEW_AFTER_SPRINTS 个 Sprint，需要进行回顾"
        create_retrospective_request "$current_sprint" "sprint_pair"
    fi
}

create_retrospective() {
    local type="$1"  # sprint_pair, stage
    local sprint_range="${2:-}"
    local stage_name="${3:-}"

    local retrospective_file="$RETROSPECTIVE_DIR/retrospective-$(date +%Y%m%d-%H%M%S).md"
    mkdir -p "$RETROSPECTIVE_DIR"

    echo -e "${BLUE}## 创建回顾报告：$type${NC}"

    cat > "$retrospective_file" << EOF
# 回顾报告

**类型**: $([ "$type" = "sprint_pair" ] && echo "Sprint 对回顾" || echo "Stage 回顾")
**时间**: $(date -Iseconds)
$([ "$type" = "sprint_pair" ] && echo "**Sprint 范围**: $sprint_range" || echo "**Stage 名称**: $stage_name")

---

## 回顾主题

### 1. 任务推进问题

**发生了什么**:
[描述任务推进过程中的问题]

**影响**:
[描述问题造成的影响]

**根本原因**:
[分析根本原因]

### 2. Review 流程问题

**发生了什么**:
[描述 Review 流程中的问题]

**影响**:
[描述问题造成的影响]

**根本原因**:
[分析根本原因]

### 3. 经验教训 (Lessons Learned)

**学到的经验**:
1. [经验 1]
2. [经验 2]

**教训**:
1. [教训 1]
2. [教训 2]

### 4. 框架改进建议

**需要改进的地方**:
1. [改进点 1]
2. [改进点 2]

**建议行动**:
1. [行动 1]
2. [行动 2]

---

## 行动计划

| 行动项 | 负责人 | 截止日期 | 状态 |
|--------|--------|----------|------|
| [行动 1] | | | pending |
| [行动 2] | | | pending |

---

## 参与人员

- [列出参与回顾的 AI 智能体/人类]

---

**状态**: pending_action_items
**下次回顾**: $([ "$type" = "sprint_pair" ] && echo "Sprint $((sprint_range + REVIEW_AFTER_SPRINTS)) 结束后" || echo "下一阶段结束后")
EOF

    echo -e "${GREEN}✓${NC} 回顾报告已创建：$retrospective_file"

    # 触发人类 Review
    trigger_retrospective_review "$retrospective_file" "$type"
}

trigger_retrospective_review() {
    local retrospective_file="$1"
    local type="$2"
    local review_file="inbox/human_feedback/retrospective-review-$(date +%Y%m%d-%H%M%S).md"

    mkdir -p "inbox/human_feedback"

    cat > "$review_file" << EOF
# 回顾报告 Review 请求

**时间**: $(date -Iseconds)
**类型**: $type
**报告**: $retrospective_file

---

## 回顾报告已完成

回顾报告包含以下内容：
1. 任务推进问题分析
2. Review 流程问题
3. 经验教训总结
4. 框架改进建议
5. 行动计划

---

## 请 Review 以下内容

1. 打开报告文件查看详细内容
2. 确认问题分析是否准确
3. 批准行动计划
4. 指派负责人和截止日期

---

**状态**: awaiting_human_review
EOF

    echo -e "${GREEN}✓${NC} Review 请求已创建：$review_file"
}

# ==========================================
# Stage 管理
# ==========================================

start_stage() {
    local stage_name="$1"
    local stage_goal="$2"

    local stage_file="$STATE_DIR/stages/${stage_name}.md"
    mkdir -p "$STATE_DIR/stages"

    cat > "$stage_file" << EOF
# Stage: $stage_name

**目标**: $stage_goal
**开始日期**: $(date -Iseconds)

---

## Stage 目标

[描述 Stage 的具体目标]

---

## 计划任务

[列出计划任务]

---

## Checkpoint 定义

本 Stage 包含以下 Checkpoint：
- [ ] Checkpoint 1: [描述]
- [ ] Checkpoint 2: [描述]
- [ ] Checkpoint 3: [描述]

---

## Sprint 计划

预计需要 $((TASKS_PER_SPRINT * 2)) 个任务，约 2 个 Sprint

---

## 进度追踪

[进度更新]

---

**状态**: in_progress
EOF

    echo -e "${GREEN}✓${NC} Stage $stage_name 已启动"
}

complete_stage() {
    local stage_name="$1"
    local summary="$2"

    local stage_file="$STATE_DIR/stages/${stage_name}.md"

    if [ ! -f "$stage_file" ]; then
        echo -e "${RED}✗${NC} Stage 文件不存在：$stage_file"
        return 1
    fi

    # 更新状态
    sed -i '' "s/\*\*状态\*\*: in_progress/**状态**: completed/" "$stage_file" 2>/dev/null || \
    sed -i "s/\*\*状态\*\*: in_progress/**状态**: completed/" "$stage_file"

    # 添加总结
    cat >> "$stage_file" << EOF

---

## Stage 完成总结

**完成日期**: $(date -Iseconds)

### 完成的任务

$summary

### 经验教训

[记录经验教训]

---

## 触发 Stage 回顾

EOF

    echo -e "${GREEN}✓${NC} Stage $stage_name 已完成"

    # 触发 Stage 回顾
    create_retrospective "stage" "" "$stage_name"
}

# ==========================================
# 入口
# ==========================================

read_config

case "${1:-help}" in
    checkpoint)
        create_checkpoint "$2" "$3" "$4"
        ;;
    sprint-start)
        start_sprint "$2" "$3"
        ;;
    sprint-progress)
        update_sprint_progress "$2" "$3" "$4" "$5"
        ;;
    sprint-complete)
        complete_sprint "$2" "$3"
        ;;
    retrospective)
        create_retrospective "$2" "$3" "$4"
        ;;
    stage-start)
        start_stage "$2" "$3"
        ;;
    stage-complete)
        complete_stage "$2" "$3"
        ;;
    *)
        echo "用法：$0 <command> [args]"
        echo ""
        echo "命令:"
        echo "  checkpoint <type> <ticket_id> <slaver_name>  - 创建检查点"
        echo "    类型：task_start, task_dev_complete, task_test_complete, task_complete"
        echo "  sprint-start <number> <goal>                 - 启动 Sprint"
        echo "  sprint-progress <number> <done> <progress>   - 更新 Sprint 进度"
        echo "  sprint-complete <number> <summary>           - 完成 Sprint"
        echo "  retrospective <type> [range] [stage]         - 创建回顾报告"
        echo "    类型：sprint_pair, stage"
        echo "  stage-start <name> <goal>                    - 启动 Stage"
        echo "  stage-complete <name> <summary>              - 完成 Stage"
        ;;
esac
