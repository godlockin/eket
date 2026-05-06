#!/usr/bin/env bash
# Test script for sync-ignore-files.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEST_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_DIR"' EXIT

echo "🧪 Testing sync-ignore-files.sh..."

# ─── Test 1: 语言检测 ─────────────────────────────────────────────────────────

test_language_detection() {
  local project="$TEST_DIR/test-detect"
  mkdir -p "$project/rust" "$project/node" "$project/scripts/ignore-rules"

  # Copy script
  cp "$SCRIPT_DIR/scripts/sync-ignore-files.sh" "$project/scripts/"
  cp -r "$SCRIPT_DIR/scripts/ignore-rules/"*.rules "$project/scripts/ignore-rules/"

  # Create language markers
  touch "$project/rust/Cargo.toml"
  touch "$project/node/package.json"

  cd "$project"
  bash scripts/sync-ignore-files.sh >/dev/null

  # Verify rust rules present
  if ! grep -q "# Rust build artifacts" .gitignore; then
    echo "❌ Test 1 failed: Rust rules not found"
    return 1
  fi

  # Verify node rules present
  if ! grep -q "# Node.js dependencies" .gitignore; then
    echo "❌ Test 1 failed: Node.js rules not found"
    return 1
  fi

  echo "✅ Test 1 passed: Language detection works"
}

# ─── Test 2: --check 模式 ─────────────────────────────────────────────────────

test_check_mode() {
  local project="$TEST_DIR/test-check"
  mkdir -p "$project/rust" "$project/scripts/ignore-rules"

  cp "$SCRIPT_DIR/scripts/sync-ignore-files.sh" "$project/scripts/"
  cp -r "$SCRIPT_DIR/scripts/ignore-rules/"*.rules "$project/scripts/ignore-rules/"
  touch "$project/rust/Cargo.toml"

  cd "$project"
  bash scripts/sync-ignore-files.sh >/dev/null

  # First check should pass
  if ! bash scripts/sync-ignore-files.sh --check >/dev/null 2>&1; then
    echo "❌ Test 2 failed: --check should pass after sync"
    return 1
  fi

  # Modify .gitignore manually
  echo "# manual edit" >> .gitignore

  # Check should fail
  if bash scripts/sync-ignore-files.sh --check >/dev/null 2>&1; then
    echo "❌ Test 2 failed: --check should fail after manual edit"
    return 1
  fi

  echo "✅ Test 2 passed: --check detects manual edits"
}

# ─── Test 3: 多 ignore 文件生成 ──────────────────────────────────────────────

test_multiple_ignore_files() {
  local project="$TEST_DIR/test-multi"
  mkdir -p "$project/rust" "$project/scripts/ignore-rules"

  cp "$SCRIPT_DIR/scripts/sync-ignore-files.sh" "$project/scripts/"
  cp -r "$SCRIPT_DIR/scripts/ignore-rules/"*.rules "$project/scripts/ignore-rules/"
  touch "$project/rust/Cargo.toml"
  touch "$project/Dockerfile"

  cd "$project"
  bash scripts/sync-ignore-files.sh >/dev/null

  # Verify all 3 files generated
  if [[ ! -f .gitignore ]] || [[ ! -f .dockerignore ]] || [[ ! -f .claudeignore ]]; then
    echo "❌ Test 3 failed: Missing ignore files"
    return 1
  fi

  # Verify .dockerignore has docker-extra rules
  if ! grep -q "# Docker-specific extras" .dockerignore; then
    echo "❌ Test 3 failed: .dockerignore missing docker-extra rules"
    return 1
  fi

  # Verify .claudeignore has media file rules
  if ! grep -q "*.mp4" .claudeignore; then
    echo "❌ Test 3 failed: .claudeignore missing media rules"
    return 1
  fi

  echo "✅ Test 3 passed: Multiple ignore files generated correctly"
}

# ─── Run Tests ────────────────────────────────────────────────────────────────

test_language_detection
test_check_mode
test_multiple_ignore_files

echo ""
echo "✅ All tests passed"
