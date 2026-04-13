#!/bin/bash
#
# EKET Setup Script v1.0.0
# 用途：分层安装 EKET 框架运行环境
#
# 用法：
#   ./scripts/setup.sh              # 交互式（逐层询问）
#   ./scripts/setup.sh --level=1    # 只装到 Level 1（Shell 基础）
#   ./scripts/setup.sh --level=2    # 装到 Level 2（含 Node.js）
#   ./scripts/setup.sh --level=3    # 装到 Level 3（含 Docker+Redis）
#   ./scripts/setup.sh --level=4    # 装到 Level 4（含 SQLite）
#   ./scripts/setup.sh --all        # 全部安装（等同 --level=4）
#   ./scripts/setup.sh --yes|-y     # 所有可选层自动确认
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# ─────────────────────────────────────────────
# Level 1: Shell 基础环境（始终运行）
# ─────────────────────────────────────────────
level1_install() {
  echo -e "${BLUE}[Level 1] Shell 基础环境${NC}"

  # 检查必要命令
  for cmd in bash curl git; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo -e "${RED}✗ 缺少依赖：$cmd${NC}"
      exit 1
    fi
  done
  echo "  ✓ bash / curl / git 已安装"

  # macOS bash 版本检查（默认 bash 3.x 不支持部分特性）
  local bash_major
  bash_major=$(bash --version | head -1 | grep -oE '[0-9]+' | head -1)
  if [ "$bash_major" -lt 4 ]; then
    echo -e "${YELLOW}  ⚠ bash 版本 $bash_major.x < 4，部分脚本可能异常。建议：brew install bash${NC}"
  fi

  # 设置 hybrid-adapter.sh 可执行权限
  if [ -f "$PROJECT_ROOT/lib/adapters/hybrid-adapter.sh" ]; then
    chmod +x "$PROJECT_ROOT/lib/adapters/hybrid-adapter.sh"
    echo "  ✓ lib/adapters/hybrid-adapter.sh 已设置可执行"
  fi

  # 设置 scripts/ 下所有 .sh 可执行
  find "$PROJECT_ROOT/scripts" -name "*.sh" -exec chmod +x {} \;
  echo "  ✓ scripts/*.sh 已设置可执行"

  # 验证
  if "$PROJECT_ROOT/lib/adapters/hybrid-adapter.sh" doctor >/dev/null 2>&1; then
    echo "  ✓ hybrid-adapter doctor 通过"
  else
    echo -e "${YELLOW}  ⚠ hybrid-adapter doctor 有警告（非致命）${NC}"
  fi

  echo -e "${GREEN}✓ Level 1 完成${NC}\n"
}

# ─────────────────────────────────────────────
# Level 2: Node.js 环境
# ─────────────────────────────────────────────
level2_install() {
  echo -e "${BLUE}[Level 2] Node.js 环境${NC}"

  # 检查 Node.js
  if ! command -v node >/dev/null 2>&1; then
    echo -e "${RED}✗ Node.js 未安装${NC}"
    echo "  请安装 Node.js ≥18：https://nodejs.org 或 nvm install 22"
    exit 1
  fi

  # 检查版本 ≥18
  local node_major
  node_major=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
  if [ "$node_major" -lt 18 ]; then
    echo -e "${RED}✗ Node.js 版本 $(node --version) < 18${NC}"
    echo "  请升级：nvm install 22 && nvm use 22"
    exit 1
  fi
  echo "  ✓ Node.js $(node --version) 已安装"

  # npm ci
  echo "  → 安装依赖（npm ci）..."
  cd "$PROJECT_ROOT/node" && npm ci --silent
  echo "  ✓ 依赖安装完成"

  # .env 初始化
  if [ ! -f "$PROJECT_ROOT/.env" ]; then
    if [ -f "$PROJECT_ROOT/.env.example" ]; then
      cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
      echo -e "${YELLOW}  ✓ 已创建 .env（从 .env.example），请检查并填写配置${NC}"
    fi
  else
    echo "  ✓ .env 已存在"
  fi

  # 构建
  echo "  → 构建（npm run build）..."
  cd "$PROJECT_ROOT/node" && npm run build --silent
  echo "  ✓ 构建完成（dist/）"

  # 验证
  if node "$PROJECT_ROOT/node/dist/index.js" system:doctor >/dev/null 2>&1; then
    echo "  ✓ system:doctor 通过"
  else
    echo -e "${YELLOW}  ⚠ system:doctor 有警告（可能是 Redis/SQLite 未安装，属正常）${NC}"
  fi

  echo -e "${GREEN}✓ Level 2 完成${NC}\n"
}

