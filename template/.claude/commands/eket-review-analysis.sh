#!/bin/bash
# template/.claude/commands/eket-review-analysis.sh - 审查任务分析文档

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 显示帮助
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "用法：/eket-review-analysis <ticket-id>"
    echo ""
    echo "审查任务分析文档（审查点 B1）"
    echo ""
    echo "参数:"
    echo "  ticket-id   任务 ID (如：FEAT-001)"
    echo ""
    echo "示例:"
    echo "  /eket-review-analysis FEAT-001"
    exit 0
fi

# 检查参数
if [ -z "$1" ]; then
    echo -e "${RED}错误：请提供任务 ID${NC}"
    echo "用法：/eket-review-analysis <ticket-id>"
    echo "使用 -h 或 --help 查看帮助"
    exit 1
fi

TICKET_ID="$1"
ANALYSIS_DOC="confluence/tasks/$TICKET_ID/task-analysis.md"

# 检查文档是否存在
if [ ! -f "$ANALYSIS_DOC" ]; then
    echo -e "${RED}错误：任务分析文档不存在${NC}"
    echo "路径：$ANALYSIS_DOC"
    echo ""
    echo "请先让执行智能体创建任务分析文档。"
    exit 1
fi

echo "========================================"
echo "任务分析文档审查（审查点 B1）"
echo "========================================"
echo ""

# 显示文档内容
echo -e "${BLUE}## 任务分析文档：$TICKET_ID${NC}"
echo ""
echo "位置：$ANALYSIS_DOC"
echo ""
echo "---"
echo ""

# 使用 less 或 cat 显示文档
if command -v less &> /dev/null; then
    less -R "$ANALYSIS_DOC"
else
    cat "$ANALYSIS_DOC"
fi

echo ""
echo "---"
echo ""

# 审查检查清单
echo -e "${YELLOW}## 审查检查清单${NC}"
echo ""
echo "请根据以下问题进行评估："
echo ""
echo "### 需求理解"
echo "- [ ] 任务目标与 Phase 1 需求文档一致"
echo "- [ ] 验收标准可测试、可验证"
echo "- [ ] 任务范围边界清晰"
echo ""
echo "### 技术方案"
echo "- [ ] 技术方案与系统架构一致"
echo "- [ ] 接口设计符合规范 (如适用)"
echo "- [ ] 数据结构设计合理"
echo "- [ ] 没有过度设计"
echo ""
echo "### 测试策略"
echo "- [ ] 单元测试覆盖核心逻辑"
echo "- [ ] 边界情况有测试"
echo "- [ ] 集成测试场景完整"
echo ""
echo "### 工作量预估"
echo "- [ ] 预估时间合理"
echo "- [ ] 没有明显的遗漏"
echo ""

# 审查决定
echo -e "${BLUE}## 审查决定${NC}"
echo ""
echo "请选择审查结果："
echo ""
echo "1) **批准** - 可以开始实现"
echo "2) **需要修改** - 修改后可直接开始（需说明修改意见）"
echo "3) **重新审查** - 需要重新提交分析文档"
echo "4) **取消审查** - 退出审查流程"
echo ""
echo "请输入选项 (1-4): "

# 注意：由于 Claude Code 环境可能不支持交互式输入，提供说明
echo ""
echo -e "${YELLOW}注意：请在 Claude Code 中输入你的决定和意见。${NC}"
echo ""
echo "审查意见将记录在文档的'审查批准栏'中。"
echo ""

# 返回到 Claude Code，等待用户决定
exit 0
