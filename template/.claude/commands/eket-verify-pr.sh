#!/bin/bash
# template/.claude/commands/eket-verify-pr.sh - PR 验证审查（审查点 B2）

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 显示帮助
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法：/eket-verify-pr <ticket-id>"
    echo ""
    echo "PR 验证审查（审查点 B2）- 验证性审查"
    echo ""
    echo "参数:"
    echo "  ticket-id   任务 ID (如：FEAT-001)"
    echo ""
    echo "示例:"
    echo "  /eket-verify-pr FEAT-001"
    exit 0
fi

# 检查参数
if [ -z "$1" ]; then
    echo -e "${RED}错误：请提供任务 ID${NC}"
    echo "用法：/eket-verify-pr <ticket-id>"
    echo "使用 -h 或 --help 查看帮助"
    exit 1
fi

TICKET_ID="$1"
PR_DOC="outbox/review_requests/$TICKET_ID.md"
ANALYSIS_DOC="confluence/tasks/$TICKET_ID/task-analysis.md"

echo "========================================"
echo "PR 验证审查（审查点 B2）"
echo "========================================"
echo ""

# 检查 PR 文档是否存在
if [ ! -f "$PR_DOC" ]; then
    echo -e "${RED}错误：PR 文档不存在${NC}"
    echo "路径：$PR_DOC"
    exit 1
fi

# 检查任务分析文档是否存在
if [ ! -f "$ANALYSIS_DOC" ]; then
    echo -e "${YELLOW}警告：任务分析文档不存在${NC}"
    echo "路径：$ANALYSIS_DOC"
    echo "无法进行文档一致性验证。"
    echo ""
fi

echo -e "${BLUE}## 审查信息${NC}"
echo ""
echo "任务 ID: $TICKET_ID"
echo "PR 文档：$PR_DOC"
echo "任务分析文档：$ANALYSIS_DOC"
echo ""

# 显示 PR 内容
echo -e "${BLUE}## PR 描述${NC}"
echo ""
echo "---"
cat "$PR_DOC"
echo "---"
echo ""

# 显示任务分析文档（用于对比）
if [ -f "$ANALYSIS_DOC" ]; then
    echo -e "${BLUE}## 批准的任务分析文档${NC}"
    echo ""
    echo "请对比以下文档，验证实现是否与批准的文档一致："
    echo ""
    echo "---"
    cat "$ANALYSIS_DOC"
    echo "---"
    echo ""
fi

# 验证审查清单
echo -e "${YELLOW}## 验证审查清单${NC}"
echo ""
echo "### 文档一致性验证 (核心审查点)"
echo "- [ ] 实现与批准的任务分析文档一致"
echo "- [ ] 所有变更都在任务范围内"
echo "- [ ] 没有未授权的范围蔓延"
echo ""
echo "### 代码质量"
echo "- [ ] 通过所有单元测试"
echo "- [ ] 通过所有集成测试"
echo "- [ ] 代码符合项目规范"
echo "- [ ] 没有明显的安全问题"
echo ""
echo "### 测试覆盖"
echo "- [ ] 单元测试覆盖核心逻辑"
echo "- [ ] 边界情况有测试"
echo "- [ ] 集成测试验证关键场景"
echo ""
echo "### 文档更新"
echo "- [ ] 更新了相关 API 文档"
echo "- [ ] 更新了用户文档 (如适用)"
echo "- [ ] 代码注释充分"
echo ""

# 审查决定
echo -e "${BLUE}## 审查决定${NC}"
echo ""
echo "请选择审查结果："
echo ""
echo "1) **通过** - 验证通过，可以合并"
echo "2) **有条件通过** - Minor 问题，修复后可直接合并"
echo "3) **需要修改** - Major 问题，需要重新提交审查"
echo "4) **拒绝** - 实现与批准文档严重不符，需重新提交任务分析"
echo ""
echo "请输入选项 (1-4): "

# 注意：由于 Claude Code 环境可能不支持交互式输入，提供说明
echo ""
echo -e "${YELLOW}注意：请在 Claude Code 中输入你的决定和意见。${NC}"
echo ""
echo "审查意见将记录在 PR 文档中。"
echo ""

exit 0
