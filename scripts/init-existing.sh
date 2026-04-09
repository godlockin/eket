#!/bin/bash
# EKET 已有项目初始化脚本
# 使用方法: ./scripts/init-existing.sh [project-path]
# project-path 默认为当前目录

set -euo pipefail

PROJECT_ROOT="${1:-$(pwd)}"
EKET_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP=$(date -Iseconds)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
info() { echo -e "${BLUE}→${NC} $1"; }

# ─── Phase 1 ─────────────────────────────────────────────────────────────────
init_directories() {
  info "Phase 1: 初始化目录结构..."

  local dirs=(
    ".eket"
    ".eket/state"
    ".eket/memory"
    ".eket/logs"
    "confluence"
    "confluence/analysis"
    "confluence/requirements"
    "confluence/architecture"
    "jira"
    "jira/tickets"
    "jira/epics"
    "inbox"
    "inbox/human_feedback"
    "outbox"
    "outbox/review_requests"
  )

  for dir in "${dirs[@]}"; do
    if [ -d "$PROJECT_ROOT/$dir" ]; then
      warn "$dir 已存在，跳过"
    else
      mkdir -p "$PROJECT_ROOT/$dir"
      ok "创建目录：$dir"
    fi
  done
}

# ─── Phase 2 ─────────────────────────────────────────────────────────────────
init_claude_md() {
  info "Phase 2: 初始化 CLAUDE.md..."

  local target="$PROJECT_ROOT/CLAUDE.md"
  local eket_section="## EKET Framework"

  if [ -f "$target" ]; then
    if grep -qF "$eket_section" "$target"; then
      warn "CLAUDE.md 已含 EKET Framework 章节，跳过"
    else
      info "CLAUDE.md 存在但未含 EKET 章节，追加内容..."
      cat >> "$target" << 'EKET_SECTION'

---

## EKET Framework

**每次启动时，请首先读取 `.eket/IDENTITY.md` 确认角色（Master 或 Slaver）！**

- **Master**：协调、需求分析、任务拆解、PR 审核、合并代码
- **Slaver**：领取任务、开发、测试、提交 PR

### 输入/输出
- 需求输入：`inbox/human_input.md`
- Review 请求：`outbox/review_requests/`
- 任务列表：`jira/tickets/`
- 文档：`confluence/`
EKET_SECTION
      ok "CLAUDE.md 追加 EKET Framework 章节"
    fi
  else
    local template="$EKET_ROOT/template/CLAUDE.md"
    if [ -f "$template" ]; then
      cp "$template" "$target"
      ok "从模板复制 CLAUDE.md"
    else
      warn "模板 $template 不存在，跳过创建 CLAUDE.md"
    fi
  fi
}

# ─── Phase 3 ─────────────────────────────────────────────────────────────────
init_gitignore() {
  info "Phase 3: 初始化 .gitignore..."

  local target="$PROJECT_ROOT/.gitignore"

  if [ ! -f "$target" ]; then
    touch "$target"
    ok "创建 .gitignore"
  fi

  local entries=(
    ".eket/data/"
    ".eket/logs/"
    ".eket/state/instance_config.yml"
  )

  for entry in "${entries[@]}"; do
    if grep -qF "$entry" "$target"; then
      warn ".gitignore 已含 $entry，跳过"
    else
      echo "$entry" >> "$target"
      ok ".gitignore 追加：$entry"
    fi
  done
}

# ─── Phase 4 ─────────────────────────────────────────────────────────────────
init_master_identity() {
  info "Phase 4: 初始化 Master 身份配置..."

  # 复制 IDENTITY.md
  local identity_template="$EKET_ROOT/template/.eket/IDENTITY.md"
  local identity_target="$PROJECT_ROOT/.eket/IDENTITY.md"

  if [ -f "$identity_template" ]; then
    cp "$identity_template" "$identity_target"
    ok "复制 IDENTITY.md"
  else
    warn "IDENTITY.md 模板不存在：$identity_template，跳过"
  fi

  # 写入 instance_config.yml
  local config_target="$PROJECT_ROOT/.eket/state/instance_config.yml"
  cat > "$config_target" << YAML
# EKET 实例配置（已有项目接入）
# 自动生成于：${TIMESTAMP}

role: "master"
agent_type: null
auto_mode: false
storage_mode: "git_full"
status: "initialized"
initialized_from: "existing_project"
initialized_at: "${TIMESTAMP}"
YAML
  ok "写入 .eket/state/instance_config.yml"
}

# ─── Phase 5 ─────────────────────────────────────────────────────────────────
show_next_steps() {
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  EKET 初始化完成！${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
  ok "项目路径：$PROJECT_ROOT"
  ok "EKET 框架：$EKET_ROOT"
  echo ""
  info "下一步建议："
  echo "  1. 编辑 .eket/IDENTITY.md 确认角色"
  echo "  2. 在 inbox/human_input.md 描述项目需求"
  echo "  3. 运行深度分析（可选）"
  echo ""

  local analyze_script="$EKET_ROOT/scripts/analyze-existing.sh"

  read -r -p "$(echo -e "${BLUE}是否立即启动深度分析？(y/N): ${NC}")" answer || answer="N"

  if [[ "$answer" =~ ^[Yy]$ ]]; then
    if [ -f "$analyze_script" ]; then
      info "启动深度分析..."
      bash "$analyze_script" "$PROJECT_ROOT"
    else
      warn "analyze-existing.sh 尚不存在，跳过"
      info "稍后可手动运行：bash $analyze_script $PROJECT_ROOT"
    fi
  else
    info "稍后运行：bash $analyze_script $PROJECT_ROOT"
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  echo ""
  echo -e "${BLUE}EKET 已有项目初始化${NC}"
  echo -e "${BLUE}项目路径：$PROJECT_ROOT${NC}"
  echo ""

  init_directories
  echo ""
  init_claude_md
  echo ""
  init_gitignore
  echo ""
  init_master_identity
  echo ""
  show_next_steps
}

main
