#!/bin/bash
#
# /eket-save - 保存当前会话状态
#
# 用法:
#   /eket-save                    # 保存当前会话
#   /eket-save "checkpoint名称"   # 带名称保存
#
# 功能:
#   - 保存当前工作上下文到 .eket/sessions/
#   - 记录正在进行的任务
#   - 记录最近修改的文件
#   - 记录 git 状态
#   - 支持手动添加备注
#

set -euo pipefail

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# 配置
SESSION_DIR=".eket/sessions"
CHECKPOINT_NAME="${1:-}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
SESSION_ID="${CLAUDE_CODE_SESSION_ID:-unknown}"

# ─────────────────────────────────────────────
# 创建会话目录
# ─────────────────────────────────────────────
mkdir -p "$SESSION_DIR"

# ─────────────────────────────────────────────
# 生成会话文件名
# ─────────────────────────────────────────────
if [ -n "$CHECKPOINT_NAME" ]; then
  # 清理名称（只保留字母数字和连字符）
  SAFE_NAME=$(echo "$CHECKPOINT_NAME" | tr -cd '[:alnum:]-_' | cut -c1-50)
  SESSION_FILE="$SESSION_DIR/${TIMESTAMP}-${SAFE_NAME}.md"
else
  SESSION_FILE="$SESSION_DIR/${TIMESTAMP}.md"
fi

echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  EKET 会话保存${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""

# ─────────────────────────────────────────────
# 收集信息
# ─────────────────────────────────────────────
echo -e "${CYAN}收集会话信息...${NC}"

# Git 状态
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_STATUS=$(git status --short 2>/dev/null | head -20 || echo "无 git 仓库")
GIT_LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "无提交")

# 最近修改的文件
RECENT_FILES=$(find . -type f -mmin -30 -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.eket/*" 2>/dev/null | head -20 || echo "")

# 当前任务（从 jira/tickets 中查找 in_progress 状态）
CURRENT_TASKS=""
if [ -d "jira/tickets" ]; then
  CURRENT_TASKS=$(grep -r "status:.*in_progress" jira/tickets/*.md 2>/dev/null | head -5 | sed 's/:.*//;s/jira\/tickets\///' || echo "")
fi

# 上下文监控状态（如果存在）
CONTEXT_STATE=""
if [ -f ".eket/state/context-monitor.json" ]; then
  CONTEXT_STATE=$(cat .eket/state/context-monitor.json 2>/dev/null || echo "{}")
fi

# ─────────────────────────────────────────────
# 生成会话文件
# ─────────────────────────────────────────────
cat > "$SESSION_FILE" << EOF
# 会话快照

**保存时间**: $(date -Iseconds)
**会话 ID**: $SESSION_ID
**检查点名称**: ${CHECKPOINT_NAME:-"自动保存"}

---

## Git 状态

**分支**: \`$GIT_BRANCH\`
**最新提交**: \`$GIT_LAST_COMMIT\`

### 工作区变更
\`\`\`
$GIT_STATUS
\`\`\`

---

## 进行中的任务

$(if [ -n "$CURRENT_TASKS" ]; then
  echo "$CURRENT_TASKS" | while read -r task; do
    echo "- [ ] $task"
  done
else
  echo "_无进行中的任务_"
fi)

---

## 最近修改的文件（30 分钟内）

$(if [ -n "$RECENT_FILES" ]; then
  echo "$RECENT_FILES" | while read -r file; do
    echo "- \`$file\`"
  done
else
  echo "_无最近修改_"
fi)

---

## 上下文使用情况

$(if [ -n "$CONTEXT_STATE" ] && [ "$CONTEXT_STATE" != "{}" ]; then
  echo "\`\`\`json"
  echo "$CONTEXT_STATE"
  echo "\`\`\`"
else
  echo "_无上下文监控数据_"
fi)

---

## 备注

<!-- 在此添加手动备注 -->

---

## 恢复指令

要恢复此会话，在新 Claude Code 会话中运行：

\`\`\`bash
/eket-resume $SESSION_FILE
\`\`\`

或手动加载：

\`\`\`bash
cat $SESSION_FILE
\`\`\`
EOF

echo ""
echo -e "${GREEN}✓ 会话已保存到: ${SESSION_FILE}${NC}"
echo ""

# ─────────────────────────────────────────────
# 显示摘要
# ─────────────────────────────────────────────
echo -e "${CYAN}会话摘要:${NC}"
echo "  分支: $GIT_BRANCH"
echo "  最新提交: $GIT_LAST_COMMIT"
if [ -n "$CURRENT_TASKS" ]; then
  echo "  进行中任务: $(echo "$CURRENT_TASKS" | wc -l | tr -d ' ') 个"
fi
if [ -n "$RECENT_FILES" ]; then
  echo "  最近修改: $(echo "$RECENT_FILES" | wc -l | tr -d ' ') 个文件"
fi
echo ""

# 可选：提交到 git
read -rp "是否提交会话快照到 git？[y/N] " -t 10 COMMIT_CHOICE || COMMIT_CHOICE="n"
if [[ "$COMMIT_CHOICE" =~ ^[Yy]$ ]]; then
  git add "$SESSION_FILE"
  git commit -m "chore(session): save checkpoint - ${CHECKPOINT_NAME:-auto}" --no-verify 2>/dev/null || true
  echo -e "${GREEN}✓ 已提交到 git${NC}"
fi

echo ""
echo -e "${BLUE}下次启动时运行 /eket-resume 恢复会话${NC}"
