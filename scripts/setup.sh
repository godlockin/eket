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
#   curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/setup.sh | bash -s -- --full -y
#   curl -fsSL https://raw.githubusercontent.com/godlockin/eket/main/scripts/setup.sh | bash -s -- --minimal
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
# 通用下载 + sha256 校验函数
# ─────────────────────────────────────────────
download_and_verify() {
  local url=$1
  local dest=$2

  echo "  → 下载: $url"
  if ! curl -fsSL "$url" -o "$dest" 2>/dev/null; then
    echo -e "${RED}  ✗ 下载失败: $url${NC}"
    return 1
  fi

  # 尝试下载 sha256 校验文件
  if curl -fsSL "$url.sha256" -o "$dest.sha256" 2>/dev/null; then
    echo "  → 校验 sha256..."

    local expected actual
    expected=$(cat "$dest.sha256" | awk '{print $1}')

    # 检测 sha256sum 或 shasum 命令
    if command -v sha256sum >/dev/null 2>&1; then
      actual=$(sha256sum "$dest" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
      actual=$(shasum -a 256 "$dest" | awk '{print $1}')
    else
      echo -e "${RED}  ✗ 缺少 sha256sum/shasum 命令，无法校验${NC}"
      rm -f "$dest" "$dest.sha256"
      return 1
    fi

    if [[ "$expected" != "$actual" ]]; then
      echo -e "${RED}  ✗ SHA256 校验失败！${NC}"
      echo "    期望: $expected"
      echo "    实际: $actual"
      echo "    可能原因: 文件被篡改或传输错误"
      rm -f "$dest" "$dest.sha256"
      return 1
    fi

    echo -e "  ${GREEN}✓ SHA256 校验通过${NC}"
    rm -f "$dest.sha256"
  else
    echo -e "${YELLOW}  ⚠ 警告: 无法下载校验文件 $url.sha256${NC}"
    echo "    当前无法验证文件完整性（可能是旧版本 Release）"
    read -rp "    是否继续安装？[y/N] " CONTINUE
    if [[ "$CONTINUE" != "y" ]]; then
      rm -f "$dest"
      return 1
    fi
  fi

  return 0
}

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

  # 注册 pre-commit hook（ignore 文件同步检查）
  if [ -f "$PROJECT_ROOT/.git/hooks/pre-commit-sync-ignore-files" ]; then
    ln -sf "../../.git/hooks/pre-commit-sync-ignore-files" "$PROJECT_ROOT/.git/hooks/pre-commit"
    echo "  ✓ pre-commit hook 已注册（ignore 文件同步）"
  fi

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
  local base_url="https://github.com/godlockin/eket/releases"

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

  local tmp_bin
  tmp_bin=$(mktemp)

  if download_and_verify "$download_url" "$tmp_bin"; then
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

# ─────────────────────────────────────────────
# TASK-418: 本地编译 fallback 逻辑
# ─────────────────────────────────────────────
install_local_build() {
  echo -e "${BLUE}═══════════════════════════════════${NC}"
  echo -e "${BLUE}  本地编译模式${NC}"
  echo -e "${BLUE}═══════════════════════════════════${NC}"
  echo "将尝试本地编译 Rust/Node 版本（需源码 + 编译环境）"
  echo ""

  local rust_success=false
  local node_success=false

  # ──────────────────────────────────
  # 1. Rust 本地编译
  # ──────────────────────────────────
  if [ -d "$PROJECT_ROOT/rust/" ] && command -v cargo &>/dev/null; then
    echo -e "${BLUE}[Rust 编译]${NC}"
    echo "  → 检测到 rust/ 目录 + cargo 命令"

    if (cd "$PROJECT_ROOT/rust" && cargo build --release 2>&1 | tail -5); then
      # 尝试多个可能的 binary 名称
      local rust_bin=""
      for name in eket eket-server; do
        if [ -f "$PROJECT_ROOT/rust/target/release/$name" ]; then
          rust_bin="$PROJECT_ROOT/rust/target/release/$name"
          break
        fi
      done

      if [ -n "$rust_bin" ]; then
        mkdir -p "$HOME/.local/bin"
        ln -sf "$rust_bin" "$HOME/.local/bin/eket-rust"
        echo -e "  ${GREEN}✓ Rust 版已编译并符号链接到 ~/.local/bin/eket-rust${NC}"
        echo "     源文件: $rust_bin"
        rust_success=true
      else
        echo -e "  ${RED}✗ Rust 编译产物不存在（预期：eket 或 eket-server）${NC}"
        echo "     检查 target/release 目录内容："
        ls -1 "$PROJECT_ROOT/rust/target/release/" | grep -E "^(eket|eket-)" || echo "     （未找到）"
      fi
    else
      echo -e "  ${RED}✗ Rust 编译失败${NC}"
    fi
  else
    echo -e "${YELLOW}  ⚠ 跳过 Rust 编译（缺少源码或工具链）${NC}"
    [ ! -d "$PROJECT_ROOT/rust/" ] && echo "     → rust/ 目录不存在"
    ! command -v cargo &>/dev/null && echo "     → cargo 未安装（提示：curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh）"
  fi
  echo ""

  # ──────────────────────────────────
  # 2. Node 本地编译
  # ──────────────────────────────────
  if [ -d "$PROJECT_ROOT/node/" ] && command -v npm &>/dev/null; then
    echo -e "${BLUE}[Node 编译]${NC}"
    echo "  → 检测到 node/ 目录 + npm 命令"

    # 安装依赖
    if (cd "$PROJECT_ROOT/node" && npm install --silent 2>&1 | tail -3); then
      echo "  ✓ npm install 完成"
    else
      echo -e "  ${RED}✗ npm install 失败${NC}"
      return 1
    fi

    # 构建
    if (cd "$PROJECT_ROOT/node" && npm run build --silent 2>&1 | tail -3); then
      local node_entry="$PROJECT_ROOT/node/dist/index.js"
      if [ -f "$node_entry" ]; then
        mkdir -p "$HOME/.local/bin"

        # 创建 wrapper 脚本（保证可执行）
        cat > "$HOME/.local/bin/eket-node" <<EOF
#!/usr/bin/env node
require('$node_entry');
EOF
        chmod +x "$HOME/.local/bin/eket-node"
        chmod +x "$node_entry"

        echo -e "  ${GREEN}✓ Node 版已构建并创建 wrapper 到 ~/.local/bin/eket-node${NC}"
        node_success=true
      else
        echo -e "  ${RED}✗ Node 构建产物不存在：$node_entry${NC}"
      fi
    else
      echo -e "  ${YELLOW}⚠ npm run build 有错误（可能是 TypeScript 类型问题）${NC}"
      # 检查 dist/index.js 是否仍然生成
      if [ -f "$PROJECT_ROOT/node/dist/index.js" ]; then
        echo "  → dist/index.js 已生成，尝试创建符号链接"
        mkdir -p "$HOME/.local/bin"
        cat > "$HOME/.local/bin/eket-node" <<EOF
#!/usr/bin/env node
require('$PROJECT_ROOT/node/dist/index.js');
EOF
        chmod +x "$HOME/.local/bin/eket-node"
        echo -e "  ${GREEN}✓ Node 版已创建 wrapper（忽略 TS 错误）${NC}"
        node_success=true
      fi
    fi
  else
    echo -e "${YELLOW}  ⚠ 跳过 Node 编译（缺少源码或工具链）${NC}"
    [ ! -d "$PROJECT_ROOT/node/" ] && echo "     → node/ 目录不存在"
    ! command -v npm &>/dev/null && echo "     → npm 未安装（提示：https://nodejs.org 或 nvm install 22）"
  fi
  echo ""

  # ──────────────────────────────────
  # 3. 结果汇总
  # ──────────────────────────────────
  if [ "$rust_success" = true ] || [ "$node_success" = true ]; then
    echo -e "${GREEN}═══════════════════════════════════${NC}"
    echo -e "${GREEN}  ✓ 本地编译完成${NC}"
    echo -e "${GREEN}═══════════════════════════════════${NC}"
    [ "$rust_success" = true ] && echo "  → Rust 版: eket-rust"
    [ "$node_success" = true ] && echo "  → Node 版: eket-node"

    # PATH 提示
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
      echo ""
      echo -e "${YELLOW}  ⚠ ~/.local/bin 不在 PATH，请手动添加：${NC}"
      echo "     export PATH=\"\$HOME/.local/bin:\$PATH\""
      echo "  或运行：source ~/.bashrc（或 ~/.zshrc）"
    fi
    return 0
  else
    echo -e "${RED}═══════════════════════════════════${NC}"
    echo -e "${RED}  ✗ 本地编译失败（无可用编译环境）${NC}"
    echo -e "${RED}═══════════════════════════════════${NC}"
    echo ""
    echo "  建议："
    echo "    • 安装 Rust: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "    • 安装 Node.js: https://nodejs.org （或 nvm install 22）"
    echo "    • 或使用 Shell Only 模式: bash lib/adapters/hybrid-adapter.sh"
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