# ─────────────────────────────────────────────
# Level 3: Docker + Redis
# ─────────────────────────────────────────────
level3_install() {
  echo -e "${BLUE}[Level 3] Docker + Redis${NC}"

  # 检查 Docker
  if ! command -v docker >/dev/null 2>&1; then
    echo -e "${RED}✗ Docker 未安装${NC}"
    echo "  请安装：https://docs.docker.com/get-docker/"
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}✗ Docker 未运行${NC}"
    echo "  请先启动 Docker Desktop 或 dockerd"
    exit 1
  fi
  echo "  ✓ Docker 已运行"

  # 启动 Redis（复用现有脚本）
  echo "  → 启动 Redis 容器..."
  "$PROJECT_ROOT/scripts/docker-redis.sh" start
  echo "  ✓ Redis 容器已启动"

  echo -e "${GREEN}✓ Level 3 完成${NC}\n"
}

# ─────────────────────────────────────────────
# Level 4: SQLite
# ─────────────────────────────────────────────
level4_install() {
  echo -e "${BLUE}[Level 4] SQLite${NC}"

  # 创建数据目录
  mkdir -p "$HOME/.eket/data/sqlite"
  echo "  ✓ ~/.eket/data/sqlite/ 已创建"

  # 检查 better-sqlite3 编译
  if node -e "require('better-sqlite3')" 2>/dev/null; then
    echo "  ✓ better-sqlite3 编译正常"
  else
    echo "  → 重新编译 better-sqlite3..."
    cd "$PROJECT_ROOT/node" && npm rebuild better-sqlite3
    echo "  ✓ better-sqlite3 编译完成"
  fi

  echo -e "${GREEN}✓ Level 4 完成${NC}\n"
}

# ─────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────
main() {
  local target_level=0
  local auto_yes=false

  # 解析参数
  for arg in "$@"; do
    case "$arg" in
      --level=*) target_level="${arg#--level=}" ;;
      --all)     target_level=4 ;;
      --yes|-y)  auto_yes=true ;;
      --help|-h)
        head -12 "$0" | grep "^#" | sed 's/^# \?//'
        exit 0
        ;;
    esac
  done

  echo -e "${BLUE}═══════════════════════════════════${NC}"
  echo -e "${BLUE}  EKET Setup v1.0.0${NC}"
  echo -e "${BLUE}═══════════════════════════════════${NC}\n"

  # Level 1 始终运行
  level1_install

  # Level 2-4：按 target_level 或交互询问
  local level_descs=("" "" "Node.js 依赖 + 构建" "Docker + Redis" "SQLite 数据目录")
  for lvl in 2 3 4; do
    if [ "$target_level" -ge "$lvl" ]; then
      "level${lvl}_install"
    elif [ "$target_level" -eq 0 ]; then
      if [ "$auto_yes" = true ]; then
        "level${lvl}_install"
      else
        read -rp "安装 Level ${lvl}（${level_descs[$lvl]}）？[y/N] " ans
        if [[ "$ans" =~ ^[Yy]$ ]]; then
          "level${lvl}_install"
        else
          echo "  跳过 Level ${lvl}"
        fi
      fi
    fi
  done

  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo -e "${GREEN}  EKET 安装完成！${NC}"
  echo -e "${GREEN}═══════════════════════════════════${NC}"
  echo ""
  echo "下一步："
  echo "  node dist/index.js instance:start --auto   # 启动 Master"
  echo "  node dist/index.js task:claim              # 领取任务"
  echo "  node dist/index.js system:doctor           # 系统诊断"
}

main "$@"
