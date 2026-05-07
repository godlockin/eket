#!/bin/bash
# 临时测试脚本

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# 定义 install_local_build 函数
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

# 执行函数
install_local_build
