#!/bin/bash
# /eket-review-merge - EKET Review 和 Merge 流程脚本
#
# 用途：当任务开发完成后，进行 Review 并根据结果创建后续任务
# - Review 通过 → 创建测试和修复任务
# - Review 不通过 → 创建修改任务

set -e

# 路径配置 (v0.5.2)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# ==========================================
# 使用说明
# ==========================================
usage() {
    echo "用法：/eket-review-merge <task-id> [--merge | --no-merge]"
    echo ""
    echo "选项:"
    echo "  --merge     执行合并流程 (Review 通过后)"
    echo "  --no-merge  仅进行 Review，不执行合并"
    echo ""
    echo "流程:"
    echo "  1. 检查任务状态"
    echo "  2. 进行 Review (自动/手动)"
    echo "  3. Review 通过 → 提示用户是否需要合并"
    echo "  4. Review 不通过 → 创建修改任务"
    echo "  5. 合并完成 → 创建测试和修复任务"
    echo ""
    exit 1
}

if [ $# -lt 1 ]; then
    usage
fi

TASK_ID=$1
DO_MERGE=false

if [ "$2" = "--merge" ]; then
    DO_MERGE=true
fi

echo "========================================"
echo "EKET Review + Merge 流程"
echo "========================================"
echo ""
echo "任务 ID: $TASK_ID"
echo "合并模式：$([ "$DO_MERGE" = true ] && echo "是" || echo "否")"
echo ""

# ==========================================
# 步骤 1: 查找任务文件
# ==========================================
echo -e "${BLUE}## 步骤 1: 查找任务文件${NC}"
echo ""

TASK_FILE=""
for dir in "jira/tickets/feature" "jira/tickets/bugfix" "jira/tickets/task" "tasks"; do
    if [ -f "$dir/${TASK_ID}.md" ]; then
        TASK_FILE="$dir/${TASK_ID}.md"
        break
    fi
done

if [ -z "$TASK_FILE" ]; then
    echo -e "${RED}✗${NC} 未找到任务文件：$TASK_ID"
    exit 1
fi

echo -e "${GREEN}✓${NC} 找到任务文件：$TASK_FILE"
echo ""

# ==========================================
# 步骤 2: 读取任务信息
# ==========================================
echo -e "${BLUE}## 步骤 2: 读取任务信息${NC}"
echo ""

TITLE=$(grep "^title:" "$TASK_FILE" 2>/dev/null | cut -d':' -f2 | xargs)
STATUS=$(grep "^status:" "$TASK_FILE" 2>/dev/null | cut -d' ' -f2)
BRANCH=$(grep "^branch:" "$TASK_FILE" 2>/dev/null | cut -d':' -f2 | xargs)

echo "任务标题：$TITLE"
echo "当前状态：$STATUS"
echo "开发分支：${BRANCH:-未指定}"
echo ""

# ==========================================
# 步骤 3: 检查任务是否可 Review
# ==========================================
echo -e "${BLUE}## 步骤 3: 检查 Review 前置条件${NC}"
echo ""

# 检查是否有 Review 请求文件
PR_FILE=""
for pr_file in "outbox/review_requests/PR-${TASK_ID}-"*.md "outbox/review_requests/${TASK_ID}-"*.md; do
    if [ -f "$pr_file" ]; then
        PR_FILE="$pr_file"
        break
    fi
done

if [ -n "$PR_FILE" ]; then
    echo -e "${GREEN}✓${NC} PR 文件已创建：$PR_FILE"
else
    echo -e "${YELLOW}○${NC} 未找到 PR 文件，Review 无法进行"
    echo ""
    echo "请先创建 PR 请求文件，或运行:"
    echo "  /eket-review $TASK_ID"
    exit 1
fi

# ==========================================
# 步骤 4: Review 决策
# ==========================================
echo -e "${BLUE}## 步骤 4: Review 决策${NC}"
echo ""

echo "┌──────────────────────────────────────────────────────────────┐"
echo "│              Review 评审                                      │"
echo "├──────────────────────────────────────────────────────────────┤"
echo "│  PR 文件：$(basename "$PR_FILE")"
echo "│                                                              │"
echo "│  请选择 Review 结果：                                        │"
echo "│  1. Review 通过 - 继续合并流程                               │"
echo "│  2. Review 不通过 - 需要修改                                 │"
echo "└──────────────────────────────────────────────────────────────┘"
echo ""

# 自动模式：直接提示用户
echo -e "${YELLOW}请用户确认 Review 结果:${NC}"
echo ""
echo "  ${GREEN}[1]${NC} Review 通过 - 继续合并"
echo "  ${RED}[2]${NC} Review 不通过 - 需要修改"
echo ""
read -p "请选择 (1/2): " REVIEW_CHOICE

if [ "$REVIEW_CHOICE" = "2" ]; then
    # ==============================
    # Review 不通过 - 创建修改任务
    # ==============================
    echo ""
    echo -e "${BLUE}## 创建修改任务${NC}"
    echo ""

    read -p "请输入需要修改的内容描述： " FIX_DESC

    FIX_TASK_ID="FIX-${TASK_ID}-$(date +%Y%m%d%H%M%S)"
    FIX_FILE="jira/tickets/task/${FIX_TASK_ID}.md"

    mkdir -p "$(dirname "$FIX_FILE")"

    cat > "$FIX_FILE" << EOF
title: ${TITLE} - Review 修复
status: ready
priority: high
labels: fix,review
dependencies: [$TASK_ID]
estimated_hours: 2
description: |
  Review 反馈需要修改:

  $FIX_DESC

## 修改内容

- [ ] 根据 Review 反馈进行修改
- [ ] 重新提交 PR
- [ ] 请求再次 Review

## Review 反馈

详见 Review 报告

EOF

    echo -e "${GREEN}✓${NC} 已创建修改任务：$FIX_FILE"
    echo ""
    echo "任务 ID: $FIX_TASK_ID"
    echo "状态：ready (等待领取)"
    echo ""

    # 更新原任务状态
    sed -i "s/^status: .*/status: review_failed/" "$TASK_FILE"
    echo "原任务状态已更新：review_failed"

    echo ""
    echo "========================================"
    echo "Review 流程完成 (需要修改)"
    echo "========================================"
    exit 0
fi

# ================================
# Review 通过 - 继续合并流程
# ================================
echo ""
echo -e "${GREEN}✓${NC} Review 通过，准备合并流程"
echo ""

# 更新任务状态
sed -i "s/^status: .*/status: review_approved/" "$TASK_FILE"
echo "任务状态已更新：review_approved"
echo ""

# ==========================================
# 步骤 5: 是否执行合并
# ==========================================
echo -e "${BLUE}## 步骤 5: 合并决策${NC}"
echo ""

if [ "$DO_MERGE" = true ]; then
    echo -e "${GREEN}✓${NC} 已指定 --merge，执行合并流程"
else
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│              合并确认                                         │"
    echo "├──────────────────────────────────────────────────────────────┤"
    echo "│  Review 已通过，是否需要执行 Git 合并？                          │"
    echo "│                                                              │"
    echo "│  合并流程：                                                  │"
    echo "│  1. feature 分支 → testing (验证)                            │"
    echo "│  2. testing → main (生产)                                    │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""
    echo "  ${GREEN}[1]${NC} 是，执行合并"
    echo "  ${YELLOW}[2]${NC} 否，仅标记 Review 通过"
    echo ""
    read -p "请选择 (1/2): " MERGE_CHOICE

    if [ "$MERGE_CHOICE" != "1" ]; then
        echo ""
        echo -e "${YELLOW}○${NC} 已跳过合并流程"
        echo ""
        echo "如需后续执行合并，运行:"
        echo "  /eket-review-merge $TASK_ID --merge"
        echo ""
        echo "========================================"
        echo "Review 流程完成 (等待合并)"
        echo "========================================"
        exit 0
    fi
fi

# ==========================================
# 步骤 6: 执行 Git 合并
# ==========================================
echo -e "${BLUE}## 步骤 6: 执行 Git 合并${NC}"
echo ""

if [ -z "$BRANCH" ]; then
    BRANCH="feature/${TASK_ID,,}"
    echo -e "${YELLOW}○${NC} 任务文件未指定分支，使用默认：$BRANCH"
fi

echo "开发分支：$BRANCH"
echo ""

# 检查分支是否存在
if ! git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠${NC} 开发分支不存在：$BRANCH"
    echo ""
    echo "可能原因:"
    echo "  - 代码尚未提交到 Git"
    echo "  - 分支命名与任务文件记录不一致"
    echo ""
    echo "请确认分支名称，或检查代码是否已提交:"
    echo "  git branch -a"
    echo ""
    exit 1
fi

# ==========================================
# v0.5.2: 合并前验证 (新增)
# ==========================================
echo -e "${BLUE}## 步骤：合并前验证 (v0.5.2)${NC}"
echo ""

# 1. 测试门禁验证
if [ -x "$SCRIPTS_DIR/test-gate-system.sh" ]; then
    echo "运行测试门禁系统..."
    if "$SCRIPTS_DIR/test-gate-system.sh" all "$TASK_ID" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} 测试门禁通过"
    else
        echo -e "${RED}✗${NC} 测试门禁未通过，阻止合并"
        echo ""
        echo "请修复以下问题后重新尝试合并:"
        echo "  - 运行：$SCRIPTS_DIR/test-gate-system.sh all $TASK_ID 查看详情"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠${NC} 测试门禁系统未找到，跳过验证"
