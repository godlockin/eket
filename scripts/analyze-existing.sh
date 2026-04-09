#!/bin/bash
# EKET 已有项目深度分析脚本
# 使用方法: ./scripts/analyze-existing.sh [project-path]

set -euo pipefail

PROJECT_ROOT="${1:-$(pwd)}"
EKET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATE=$(date +%Y-%m-%d)
OUTPUT_DIR="$PROJECT_ROOT/confluence/analysis/$DATE"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }
err()  { echo -e "${RED}✗${NC} $1"; }

# Global role selection array
declare -a SELECTED_ROLES=()

detect_tech_stack() {
  local stack=""

  [ -f "$PROJECT_ROOT/package.json" ]      && stack="${stack:+$stack, }Node.js/TypeScript"
  { [ -f "$PROJECT_ROOT/requirements.txt" ] || [ -f "$PROJECT_ROOT/pyproject.toml" ]; } && stack="$stack Python"
  [ -f "$PROJECT_ROOT/go.mod" ]            && stack="${stack:+$stack, }Go"
  [ -f "$PROJECT_ROOT/Cargo.toml" ]        && stack="${stack:+$stack, }Rust"
  [ -f "$PROJECT_ROOT/pom.xml" ]           && stack="${stack:+$stack, }Java/Maven"
  [ -f "$PROJECT_ROOT/build.gradle" ]      && stack="${stack:+$stack, }Java/Gradle"

  echo "${stack:-Unknown}"
}

