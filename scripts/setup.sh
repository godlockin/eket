#!/bin/bash
#
# EKET Setup Script v1.1.0
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
#   ./scripts/setup.sh --minimal    # 仅 Level 1（Shell 基础），非交互
#   ./scripts/setup.sh --full       # 全部安装，非交互
#
# 完全非交互（curl | bash 场景）：
#   curl -fsSL https://raw.githubusercontent.com/your-org/eket/main/scripts/setup.sh | bash -s -- --full -y
#   curl -fsSL https://raw.githubusercontent.com/your-org/eket/main/scripts/setup.sh | bash -s -- --minimal
#
# 环境变量：
#   EKET_SKIP_RUST_BUILD=1   完全跳过 Rust/binary 安装（CI 场景）
#   EKET_PREFER_BUILD=1      强制本地 cargo build（跳过预编译下载）
#   EKET_VERSION=v0.1.0      指定预编译 binary 版本（默认 latest）
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

INSTALL_MODE=""  # "" = interactive, "minimal" = level1 only, "full" = all levels

# ─────────────────────────────────────────────
# Level 1: Shell 基础环境（始终运行）
# ─────────────────────────────────────────────
level1_install() {
  echo -e "${BLUE}[Level 1] Shell 基础环境${NC}"

  # 检查必要命令，缺失时给出平台安装提示
  for cmd in curl git; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo -e "${RED}✗ 缺少依赖：$cmd${NC}"
      # 平台安装提示
      if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "  macOS 安装方式："
        echo "    brew install $cmd"
        echo "  或安装 Xcode Command Line Tools：xcode-select --install"
      else
        echo "  Ubuntu/Debian 安装方式："
        echo "    sudo apt-get update && sudo apt-get install -y $cmd"
        echo "  RHEL/CentOS 安装方式："
        echo "    sudo yum install -y $cmd"
      fi
      exit 1
    fi
  done
  echo "  ✓ curl / git 已安装"

  # macOS：检测 git 是否会触发 Xcode 安装弹窗（stub git）
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if git --version 2>&1 | grep -q "xcode-select"; then
      echo -e "${YELLOW}  ⚠ macOS git 需要 Xcode Command Line Tools${NC}"
      echo "  → 运行：xcode-select --install，然后重新执行本脚本"
      exit 1
    fi
  fi

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
# Level 1.5: 预编译 binary 下载
# ─────────────────────────────────────────────
download_prebuilt_binary() {
  local version="${EKET_VERSION:-latest}"
  local base_url="https://github.com/your-org/eket/releases"

  # 检测平台
  local os arch
  case "$(uname -s)" in
    Linux*)  os="linux" ;;
    Darwin*) os="macos" ;;
    *)       echo -e "${YELLOW}  ⚠ 不支持的平台，跳过预编译下载${NC}"; return 1 ;;
  esac
  case "$(uname -m)" in
    arm64|aarch64) arch="arm64" ;;
    x86_64)        arch="x64"   ;;
    *)             echo -e "${YELLOW}  ⚠ 不支持的架构，跳过预编译下载${NC}"; return 1 ;;
  esac

  local artifact="eket-${os}-${arch}"
  local download_url
  if [ "$version" = "latest" ]; then
    download_url="${base_url}/latest/download/${artifact}"
  else
    download_url="${base_url}/download/${version}/${artifact}"
  fi

  echo "  → 下载预编译 binary：$download_url"
  local tmp_bin
  tmp_bin=$(mktemp)
  if curl -fsSL "$download_url" -o "$tmp_bin" 2>/dev/null; then
    chmod +x "$tmp_bin"
    mkdir -p "$HOME/.local/bin"
    mv "$tmp_bin" "$HOME/.local/bin/eket"
    echo -e "  ${GREEN}✓ eket binary 已下载到 ~/.local/bin/eket${NC}"
    return 0
  else
    rm -f "$tmp_bin"
    echo -e "${YELLOW}  ⚠ 预编译下载失败（可能尚无 release），回退到本地编译${NC}"
    return 1
  fi
}