fi

# 2. 合并策略检查
if [ -x "$SCRIPTS_DIR/merge-strategy.sh" ]; then
    echo "检查合并策略..."
    if "$SCRIPTS_DIR/merge-strategy.sh" "$TASK_ID" --auto 2>/dev/null; then
        echo -e "${GREEN}✓${NC} 合并策略检查通过"
    else
        echo -e "${RED}✗${NC} 合并策略检查失败"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠${NC} 合并策略脚本未找到，跳过验证"
fi

# 3. Checkpoint 验证
if [ -x "$SCRIPTS_DIR/checkpoint-validator.sh" ]; then
    echo "验证任务 Checkpoint..."
    if "$SCRIPTS_DIR/checkpoint-validator.sh" "$TASK_ID" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Checkpoint 验证通过"
    else
        echo -e "${YELLOW}⚠${NC} Checkpoint 验证失败 (可选)"
    fi
else
    echo -e "${YELLOW}⚠${NC} Checkpoint 验证脚本未找到，跳过验证"
fi

echo ""

# 合并到 testing
echo "正在合并到 testing 分支..."
git checkout testing 2>/dev/null || git checkout -b testing
git merge "$BRANCH" -m "feat: merge $TASK_ID

Co-Authored-By: $(grep "^assigned_role:" "$TASK_FILE" 2>/dev/null | cut -d':' -f2 | xargs)"