select_roles() {
  echo "可用角色："
  echo "  [1] product   - 产品经理（功能完整性、竞品对比、市场定位）"
  echo "  [2] dev       - 开发工程师（代码质量、技术债务）"
  echo "  [3] security  - 安全工程师（漏洞、敏感数据）"
  echo "  [4] blueteam  - 蓝队（防御、业务连续性、竞品威胁）"
  echo "  [5] redteam   - 红队（攻击面、业务逻辑漏洞、供应链）"
  echo "  [6] architect - 架构师（扩展性、耦合度）"
  echo "  [7] tester    - 测试工程师（覆盖率、策略）"
  echo "  [8] devops    - DevOps（CI/CD、基础设施）"
  echo "  [9] end_user  - 终端用户（使用体验、竞品对比、业务价值）"
  echo ""
  echo "推荐默认组合: 1 2 3 4 5 9 (product+dev+security+blueteam+redteam+end_user)"
  echo ""
  printf "请选择角色（直接回车使用默认）: "
  read -r user_input

  local role_map=(
    [1]="product"
    [2]="dev"
    [3]="security"
    [4]="blueteam"
    [5]="redteam"
    [6]="architect"
    [7]="tester"
    [8]="devops"
    [9]="end_user"
  )

  if [ -z "$user_input" ]; then
    SELECTED_ROLES=("product" "dev" "security" "blueteam" "redteam" "end_user")
  else
    SELECTED_ROLES=()
    for num in $user_input; do
      if [ -n "${role_map[$num]+_}" ]; then
        SELECTED_ROLES+=("${role_map[$num]}")
      else
        warn "无效角色编号: $num，已跳过"
      fi
    done
    if [ ${#SELECTED_ROLES[@]} -eq 0 ]; then
      warn "未选择有效角色，使用默认组合"
      SELECTED_ROLES=("product" "dev" "security" "blueteam" "redteam" "end_user")
    fi
  fi

  ok "已选择角色: ${SELECTED_ROLES[*]}"
  echo ""
}

build_subagent_prompt() {
  local role="$1"
  local output_path="$2"
  local tech_stack="$3"
  local git_log="$4"
  local dir_tree="$5"
  local template_file="$EKET_ROOT/template/.eket/analysis-roles/${role}.md"

  if [ ! -f "$template_file" ]; then
    err "模板不存在: $template_file"
    return 1
  fi

  python3 - "$template_file" <<PYEOF
import sys

with open(sys.argv[1], 'r') as f:
    content = f.read()

replacements = {
    '{{PROJECT_PATH}}': r"""$PROJECT_ROOT""",
    '{{TECH_STACK}}':   r"""$tech_stack""",
    '{{GIT_LOG}}':      r"""$git_log""",
    '{{DIR_TREE}}':     r"""$dir_tree""",
    '{{OUTPUT_PATH}}':  r"""$output_path""",
}

for placeholder, value in replacements.items():
    content = content.replace(placeholder, value)

print(content, end='')
PYEOF
}

dispatch_subagents() {
  local tech_stack="$1"

  local git_log
  git_log=$(cd "$PROJECT_ROOT" && git log --oneline -20 2>/dev/null || echo "no git history")

  local dir_tree
  dir_tree=$(find "$PROJECT_ROOT" \
    -not -path '*/.git/*' \
    -not -path '*/node_modules/*' \
    -not -path '*/.eket/data/*' \
    -not -path '*/dist/*' \
    | head -150 | sort)

  mkdir -p "$OUTPUT_DIR"

  for role in "${SELECTED_ROLES[@]}"; do
    local output_path="$OUTPUT_DIR/${role}-report.md"
    local prompt_file="$OUTPUT_DIR/.prompt-${role}.md"

    info "生成 $role 分析提示..."
    if build_subagent_prompt "$role" "$output_path" "$tech_stack" "$git_log" "$dir_tree" > "$prompt_file"; then
      ok "  $prompt_file"
    else
      warn "  跳过角色: $role"
    fi
  done
}

print_dispatch_instructions() {
  local dispatch_file="$OUTPUT_DIR/DISPATCH.md"

  {
    echo "# 深度分析 Dispatch 指令"
    echo "**日期**: $DATE"
    echo "**项目**: $PROJECT_ROOT"
    echo "**角色**: ${SELECTED_ROLES[*]}"
    echo ""
    echo "## 说明"
    echo "将以下内容粘贴到 Claude Code 会话中，Master 将并行启动所有 Slaver 角色进行分析。"
    echo ""
    echo "---"
    echo ""
    echo "## 执行指令"
    echo ""
    echo "请并行启动以下分析团队，每个角色作为独立 subagent 全量扫描项目并输出报告："
    echo ""

    for role in "${SELECTED_ROLES[@]}"; do
      local prompt_file="$OUTPUT_DIR/.prompt-${role}.md"
      echo "### Slaver: ${role}"
      if [ -f "$prompt_file" ]; then
        cat "$prompt_file"
      else
        echo "（提示文件未生成）"
      fi
      echo ""
      echo "---"
      echo ""
    done

    echo "## 汇总指令"
    echo ""
    echo "所有角色报告完成后，读取 ${OUTPUT_DIR}/ 下所有 *-report.md，"
    echo "生成 ${OUTPUT_DIR}/alignment.md，内容包含："
    echo "1. 跨角色共识（多角色均提到的问题，优先处理）"
    echo "2. 跨角色冲突（不同角色建议矛盾的地方，需要权衡）"
    echo "3. 综合 Top 10 行动项（按优先级排序）"
    echo ""
    echo "然后从行动项中提取，在 jira/tickets/ 生成 analysis-${DATE}-NNN.md 草稿。"
  } > "$dispatch_file"

  echo ""
  ok "Dispatch 指令已生成"
  echo "文件路径: $dispatch_file"
  echo ""
  echo "在 Claude Code 中运行："
  echo "  cat $dispatch_file"
}

main() {
  echo "========================================"
  echo "EKET 深度分析"
  echo "========================================"
  echo ""

  [ -d "$PROJECT_ROOT" ] || { err "路径不存在: $PROJECT_ROOT"; exit 1; }

  local tech_stack
  tech_stack=$(detect_tech_stack)
  info "探测到 Tech Stack: $tech_stack"
  echo ""

  select_roles
  dispatch_subagents "$tech_stack"
  print_dispatch_instructions

  echo ""
  info "输出目录: $OUTPUT_DIR"
  info "分析完成后 alignment.md 将汇总所有发现"
}

main "$@"
