#!/bin/bash
#
# scripts/init-three-repos.sh
# EKET 三仓库初始化脚本 v3.0
#
# 用法：
#   ./scripts/init-three-repos.sh <project-name>
#   ./scripts/init-three-repos.sh <project-name> --remote-org <org> --platform <github|gitlab|gitee>
#   ./scripts/init-three-repos.sh <project-name> --local-only
#   ./scripts/init-three-repos.sh <project-name> --workspace /path/to/parent
#
# 结果结构（parent-project 为 git repo，三仓库为其 submodule）：
#   <workspace>/
#   └── <project-name>/               ← 主项目 git repo（submodule 宿主）
#       ├── .gitmodules
#       ├── <project-name>-confluence/  ← submodule（独立 git repo，知识库）
#       ├── <project-name>-jira/        ← submodule（独立 git repo，任务协作）
#       └── <project-name>-code/        ← submodule（独立 git repo，代码实现）
#
# 各 Slaver clone 时：git clone --recurse-submodules <main-repo>
# submodule 可独立 push/pull：cd <project>-jira && git push
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EKET_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

# ─── 参数解析 ─────────────────────────────────────────────────────────────────
PROJECT_NAME="${1:-}"
REMOTE_ORG=""
PLATFORM="github"
LOCAL_ONLY=false
WORKSPACE="$(pwd)"
YES=false

shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote-org)     REMOTE_ORG="$2"; shift 2 ;;
    --platform)       PLATFORM="$2";   shift 2 ;;
    --workspace)      WORKSPACE="$2";  shift 2 ;;
    --local-only)     LOCAL_ONLY=true; shift ;;
    --yes|-y)         YES=true;        shift ;;
    *) echo -e "${RED}未知参数：$1${NC}"; exit 1 ;;
  esac
done

if [ -z "$PROJECT_NAME" ]; then
  echo -e "${RED}✗ 缺少项目名称${NC}"
  echo "用法：$0 <project-name> [--remote-org <org>] [--platform github|gitlab|gitee]"
  exit 1
fi

# 主项目目录（submodule 宿主）
PROJECT_DIR="$WORKSPACE/$PROJECT_NAME"
CONFLUENCE_DIR="$PROJECT_DIR/${PROJECT_NAME}-confluence"
JIRA_DIR="$PROJECT_DIR/${PROJECT_NAME}-jira"
CODE_DIR="$PROJECT_DIR/${PROJECT_NAME}-code"

# ─── 预检 ─────────────────────────────────────────────────────────────────────
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo -e "${BLUE}  EKET 三仓库初始化 v3.0${NC}"
echo -e "${BLUE}═══════════════════════════════════════════${NC}"
echo ""
echo "  项目名：$PROJECT_NAME"
echo "  工作区：$WORKSPACE"
echo ""
echo "  将创建主项目 + 三个 submodule："
echo "    $PROJECT_DIR/               ← 主项目 git repo"
echo "    $CONFLUENCE_DIR/  ← submodule（知识库）"
echo "    $JIRA_DIR/        ← submodule（任务协作）"
echo "    $CODE_DIR/        ← submodule（代码实现）"

if [ "$LOCAL_ONLY" = false ] && [ -n "$REMOTE_ORG" ]; then
  echo ""
  echo "  远程仓库（$PLATFORM / $REMOTE_ORG）："
  echo "    ${PROJECT_NAME}                  ← 主项目"
  echo "    ${PROJECT_NAME}-confluence"
  echo "    ${PROJECT_NAME}-jira"
  echo "    ${PROJECT_NAME}-code"
fi

echo ""
if [ "$YES" = false ]; then
  read -rp "确认继续？[Y/n] " ans
  if [[ "$ans" =~ ^[Nn]$ ]]; then echo "已取消"; exit 0; fi
fi

# ─── 工具函数 ─────────────────────────────────────────────────────────────────
init_git_repo() {
  local dir="$1"
  local msg="$2"
  cd "$dir"
  git init -b main
  git add .
  git commit -m "$msg"
  cd - >/dev/null
}

