#!/bin/bash
#
# /eket-office-hours - 需求分析强制问题框架
#
# 用法:
#   /eket-office-hours              # 交互式问答
#   /eket-office-hours <ticket-id>  # 为指定 ticket 生成分析
#
# 功能:
#   - 强制回答 6 个核心问题（参考 gstack /office-hours）
#   - 在开始开发前理清需求
#   - 生成结构化的分析报告
#   - 识别潜在风险和依赖
#
# 理念:
#   "Six forcing questions that reframe your product before you write code"
#

set -euo pipefail

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RED='\033[0;31m'
MAGENTA='\033[0;35m'
NC='\033[0m'
BOLD='\033[1m'

# 配置
TICKET_ID="${1:-}"
OUTPUT_DIR="jira/tickets"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# ─────────────────────────────────────────────
# 显示横幅
# ─────────────────────────────────────────────
show_banner() {
  echo ""
  echo -e "${MAGENTA}╔═══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${MAGENTA}║${NC}                                                               ${MAGENTA}║${NC}"
  echo -e "${MAGENTA}║${NC}   ${BOLD}EKET Office Hours${NC}                                         ${MAGENTA}║${NC}"
  echo -e "${MAGENTA}║${NC}   ${CYAN}Six Forcing Questions Before You Write Code${NC}               ${MAGENTA}║${NC}"
  echo -e "${MAGENTA}║${NC}                                                               ${MAGENTA}║${NC}"
  echo -e "${MAGENTA}╚═══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ─────────────────────────────────────────────
# 问题定义
# ─────────────────────────────────────────────
declare -a QUESTIONS=(
  "1. 用户问题｜这解决什么用户问题？用户当前如何解决这个问题？"
  "2. 成功指标｜如何衡量成功？具体的数字指标是什么？"
  "3. 最小版本｜最小可行版本（MVP）是什么？可以砍掉什么功能？"
  "4. 风险识别｜有什么技术风险？有什么业务风险？最坏情况是什么？"
  "5. 依赖关系｜依赖什么外部系统/API/团队？谁在等待这个？"
  "6. 验证方式｜完成后如何验证？谁来测试？验收标准是什么？"
)

declare -a HINTS=(
  "提示: 描述具体的用户场景，不要说'提高效率'这种模糊表述"
  "提示: 给出具体数字，如'响应时间<200ms'或'覆盖率>80%'"
  "提示: 列出可以延后或删除的功能，聚焦核心价值"
  "提示: 诚实面对不确定性，列出需要调研的技术点"
  "提示: 明确外部依赖的状态（已就绪/待确认/阻塞中）"
  "提示: 写出具体的测试用例或验收场景"
)

# 存储答案
declare -a ANSWERS

# ─────────────────────────────────────────────
# 交互式问答
# ─────────────────────────────────────────────
interactive_qa() {
  echo -e "${CYAN}回答以下 6 个问题以明确需求（按 Enter 跳过，输入 'q' 退出）${NC}"
  echo ""

  for i in "${!QUESTIONS[@]}"; do
    local q="${QUESTIONS[$i]}"
    local h="${HINTS[$i]}"

    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}$q${NC}"
    echo -e "${YELLOW}$h${NC}"
    echo ""

    # 多行输入（空行结束）
    local answer=""
    echo -e "${CYAN}你的回答（空行结束）:${NC}"
    while IFS= read -r line; do
      if [ -z "$line" ]; then
        break
      fi
      if [ "$line" = "q" ] || [ "$line" = "Q" ]; then
        echo -e "${YELLOW}已取消${NC}"
        exit 0
      fi
      answer+="$line"$'\n'
    done

    ANSWERS+=("$answer")
    echo ""
  done
}