# ─────────────────────────────────────────────
# Level 1.5: Rust 工具链
# ─────────────────────────────────────────────
check_rust() {
  if command -v rustc >/dev/null 2>&1 && command -v cargo >/dev/null 2>&1; then
    local ver
    ver=$(rustc --version | awk '{print $2}')
    echo -e "  ${GREEN}✓ Rust $ver 已检测到${NC}"
    cargo --version | sed 's/^/  ✓ /'
    return 0
  else
    echo -e "${YELLOW}  ⚠ 未检测到 Rust 工具链（rustc/cargo）${NC}"
    return 1
  fi
}

install_rust_prompt() {
  echo ""
  echo "  Rust 工具链未安装。选项："
  echo "    1) 自动安装 rustup（推荐）"
  echo "    2) 跳过 Rust，使用 Node.js 降级"
  read -rp "  请选择 [1/2]（默认 2）: " ans
  if [[ "$ans" == "1" ]]; then
    echo "  → 安装 rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # shellcheck source=/dev/null
    if [ -f "$HOME/.cargo/env" ]; then
      source "$HOME/.cargo/env"
    fi
    echo -e "  ${GREEN}✓ rustup 安装完成${NC}"
    return 0
  else
    echo -e "${YELLOW}  跳过 Rust 安装${NC}"
    return 1
  fi
}

build_eket_binary() {
  local rust_dir="$PROJECT_ROOT/rust"
  if [ ! -d "$rust_dir" ]; then
    echo -e "${YELLOW}  ⚠ rust/ 目录不存在，跳过构建${NC}"
    return 1
  fi

  echo "  → 构建 Rust binary（cargo build --release，首次约 60s）..."
  if (cd "$rust_dir" && cargo build --release --quiet 2>&1); then
    local bin_src="$rust_dir/target/release/eket"
    if [ -f "$bin_src" ]; then
      mkdir -p "$HOME/.local/bin"
      cp "$bin_src" "$HOME/.local/bin/eket"
      echo -e "  ${GREEN}✓ eket binary 已安装到 ~/.local/bin/eket${NC}"

      # PATH 检查 + 自动写入
      if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo -e "${YELLOW}  ⚠ ~/.local/bin 不在 PATH，自动写入 shell 配置${NC}"
        local shell_rc=""
        if [[ "$SHELL" == */zsh ]]; then shell_rc="$HOME/.zshrc"
        elif [[ "$SHELL" == */bash ]]; then shell_rc="$HOME/.bashrc"
        fi
        if [ -n "$shell_rc" ]; then
          if ! grep -q 'HOME/.local/bin' "$shell_rc" 2>/dev/null; then
            { echo ''; echo '# Added by EKET setup'; echo 'export PATH="$HOME/.local/bin:$PATH"'; } >> "$shell_rc"
            echo -e "  ${GREEN}✓ 已写入 $shell_rc（新终端自动生效）${NC}"
          fi
          export PATH="$HOME/.local/bin:$PATH"
          echo "  ✓ 当前终端已生效"
        else
          echo "  请手动添加：export PATH=\"\$HOME/.local/bin:\$PATH\""
        fi
      fi
      return 0
    else
      echo -e "${RED}  ✗ 构建产物不存在：$bin_src${NC}"
      return 1
    fi
  else
    echo -e "${RED}  ✗ Rust 构建失败${NC}"
    echo -e "${YELLOW}  Rust binary 不可用，使用 Node.js 降级（node dist/index.js）${NC}"
    echo "  提示：可设置 EKET_SKIP_RUST_BUILD=1 跳过 Rust 构建"
    return 1
  fi
}