create_remote_repo() {
  local repo_name="$1"
  local description="$2"
  case "$PLATFORM" in
    github)
      if command -v gh >/dev/null 2>&1; then
        gh repo create "${REMOTE_ORG}/${repo_name}" --private --description "$description" || true
      else
        echo -e "${YELLOW}  ⚠ 未找到 gh CLI，跳过远程创建：$repo_name${NC}"
      fi
      ;;
    gitlab)
      if command -v glab >/dev/null 2>&1; then
        glab repo create "${REMOTE_ORG}/${repo_name}" --private || true
      else
        echo -e "${YELLOW}  ⚠ 未找到 glab CLI，跳过远程创建：$repo_name${NC}"
      fi
      ;;
    gitee)
      echo -e "${YELLOW}  ⚠ Gitee 无官方 CLI，请手动在 gitee.com 创建：${REMOTE_ORG}/${repo_name}${NC}"
      ;;
  esac
}

remote_url() {
  local repo_name="$1"
  case "$PLATFORM" in
    github) echo "git@github.com:${REMOTE_ORG}/${repo_name}.git" ;;
    gitlab) echo "git@gitlab.com:${REMOTE_ORG}/${repo_name}.git" ;;
    gitee)  echo "git@gitee.com:${REMOTE_ORG}/${repo_name}.git" ;;
  esac
}

add_remote_and_push() {
  local dir="$1"
  local repo_name="$2"
  local url
  url=$(remote_url "$repo_name")
  cd "$dir"
  git remote add origin "$url" 2>/dev/null || git remote set-url origin "$url"
  git push -u origin main 2>/dev/null || echo -e "${YELLOW}  ⚠ push 失败（远程可能未创建），稍后手动 push${NC}"
  cd - >/dev/null
}

# ─── Step 0: 主项目目录 ───────────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[0/5] 初始化主项目${NC}"

mkdir -p "$PROJECT_DIR"

cat > "$PROJECT_DIR/README.md" <<EOF
# ${PROJECT_NAME}

EKET 三仓库项目（Master-Slaver 协作）。

## 子仓库

