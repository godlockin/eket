#!/bin/bash
#
# scripts/init-local-remotes.sh
# 用途：将 local-only 初始化的三仓库迁移到远程
#
# 用法：
#   ./scripts/init-local-remotes.sh <project-name> --remote-org <org> [--platform github|gitlab|gitee]
#
# 前提：已用 init-three-repos.sh --local-only 初始化过三仓库
#

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

# ─── 参数解析 ─────────────────────────────────────────────────────────────────
PROJECT_NAME="${1:-}"
REMOTE_ORG=""
PLATFORM="github"
WORKSPACE="$(pwd)"
YES=false

shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote-org)   REMOTE_ORG="$2"; shift 2 ;;
    --platform)     PLATFORM="$2";   shift 2 ;;
    --workspace)    WORKSPACE="$2";  shift 2 ;;
    --yes|-y)       YES=true;        shift ;;
    *) echo -e "${RED}未知参数：$1${NC}"; exit 1 ;;
  esac
done

if [ -z "$PROJECT_NAME" ]; then
  echo -e "${RED}✗ 缺少项目名称${NC}"
  echo "用法：$0 <project-name> --remote-org <org> [--platform github|gitlab|gitee]"
  exit 1
fi

if [ -z "$REMOTE_ORG" ]; then
  echo -e "${RED}✗ 缺少 --remote-org 参数${NC}"
  echo "用法：$0 <project-name> --remote-org <org> [--platform github|gitlab|gitee]"
  exit 1
fi

PROJECT_DIR="$WORKSPACE/$PROJECT_NAME"

if [ ! -d "$PROJECT_DIR/.git" ]; then
  echo -e "${RED}✗ 找不到主项目：$PROJECT_DIR${NC}"
  echo "请在包含 $PROJECT_NAME/ 的目录中运行此脚本，或用 --workspace 指定"
  exit 1
fi

# ─── 远程 URL 生成 ─────────────────────────────────────────────────────────────
remote_url() {
  local repo_name="$1"
  case "$PLATFORM" in
    github) echo "git@github.com:${REMOTE_ORG}/${repo_name}.git" ;;
    gitlab) echo "git@gitlab.com:${REMOTE_ORG}/${repo_name}.git" ;;
    gitee)  echo "git@gitee.com:${REMOTE_ORG}/${repo_name}.git" ;;
    *) echo -e "${RED}✗ 不支持的平台：$PLATFORM${NC}" >&2; exit 1 ;;
  esac
}

# ─── 预检 ─────────────────────────────────────────────────────────────────────
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  EKET 本地→远程迁移${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""
echo "  项目：  $PROJECT_NAME"
echo "  平台：  $PLATFORM"
echo "  组织：  $REMOTE_ORG"
echo "  工作区：$WORKSPACE"
echo ""
echo "  将为以下仓库设置远程并推送："
echo "    $(remote_url "${PROJECT_NAME}-confluence")"
echo "    $(remote_url "${PROJECT_NAME}-jira")"
echo "    $(remote_url "${PROJECT_NAME}-code")"
echo "    $(remote_url "${PROJECT_NAME}")"
echo ""

if [ "$YES" = false ]; then
  read -rp "确认继续？[Y/n] " ans
  if [[ "$ans" =~ ^[Nn]$ ]]; then echo "已取消"; exit 0; fi
fi

# ─── 迁移函数 ─────────────────────────────────────────────────────────────────
migrate_subrepo() {
  local subdir="$1"
  local repo_name="$2"
  local url
  url=$(remote_url "$repo_name")
  local full_path="$PROJECT_DIR/$subdir"

  echo ""
  echo -e "${BLUE}迁移 $repo_name${NC}"

  if [ ! -d "$full_path/.git" ]; then
    echo -e "${YELLOW}  ⚠ 找不到 $full_path/.git，跳过${NC}"
    return
  fi

  # 1. 设置远程
  git -C "$full_path" remote add origin "$url" 2>/dev/null || \
    git -C "$full_path" remote set-url origin "$url"
  echo -e "  ${GREEN}✓ remote origin 设置为 $url${NC}"

  # 2. 推送
  git -C "$full_path" push -u origin main 2>/dev/null || \
    echo -e "${YELLOW}  ⚠ push 失败（远程可能未创建），请手动推送后重新运行${NC}"
  echo -e "  ${GREEN}✓ push 完成${NC}"

  # 3. 更新 .gitmodules 中的 URL
  git -C "$PROJECT_DIR" submodule set-url "$subdir" "$url" 2>/dev/null || true
  echo -e "  ${GREEN}✓ .gitmodules submodule URL 已更新${NC}"
}

# ─── 迁移三个子仓库 ───────────────────────────────────────────────────────────
migrate_subrepo "${PROJECT_NAME}-confluence" "${PROJECT_NAME}-confluence"
migrate_subrepo "${PROJECT_NAME}-jira"       "${PROJECT_NAME}-jira"
migrate_subrepo "${PROJECT_NAME}-code"       "${PROJECT_NAME}-code"

# ─── 同步 .gitmodules 并提交 ──────────────────────────────────────────────────
echo ""
echo -e "${BLUE}同步 .gitmodules 并提交${NC}"
cd "$PROJECT_DIR"
git submodule sync
git add .gitmodules
git diff --cached --quiet || \
  git commit -m "chore: 更新 submodule 为远程 URL"
echo -e "  ${GREEN}✓ .gitmodules 已更新${NC}"

# ─── 主项目远程 ───────────────────────────────────────────────────────────────
MAIN_URL=$(remote_url "${PROJECT_NAME}")
echo ""
echo -e "${BLUE}设置主项目远程${NC}"
git remote add origin "$MAIN_URL" 2>/dev/null || \
  git remote set-url origin "$MAIN_URL"
git push -u origin main 2>/dev/null || \
  echo -e "${YELLOW}  ⚠ 主项目 push 失败，请确认远程仓库已创建后手动 push${NC}"
echo -e "  ${GREEN}✓ 主项目 remote 设置完成${NC}"

# ─── 完成 ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  迁移完成！${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "其他成员现在可以通过以下方式 clone："
echo "  git clone --recurse-submodules $MAIN_URL"
