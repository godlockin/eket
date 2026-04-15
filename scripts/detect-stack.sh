#!/usr/bin/env bash
# detect-stack.sh — 探测项目技术栈，输出对应质量工具命令矩阵
# 用法: source scripts/detect-stack.sh [dir] → 设置 STACK 变量
# 直接执行: ./scripts/detect-stack.sh [dir] → 打印技术栈和工具命令

set -euo pipefail

detect_stack() {
  local dir="${1:-.}"
  if [[ -f "$dir/package.json" ]]; then echo "node"
  elif [[ -f "$dir/pyproject.toml" || -f "$dir/requirements.txt" ]]; then echo "python"
  elif [[ -f "$dir/go.mod" ]]; then echo "go"
  elif [[ -f "$dir/Cargo.toml" ]]; then echo "rust"
  else echo "shell"
  fi
}

print_quality_tools() {
  local stack="$1"
  case "$stack" in
    node)
      echo "=== Node.js 质量四件套 ==="
      echo "  build:  npm run build"
      echo "  lint:   npm run lint"
      echo "  test:   npm test"
      echo "  audit:  npm audit --audit-level=high"
      ;;
    python)
      echo "=== Python 质量四件套 ==="
      echo "  typecheck: mypy src/"
      echo "  lint:      ruff check ."
      echo "  test:      pytest"
      echo "  audit:     pip-audit  # 或 safety check"
      ;;
    go)
      echo "=== Go 质量四件套 ==="
      echo "  build:   go build ./..."
      echo "  lint:    golangci-lint run"
      echo "  test:    go test ./..."
      echo "  audit:   govulncheck ./..."
      ;;
    rust)
      echo "=== Rust 质量四件套 ==="
      echo "  build:   cargo build"
      echo "  lint:    cargo clippy -- -D warnings"
      echo "  test:    cargo test"
      echo "  audit:   cargo audit"
      ;;
    shell)
      echo "=== Shell/通用 质量工具 ==="
      echo "  lint:     shellcheck scripts/*.sh"
      echo "  validate: bash scripts/validate-ticket-template.sh"
      ;;
  esac
}

# 主程序：直接执行时输出信息
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  TARGET_DIR="${1:-.}"
  STACK=$(detect_stack "$TARGET_DIR")
  export STACK
  echo "检测到技术栈: $STACK (目录: $TARGET_DIR)"
  echo ""
  print_quality_tools "$STACK"
fi