| 仓库 | 职责 |
|------|------|
| \`${PROJECT_NAME}-confluence/\` | 知识库、架构文档、Skills、团队记忆 |
| \`${PROJECT_NAME}-jira/\` | Ticket 管理、EKET 运行时、Master-Slaver 协议 |
| \`${PROJECT_NAME}-code/\` | 代码交付 |

## Clone（含 submodule）

\`\`\`bash
git clone --recurse-submodules <repo-url>

# 已有主项目时初始化 submodule
git submodule update --init --recursive
\`\`\`

## 更新各子仓库

\`\`\`bash
git submodule update --remote           # 拉取所有子仓库最新
cd ${PROJECT_NAME}-jira && git pull     # 单独更新 jira
\`\`\`

## 各 submodule 独立 push

\`\`\`bash
cd ${PROJECT_NAME}-jira
git add .
git commit -m "feat: ..."
git push origin main   # 直接 push 到 jira 自己的远程
\`\`\`

## 三仓库路径约定

各 Agent 在 \`${PROJECT_NAME}-jira\` 根目录下工作时，可通过相对路径访问兄弟仓库：
- 知识库：\`../${PROJECT_NAME}-confluence/\`
- 代码：\`../${PROJECT_NAME}-code/\`
EOF

cat > "$PROJECT_DIR/.gitmodules" <<EOF
# 由 init-three-repos.sh 自动生成
# 三个子仓库各自独立维护，主项目仅追踪 commit 指针
EOF

# 初始化主项目 git repo（空提交，submodule add 完成后再统一提交）
if [ ! -d "$PROJECT_DIR/.git" ]; then
  cd "$PROJECT_DIR"
  git init -b main
  git add README.md
  git commit -m "init: ${PROJECT_NAME} 主项目初始化"
  cd - >/dev/null
  echo -e "  ${GREEN}✓ 主项目 git repo 已初始化${NC}"
else
  echo -e "  ${YELLOW}⚠ 主项目已存在 git repo，跳过 init${NC}"
fi

# ─── Step 1: confluence submodule ─────────────────────────────────────────────
echo ""
echo -e "${BLUE}[1/5] 初始化 confluence 仓库${NC}"

if [ -d "$CONFLUENCE_DIR/.git" ]; then
  echo -e "${YELLOW}  ⚠ 已存在，跳过：$CONFLUENCE_DIR${NC}"
else
  mkdir -p "$CONFLUENCE_DIR"/{memory/{retrospectives/2026,lessons,patterns,pitfalls,research,glossary},architecture,skills,team,inbox}
  cat > "$CONFLUENCE_DIR/README.md" <<EOF
# ${PROJECT_NAME} — Confluence（知识库）

团队共享知识、架构文档、复盘、Skills。

## 目录

| 目录 | 用途 |
|------|------|
| \`memory/\` | 持久化团队记忆（复盘/经验/规律） |
| \`architecture/\` | 架构决策记录（ADR） |
| \`skills/\` | EKET Skill 定义 |
| \`team/\` | 团队成员、角色、联系方式 |
| \`inbox/\` | 跨仓库消息接收 |

## 访问路径（同级 submodule 时）

\`\`\`bash
# 从 jira 或 code 访问：
../${PROJECT_NAME}-confluence/memory/
\`\`\`
EOF
  touch "$CONFLUENCE_DIR/memory/retrospectives/2026/.gitkeep"
  touch "$CONFLUENCE_DIR/architecture/.gitkeep"
  touch "$CONFLUENCE_DIR/skills/.gitkeep"
  touch "$CONFLUENCE_DIR/inbox/.gitkeep"

  init_git_repo "$CONFLUENCE_DIR" "init: EKET ${PROJECT_NAME}-confluence 仓库初始化"

  # 以远程 URL 或本地路径添加为 submodule
  cd "$PROJECT_DIR"
  if [ "$LOCAL_ONLY" = false ] && [ -n "$REMOTE_ORG" ]; then
    local_url=$(remote_url "${PROJECT_NAME}-confluence")
    # 先设置 remote，push 后再 submodule add（避免 submodule add 时远程不存在）
    git -C "$CONFLUENCE_DIR" remote add origin "$local_url" 2>/dev/null || true
    git submodule add "$local_url" "${PROJECT_NAME}-confluence" 2>/dev/null || \
      git submodule add "./${PROJECT_NAME}-confluence" "${PROJECT_NAME}-confluence" 2>/dev/null || true
  else
    # local-only：用相对路径（本地 submodule）
    git submodule add "./${PROJECT_NAME}-confluence" "${PROJECT_NAME}-confluence" 2>/dev/null || true
  fi
  git config -f "$PROJECT_DIR/.gitmodules" "submodule.${PROJECT_NAME}-confluence.branch" "main"
  cd - >/dev/null

  echo -e "  ${GREEN}✓ confluence submodule 初始化完成${NC}"
fi

# ─── Step 2: jira submodule ───────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[2/5] 初始化 jira 仓库${NC}"

if [ -d "$JIRA_DIR/.git" ]; then
  echo -e "${YELLOW}  ⚠ 已存在，跳过：$JIRA_DIR${NC}"
else
  mkdir -p "$JIRA_DIR"/{tickets,epics,inbox/{human_feedback,agent_feedback,master_inbox},.eket/{mailbox,heartbeat,queue/{task-events,review-requests,ci-results},config}}

  cat > "$JIRA_DIR/.eket/config/config.yml" <<EOF
# EKET 运行时配置
# 三仓库作为同一主项目的 submodule，使用相对路径（../sibling）无需修改

eket_version: "1.0"
project_name: "${PROJECT_NAME}"

# 仓库路径（相对于本文件所在的 jira 仓库根目录）
repos:
  confluence:
    local_path: "../${PROJECT_NAME}-confluence"
  jira:
    local_path: "."
  code:
    local_path: "../${PROJECT_NAME}-code"

# 运行时目录
runtime:
  mailbox_dir: ".eket/mailbox"
  heartbeat_dir: ".eket/heartbeat"
  queue_dir: ".eket/queue"
  tickets_dir: "tickets"

# 可选：远程仓库（填写后支持自动 push）
# remote:
#   confluence: git@github.com:org/${PROJECT_NAME}-confluence.git
#   jira:       git@github.com:org/${PROJECT_NAME}-jira.git
#   code:       git@github.com:org/${PROJECT_NAME}-code.git
EOF

  cat > "$JIRA_DIR/.eket/IDENTITY.md" <<EOF
# EKET Identity

> 每个 Agent 启动时读取此文件确认身份。
> 人类成员也在此注册自己的 agent_id。

## 当前实例

\`\`\`yaml
agent_id: ""        # 填写：如 master_chen / slaver_rust_01 / human_alice
role: ""            # master | slaver
type: ""            # ai | human
skills: []          # 如 [rust, backend, architecture]
\`\`\`

## 团队成员注册表

| agent_id | role | type | skills |
|----------|------|------|--------|
|          |      |      |        |
EOF

  cat > "$JIRA_DIR/README.md" <<EOF
# ${PROJECT_NAME} — Jira（任务协作）

Ticket 生命周期管理、任务协作、Master-Slaver 协议运行时。

## 目录

| 目录 | 用途 |
|------|------|
| \`tickets/\` | Ticket 文件（TASK-xxx.md） |
| \`epics/\` | Epic 文件 |
| \`inbox/\` | 人类/Agent 反馈消息 |
| \`.eket/\` | EKET 运行时（mailbox/heartbeat/queue/config） |

## Submodule 结构

\`\`\`
${PROJECT_NAME}/                        ← 主项目（submodule 宿主）
├── .gitmodules
├── ${PROJECT_NAME}-confluence/         ← submodule（知识库）
├── ${PROJECT_NAME}-jira/               ← 本仓库（任务）
└── ${PROJECT_NAME}-code/               ← submodule（代码）
\`\`\`

各 submodule 均可独立 push/pull；主项目追踪各 submodule 的 commit 指针。
\`.eket/config/config.yml\` 使用相对路径，无需配置绝对路径。
EOF

  touch "$JIRA_DIR/tickets/.gitkeep"
  touch "$JIRA_DIR/epics/.gitkeep"
  cat > "$JIRA_DIR/.gitignore" <<EOF
# EKET 运行时文件（不提交）
.eket/mailbox/*
.eket/heartbeat/*
.eket/queue/**/*.json
!.eket/queue/**/.gitkeep
.eket/data/
*.db
*.db-shm
*.db-wal
EOF
  touch "$JIRA_DIR/.eket/mailbox/.gitkeep"
  touch "$JIRA_DIR/.eket/heartbeat/.gitkeep"
  touch "$JIRA_DIR/.eket/queue/task-events/.gitkeep"
  touch "$JIRA_DIR/.eket/queue/review-requests/.gitkeep"
  touch "$JIRA_DIR/.eket/queue/ci-results/.gitkeep"

  init_git_repo "$JIRA_DIR" "init: EKET ${PROJECT_NAME}-jira 仓库初始化"

  cd "$PROJECT_DIR"
  if [ "$LOCAL_ONLY" = false ] && [ -n "$REMOTE_ORG" ]; then
    local_url=$(remote_url "${PROJECT_NAME}-jira")
    git -C "$JIRA_DIR" remote add origin "$local_url" 2>/dev/null || true
    git submodule add "$local_url" "${PROJECT_NAME}-jira" 2>/dev/null || \
      git submodule add "./${PROJECT_NAME}-jira" "${PROJECT_NAME}-jira" 2>/dev/null || true
  else
    git submodule add "./${PROJECT_NAME}-jira" "${PROJECT_NAME}-jira" 2>/dev/null || true
  fi
  git config -f "$PROJECT_DIR/.gitmodules" "submodule.${PROJECT_NAME}-jira.branch" "main"
  cd - >/dev/null

  echo -e "  ${GREEN}✓ jira submodule 初始化完成${NC}"
fi

# ─── Step 3: code submodule ───────────────────────────────────────────────────
echo ""
echo -e "${BLUE}[3/5] 初始化 code 仓库${NC}"

if [ -d "$CODE_DIR/.git" ]; then
  echo -e "${YELLOW}  ⚠ 已存在，跳过：$CODE_DIR${NC}"
else
  mkdir -p "$CODE_DIR"/{src,tests,.github/workflows}

  cat > "$CODE_DIR/README.md" <<EOF
# ${PROJECT_NAME}

> 代码仓库。由 EKET Master-Slaver 协作开发。

## 三仓库协作

| 仓库 | 职责 |
|------|------|
| \`${PROJECT_NAME}-confluence\` | 架构文档、知识库、Skill |
| \`${PROJECT_NAME}-jira\` | Ticket、任务协作、Master-Slaver 协议 |
| \`${PROJECT_NAME}-code\` | 本仓库，实际代码交付 |

## 分支策略

\`\`\`
feature/{ticket-id}-{desc}  →  PR  →  testing  →  miao  →  main
\`\`\`

- \`main\`: 保护分支，仅 Master 合并
- \`testing\`: 自动测试门卡
- \`feature/*\`: Slaver 开发分支
EOF

  cat > "$CODE_DIR/.gitignore" <<EOF
# 依赖
node_modules/
target/
dist/
*.pyc
__pycache__/

# 环境
.env
.env.local

# 系统
.DS_Store
.idea/
.vscode/
EOF

  cat > "$CODE_DIR/.github/workflows/ci.yml" <<EOF
name: CI

on:
  pull_request:
    branches: [main, testing]
  push:
    branches: [testing]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run tests
        run: echo "Add your test commands here"
EOF

  init_git_repo "$CODE_DIR" "init: EKET ${PROJECT_NAME}-code 仓库初始化"

  cd "$PROJECT_DIR"
  if [ "$LOCAL_ONLY" = false ] && [ -n "$REMOTE_ORG" ]; then
    local_url=$(remote_url "${PROJECT_NAME}-code")
    git -C "$CODE_DIR" remote add origin "$local_url" 2>/dev/null || true
    git submodule add "$local_url" "${PROJECT_NAME}-code" 2>/dev/null || \
      git submodule add "./${PROJECT_NAME}-code" "${PROJECT_NAME}-code" 2>/dev/null || true
  else
    git submodule add "./${PROJECT_NAME}-code" "${PROJECT_NAME}-code" 2>/dev/null || true
  fi
  git config -f "$PROJECT_DIR/.gitmodules" "submodule.${PROJECT_NAME}-code.branch" "main"
  cd - >/dev/null

  echo -e "  ${GREEN}✓ code submodule 初始化完成${NC}"
fi

# ─── Step 4: 主项目提交 submodule 注册 ────────────────────────────────────────
echo ""
echo -e "${BLUE}[4/5] 主项目提交 .gitmodules + submodule 指针${NC}"

cd "$PROJECT_DIR"
if git diff --cached --name-only | grep -q ".gitmodules" 2>/dev/null || \
   git status --short | grep -q ".gitmodules" 2>/dev/null; then
  git add .gitmodules "${PROJECT_NAME}-confluence" "${PROJECT_NAME}-jira" "${PROJECT_NAME}-code" 2>/dev/null || true
  git add . 2>/dev/null || true
  git commit -m "feat: 注册三个 submodule（confluence/jira/code）" 2>/dev/null || true
  echo -e "  ${GREEN}✓ .gitmodules + submodule 指针已提交${NC}"
else
  # 尝试 stage 并提交
  git add . 2>/dev/null || true
  git diff --cached --quiet 2>/dev/null || \
    git commit -m "feat: 注册三个 submodule（confluence/jira/code）" 2>/dev/null || true
  echo -e "  ${GREEN}✓ 主项目已更新${NC}"
fi
cd - >/dev/null

# ─── Step 5: 远程仓库（可选） ─────────────────────────────────────────────────
if [ "$LOCAL_ONLY" = false ] && [ -n "$REMOTE_ORG" ]; then
  echo ""
  echo -e "${BLUE}[5/5] 创建并推送远程仓库${NC}"

  # 创建子仓库远程并 push
  create_remote_repo "${PROJECT_NAME}-confluence" "EKET knowledge base for ${PROJECT_NAME}"
  add_remote_and_push "$CONFLUENCE_DIR" "${PROJECT_NAME}-confluence"
  echo -e "  ${GREEN}✓ confluence 远程推送完成${NC}"

  create_remote_repo "${PROJECT_NAME}-jira" "EKET task tracker for ${PROJECT_NAME}"
  add_remote_and_push "$JIRA_DIR" "${PROJECT_NAME}-jira"
  echo -e "  ${GREEN}✓ jira 远程推送完成${NC}"

  create_remote_repo "${PROJECT_NAME}-code" "${PROJECT_NAME} source code"
  add_remote_and_push "$CODE_DIR" "${PROJECT_NAME}-code"
  echo -e "  ${GREEN}✓ code 远程推送完成${NC}"

  # 创建主项目远程并 push
  create_remote_repo "${PROJECT_NAME}" "EKET project: ${PROJECT_NAME}"
  add_remote_and_push "$PROJECT_DIR" "${PROJECT_NAME}"
  echo -e "  ${GREEN}✓ 主项目远程推送完成${NC}"
else
  echo ""
  echo -e "${BLUE}[5/5] 跳过远程仓库（本地模式）${NC}"
  echo "  稍后添加远程（各仓库独立设置）："
  echo "    cd $PROJECT_DIR && git remote add origin <main-url>"
  echo "    cd ${PROJECT_NAME}-confluence && git remote add origin <confluence-url>"
  echo "    cd ${PROJECT_NAME}-jira && git remote add origin <jira-url>"
  echo "    cd ${PROJECT_NAME}-code && git remote add origin <code-url>"
  echo ""
  echo "  设置远程后更新 .gitmodules："
  echo "    git submodule set-url ${PROJECT_NAME}-confluence <confluence-url>"
  echo "    git submodule set-url ${PROJECT_NAME}-jira <jira-url>"
  echo "    git submodule set-url ${PROJECT_NAME}-code <code-url>"
  echo ""
  echo -e "${YELLOW}  ⚠ 本地模式：submodule URL 为本地路径，其他机器无法 clone${NC}"
  echo "    迁移到远程时运行：./scripts/init-local-remotes.sh $PROJECT_NAME"
fi

# ─── 完成 ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}  三仓库初始化完成！${NC}"
echo -e "${GREEN}═══════════════════════════════════════════${NC}"
echo ""
echo "目录结构："
echo "  $PROJECT_DIR/"
echo "  ├── .gitmodules"
echo "  ├── ${PROJECT_NAME}-confluence/  ✓ (submodule)"
echo "  ├── ${PROJECT_NAME}-jira/        ✓ (submodule)"
echo "  └── ${PROJECT_NAME}-code/        ✓ (submodule)"
echo ""
echo "Clone 方式（他人）："
echo "  git clone --recurse-submodules <main-repo-url>"
echo ""
echo "下一步："
echo "  1. 编辑 ${PROJECT_NAME}-jira/.eket/IDENTITY.md 填写 agent_id"
echo "  2. 启动 Master："
echo "     cd ${PROJECT_NAME}-jira && eket master:heartbeat"
echo "  3. 启动 Slaver："
echo "     cd ${PROJECT_NAME}-jira && eket slaver:register --role backend && eket slaver:poll"
echo ""
echo "协作文档："
echo "  eket 框架根目录/docs/PROTOCOL.md"
echo "  eket 框架根目录/docs/THREE-REPO-DEPLOYMENT.md"