level_rust_install() {
  echo -e "${BLUE}[Level 1.5] Rust 工具链 / eket binary${NC}"

  # CI 环境跳过
  if [ "${EKET_SKIP_RUST_BUILD:-}" = "1" ]; then
    echo "  EKET_SKIP_RUST_BUILD=1，跳过"
    echo -e "${GREEN}✓ Level 1.5 跳过（CI 模式）${NC}\n"
    return
  fi

  # 优先尝试预编译 binary（快速，无需 Rust 工具链）
  if [ "${EKET_PREFER_BUILD:-}" != "1" ]; then
    if download_prebuilt_binary; then
      # PATH 检查 + 自动写入（复用 build_eket_binary 中的逻辑）
      if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
        echo -e "${YELLOW}  ⚠ ~/.local/bin 不在 PATH，自动写入 shell 配置${NC}"
        local shell_rc=""
        if [[ "$SHELL" == */zsh ]]; then shell_rc="$HOME/.zshrc"
        elif [[ "$SHELL" == */bash ]]; then shell_rc="$HOME/.bashrc"
        fi
        if [ -n "$shell_rc" ]; then
          if ! grep -q 'HOME/.local/bin' "$shell_rc" 2>/dev/null; then
            { echo ''; echo '# Added by EKET setup'; echo 'export PATH="$HOME/.local/bin:$PATH"'; } >> "$shell_rc"
            echo -e "  ${GREEN}✓ 已写入 $shell_rc（新终端自动生效）${NC}"
          fi
          export PATH="$HOME/.local/bin:$PATH"
          echo "  ✓ 当前终端已生效"
        else
          echo "  请手动添加：export PATH=\"\$HOME/.local/bin:\$PATH\""
        fi
      fi
      echo -e "${GREEN}✓ Level 1.5 完成（预编译）${NC}\n"
      return
    fi
  fi

  # 回退：本地编译（现有逻辑）
  if check_rust; then
    build_eket_binary || true
  else
    if install_rust_prompt; then
      build_eket_binary || true
    else
      echo -e "${YELLOW}  Rust binary 不可用，使用 Node.js 降级（node dist/index.js）${NC}"
    fi
  fi

  echo -e "${GREEN}✓ Level 1.5 完成${NC}\n"
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
      --minimal) INSTALL_MODE="minimal"; auto_yes=true ;;
      --full)    INSTALL_MODE="full";    auto_yes=true; target_level=4 ;;
      --check-rust)
        echo -e "${BLUE}Rust 工具链检查${NC}"
        check_rust && exit 0 || exit 1
        ;;
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

  # --minimal 模式：仅 Level 1，跳过其余
  if [ "$INSTALL_MODE" = "minimal" ]; then
    echo -e "${GREEN}═══════════════════════════════════${NC}"
    echo -e "${GREEN}  EKET 安装完成（minimal 模式）！${NC}"
    echo -e "${GREEN}═══════════════════════════════════${NC}"
    exit 0
  fi

  # Level 1.5: Rust（可选，交互式）
  # --level=1 也提供 Rust 提示，只是不强制
  if [ "$target_level" -ge 1 ] || [ "$target_level" -eq 0 ]; then
    if [ "$auto_yes" = true ]; then
      level_rust_install
    else
      read -rp "安装 Level 1.5（Rust 工具链 + eket binary，~21ms/cmd，推荐）？[Y/n] " ans
      if [[ ! "$ans" =~ ^[Nn]$ ]]; then
        level_rust_install
      else
        echo "  跳过 Level 1.5（Rust）。可稍后运行：setup.sh --check-rust"
      fi
    fi
  fi

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

  # Skill 安装
  echo ""
  if [ "$auto_yes" = true ]; then
    echo "  → 安装 Claude Code skill..."
    bash "$SCRIPT_DIR/install-skill.sh" --update
  else
    read -rp "安装 EKET skill 到 ~/.claude/skills/eket/（Claude Code 分析团队功能）？[Y/n] " ans
    if [[ ! "$ans" =~ ^[Nn]$ ]]; then
      bash "$SCRIPT_DIR/install-skill.sh" --update
    else
      echo "  跳过 skill 安装（可稍后运行：./scripts/install-skill.sh）"
    fi
  fi

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