echo -e "${GREEN}✓${NC} 已合并到 testing 分支"
echo ""

# 运行测试 (如果有)
if [ -f "package.json" ]; then
    echo "正在运行测试验证..."
    if npm run test 2>/dev/null; then
        echo -e "${GREEN}✓${NC} 测试通过"
    else
        echo -e "${RED}✗${NC} 测试失败，回滚合并..."
        git merge --abort
        exit 1
    fi
fi

# 合并到 main
echo ""
echo "正在合并到 main 分支..."
git checkout main
git merge testing -m "feat: merge $TASK_ID to main

Co-Authored-By: $(grep "^assigned_role:" "$TASK_FILE" 2>/dev/null | cut -d':' -f2 | xargs)"

git push origin main

echo -e "${GREEN}✓${NC} 已合并到 main 分支并推送"
echo ""

# 更新任务状态
sed -i "s/^status: .*/status: done/" "$TASK_FILE"
echo "任务状态已更新：done"
echo ""

# ==========================================
# 步骤 7: 创建测试和修复任务
# ==========================================
echo -e "${BLUE}## 步骤 7: 创建后续任务${NC}"
echo ""

# 创建测试任务
TEST_TASK_ID="TEST-${TASK_ID}"
TEST_FILE="jira/tickets/task/${TEST_TASK_ID}.md"

cat > "$TEST_FILE" << EOF
title: ${TITLE} - 测试验证
status: ready
priority: normal
labels: testing,verification
dependencies: [$TASK_ID]
estimated_hours: 2
description: |
  对已完成的任务进行测试验证

## 测试内容

- [ ] 功能测试
- [ ] 回归测试
- [ ] 边界测试
- [ ] 性能测试 (如适用)

## 验收标准

- [ ] 所有测试通过
- [ ] 无回归问题
- [ ] 性能符合预期

EOF

echo -e "${GREEN}✓${NC} 已创建测试任务：$TEST_FILE"

# 创建潜在的修复任务 (预创建，仅在发现问题时激活)
FIX_TASK_ID="FIX-${TASK_ID}-post"
FIX_FILE="jira/tickets/bugfix/${FIX_TASK_ID}.md"

cat > "$FIX_FILE" << EOF
title: ${TITLE} - 潜在问题修复
status: backlog
priority: low
labels: fix,post-merge
dependencies: [$TEST_TASK_ID]
estimated_hours: 2
description: |
  测试验证后可能需要的修复任务

## 触发条件

- 测试发现问题
- 用户反馈问题
- 回归问题

## 修复内容

待测试任务发现问题后补充

EOF

echo -e "${GREEN}✓${NC} 已创建潜在修复任务：$FIX_FILE (状态：backlog)"
echo ""

# 推送 Jira 更新
git add "$TASK_FILE" "$TEST_FILE" "$FIX_FILE" 2>/dev/null || true
git commit -m "chore: 更新 $TASK_ID 状态并完成后续任务创建

- 更新 $TASK_ID 状态为 done
- 创建测试任务 $TEST_TASK_ID
- 创建潜在修复任务 $FIX_TASK_ID

Co-Authored-By: Master Node" 2>/dev/null || true

echo ""
echo "========================================"
echo "Review + Merge 流程完成"
echo "========================================"
echo ""
echo "创建的任务:"
echo "  - 测试任务：$TEST_TASK_ID (状态：ready)"
echo "  - 修复任务：$FIX_TASK_ID (状态：backlog，测试发现问题后激活)"
echo ""
echo "任务状态:"
echo "  - $TASK_ID: done"
echo ""
