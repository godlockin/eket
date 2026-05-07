#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# EKET 研发版安装脚本 - 本地编译 + Skills 部署
# ═══════════════════════════════════════════════════════════════════════════
# 用途: 供开发者在本地从源码编译 Rust/Node 版本并安装 skills
# 依赖: TASK-506 (scripts/lib/install-skills.sh)
# ═══════════════════════════════════════════════════════════════════════════

set -e

# ───────────────────────────────────────────────────────────────────────────
# 颜色定义
# ───────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ───────────────────────────────────────────────────────────────────────────
# 路径初始化
# ───────────────────────────────────────────────────────────────────────────
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

# ───────────────────────────────────────────────────────────────────────────
# 加载依赖模块
# ───────────────────────────────────────────────────────────────────────────
if [ -f "scripts/lib/install-skills.sh" ]; then
  source scripts/lib/install-skills.sh
else
  echo -e "${RED}✗ 依赖缺失: scripts/lib/install-skills.sh（TASK-506）${NC}"
  exit 1
fi

# ───────────────────────────────────────────────────────────────────────────
# 本地编译 Rust 版
# ───────────────────────────────────────────────────────────────────────────
compile_rust() {
  if [ -d "$PROJECT_ROOT/rust/" ] && command -v cargo &>/dev/null; then
    echo -e "${BLUE}[Rust 编译]${NC}"
    echo "  → 检测到 rust/ 目录 + cargo 命令"

    if (cd "$PROJECT_ROOT/rust" && cargo build --release 2>&1 | tail -5); then
      # 查找可能的 binary 名称
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
        return 0
      else
        echo -e "  ${RED}✗ Rust 编译产物不存在（预期：eket 或 eket-server）${NC}"
        echo "     检查 target/release 目录内容："
        ls -1 "$PROJECT_ROOT/rust/target/release/" | grep -E "^(eket|eket-)" || echo "     （未找到）"
        return 1
      fi
    else
      echo -e "  ${RED}✗ Rust 编译失败${NC}"
      return 1
    fi
  else
    echo -e "${YELLOW}  ⚠ 跳过 Rust 编译（缺少源码或工具链）${NC}"
    [ ! -d "$PROJECT_ROOT/rust/" ] && echo "     → rust/ 目录不存在"
    ! command -v cargo &>/dev/null && echo "     → cargo 未安装（提示：curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh）"
    return 0
  fi
}

# ───────────────────────────────────────────────────────────────────────────
# 本地编译 Node 版
# ───────────────────────────────────────────────────────────────────────────
compile_node() {
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
        return 0
      else
        echo -e "  ${RED}✗ Node 构建产物不存在：$node_entry${NC}"
        return 1
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
        return 0
      else
        echo -e "  ${RED}✗ dist/index.js 未生成${NC}"
        return 1
      fi
    fi
  else
    echo -e "${YELLOW}  ⚠ 跳过 Node 编译（缺少源码或工具链）${NC}"
    [ ! -d "$PROJECT_ROOT/node/" ] && echo "     → node/ 目录不存在"
    ! command -v npm &>/dev/null && echo "     → npm 未安装（提示：https://nodejs.org 或 nvm install 22）"
    return 0
  fi
}

# ───────────────────────────────────────────────────────────────────────────
# 主流程
# ───────────────────────────────────────────────────────────────────────────
main() {
  echo -e "${BLUE}═══════════════════════════════════${NC}"
  echo -e "${BLUE}  EKET 研发版安装（本地编译）${NC}"
  echo -e "${BLUE}═══════════════════════════════════${NC}"
  echo ""

  local rust_success=false
  local node_success=false
  local skills_success=false

  # 编译 Rust
  if compile_rust; then
    rust_success=true
  fi
  echo ""

  # 编译 Node
  if compile_node; then
    node_success=true
  fi
  echo ""

  # 安装 Skills（TASK-506 函数）
  if install_skills; then
    skills_success=true
  fi
  echo ""

  # ─────────────────────────────────────────────────────────────────────────
  # 结果汇总
  # ─────────────────────────────────────────────────────────────────────────
  echo -e "${BLUE}═══════════════════════════════════${NC}"
  if [ "$rust_success" = true ] || [ "$node_success" = true ]; then
    echo -e "${GREEN}✅ 安装完成！${NC}"
    echo ""
    echo "已安装组件:"
    [ "$rust_success" = true ] && echo "  → Rust 版: ~/.local/bin/eket-rust"
    [ "$node_success" = true ] && echo "  → Node 版: ~/.local/bin/eket-node"
    [ "$skills_success" = true ] && echo "  → Skills: ~/.claude/skills/eket/"
    echo ""
    echo "验证安装:"
    [ "$rust_success" = true ] && echo "  eket-rust --version"
    [ "$node_success" = true ] && echo "  eket-node --version"
    echo "  eket doctor           # 环境诊断"

    # PATH 检查
    if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
      echo ""
      echo -e "${YELLOW}⚠️  提示: ~/.local/bin 不在 PATH 中${NC}"
      echo "  建议添加到 ~/.bashrc 或 ~/.zshrc:"
      echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    fi
  else
    echo -e "${RED}✗ 安装失败（无可用编译环境）${NC}"
    echo ""
    echo "请检查:"
    echo "  → Rust 工具链: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "  → Node.js: https://nodejs.org 或 nvm install 22"
    exit 1
  fi
  echo -e "${BLUE}═══════════════════════════════════${NC}"
}

main "$@"