# ─────────────────────────────────────────────
# 生成报告
# ─────────────────────────────────────────────
generate_report() {
  local output_file

  if [ -n "$TICKET_ID" ]; then
    mkdir -p "$OUTPUT_DIR/$TICKET_ID"
    output_file="$OUTPUT_DIR/$TICKET_ID/office-hours-${TIMESTAMP}.md"
  else
    mkdir -p ".eket/office-hours"
    output_file=".eket/office-hours/analysis-${TIMESTAMP}.md"
  fi

  cat > "$output_file" << EOF
# Office Hours 需求分析

**生成时间**: $(date -Iseconds)
**Ticket ID**: ${TICKET_ID:-"(无关联 Ticket)"}

---

## 1. 用户问题

**问题**: 这解决什么用户问题？用户当前如何解决？

${ANSWERS[0]:-"_未回答_"}

---

## 2. 成功指标

**问题**: 如何衡量成功？具体数字指标是什么？

${ANSWERS[1]:-"_未回答_"}

---

## 3. 最小可行版本 (MVP)

**问题**: 最小版本是什么？可以砍掉什么功能？

${ANSWERS[2]:-"_未回答_"}

---

## 4. 风险识别

**问题**: 技术风险？业务风险？最坏情况？

${ANSWERS[3]:-"_未回答_"}

---

## 5. 依赖关系

**问题**: 依赖什么外部系统/API/团队？谁在等待？

${ANSWERS[4]:-"_未回答_"}

---

## 6. 验证方式

**问题**: 如何验证完成？谁来测试？验收标准？

${ANSWERS[5]:-"_未回答_"}

---

## 分析总结

### 可行性评估

| 维度 | 状态 | 说明 |
|------|------|------|
| 需求清晰度 | ⬜ | _根据上述回答评估_ |
| 技术可行性 | ⬜ | _根据风险识别评估_ |
| 依赖就绪度 | ⬜ | _根据依赖关系评估_ |
| 验收明确度 | ⬜ | _根据验证方式评估_ |

### 建议

- [ ] 需求是否足够清晰可以开始开发？
- [ ] 是否需要进一步调研？
- [ ] 是否需要与其他团队协调？

---

## 下一步

- [ ] 创建技术设计文档
- [ ] 拆解任务到子 Ticket
- [ ] 确认验收标准
- [ ] 开始开发

---

*由 /eket-office-hours 生成 | 参考 gstack 六问框架*
EOF

  echo "$output_file"
}

# ─────────────────────────────────────────────
# 显示摘要
# ─────────────────────────────────────────────
show_summary() {
  local report_file="$1"

  echo ""
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo -e "${GREEN}  分析完成${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════${NC}"
  echo ""

  echo -e "报告已保存到: ${CYAN}$report_file${NC}"
  echo ""

  # 检查哪些问题没有回答
  local unanswered=0
  for i in "${!ANSWERS[@]}"; do
    if [ -z "${ANSWERS[$i]}" ] || [ "${ANSWERS[$i]}" = $'\n' ]; then
      ((unanswered++))
    fi
  done

  if [ "$unanswered" -gt 0 ]; then
    echo -e "${YELLOW}⚠ 有 $unanswered 个问题未回答，建议补充完善${NC}"
  else
    echo -e "${GREEN}✓ 所有问题已回答${NC}"
  fi

  echo ""
  echo -e "${CYAN}建议下一步:${NC}"
  echo "  1. 审阅报告，补充遗漏信息"
  echo "  2. 与相关方确认需求"
  echo "  3. 创建技术设计文档"
  echo "  4. 拆解子任务并开始开发"
  echo ""

  # 如果有 ticket ID，提示更新状态
  if [ -n "$TICKET_ID" ]; then
    echo -e "${CYAN}Ticket 操作:${NC}"
    echo "  cat $report_file              # 查看报告"
    echo "  /eket-claim $TICKET_ID        # 领取任务"
  fi
}

# ─────────────────────────────────────────────
# 快速模式（非交互）
# ─────────────────────────────────────────────
quick_mode() {
  echo -e "${CYAN}快速模式：生成空白模板${NC}"
  echo ""

  # 初始化空答案
  for i in "${!QUESTIONS[@]}"; do
    ANSWERS+=("")
  done

  local report_file
  report_file=$(generate_report)

  echo -e "${GREEN}✓ 模板已生成: $report_file${NC}"
  echo ""
  echo "请编辑该文件填写答案，然后继续开发流程"
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
main() {
  show_banner

  # 检查是否是 TTY（交互式终端）
  if [ -t 0 ]; then
    # 交互模式
    interactive_qa
    local report_file
    report_file=$(generate_report)
    show_summary "$report_file"
  else
    # 非交互模式（pipe 输入）
    quick_mode
  fi
}

main
