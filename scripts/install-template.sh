#!/bin/bash
# EKET 安装脚本（简版 - 下载预编译包）
# 本文件由 GitHub Actions 自动生成，请勿手动修改
# 生成时间: {{GENERATED_TIME}}

set -e

VERSION="{{VERSION}}"
BASE_URL="https://github.com/godlockin/eket/releases/download/${VERSION}"

# ─────────────────────────────────────────────────────────────
# 硬编码 SHA256（CI 注入）
# ─────────────────────────────────────────────────────────────
declare -A SHA256_MAP=(
  ["rust-linux-amd64"]="{{RUST_LINUX_SHA256}}"
  ["rust-darwin-arm64"]="{{RUST_DARWIN_ARM_SHA256}}"
  ["rust-darwin-amd64"]="{{RUST_DARWIN_AMD_SHA256}}"
)

# ─────────────────────────────────────────────────────────────
# 平台检测
# ─────────────────────────────────────────────────────────────
detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$OS-$ARCH" in
    linux-x86_64)  echo "linux-amd64" ;;
    darwin-arm64)  echo "darwin-arm64" ;;
    darwin-x86_64) echo "darwin-amd64" ;;
    *) echo "unsupported" ;;
  esac
}

# ─────────────────────────────────────────────────────────────
# 下载 + 校验
# ─────────────────────────────────────────────────────────────
download_and_verify() {
  local platform=$1
  local dest=$2

  # 构建文件名：匹配 release.yml 的命名规范
  local filename
  case "$platform" in
    linux-amd64)   filename="eket-linux-x64" ;;
    darwin-arm64)  filename="eket-macos-arm64" ;;
    darwin-amd64)  filename="eket-macos-x64" ;;
  esac

  local url="${BASE_URL}/${filename}"
  local key="rust-${platform}"
  local expected_sha="${SHA256_MAP[$key]}"

  echo "正在下载: $url"
  curl -fsSL "$url" -o "$dest" || {
    echo "❌ 下载失败"
    return 1
  }

  echo "正在校验 SHA256..."
  local actual_sha
  if command -v sha256sum >/dev/null 2>&1; then
    actual_sha=$(sha256sum "$dest" | awk '{print $1}')
  elif command -v shasum >/dev/null 2>&1; then
    actual_sha=$(shasum -a 256 "$dest" | awk '{print $1}')
  else
    echo "⚠️  未找到 sha256sum/shasum，跳过校验"
    return 0
  fi

  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "❌ SHA256 校验失败！"
    echo "  期望: $expected_sha"
    echo "  实际: $actual_sha"
    rm -f "$dest"
    return 1
  fi

  echo "✅ 校验通过"
  return 0
}

# ─────────────────────────────────────────────────────────────
# Skills 安装（嵌入 TASK-506 逻辑）
# ─────────────────────────────────────────────────────────────
install_skills() {
  local skills_dest="$HOME/.claude/skills/eket"
  local skills_url="${BASE_URL}/eket-skills.tar.gz"

  echo "正在安装 EKET skills..."

  # 下载 skills tarball
  curl -fsSL "$skills_url" -o /tmp/eket-skills.tar.gz || {
    echo "❌ Skills 下载失败"
    return 1
  }

  # 解压到目标目录
  mkdir -p "$(dirname "$skills_dest")"
  rm -rf "$skills_dest"
  tar -xzf /tmp/eket-skills.tar.gz -C "$HOME/.claude/skills/"
  rm -f /tmp/eket-skills.tar.gz

  if [ -f "$skills_dest/SKILL.md" ]; then
    echo "✅ Skills 已安装: $skills_dest"
    echo "   Claude Code 中输入 '/eket' 或 '召唤 EKET 团队' 即可使用"
    return 0
  else
    echo "❌ Skills 安装失败（SKILL.md 未找到）"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────
# 主流程
# ─────────────────────────────────────────────────────────────
main() {
  echo "═══════════════════════════════════"
  echo "  EKET 安装脚本 ${VERSION}"
  echo "═══════════════════════════════════"
  echo ""

  PLATFORM=$(detect_platform)

  if [[ "$PLATFORM" == "unsupported" ]]; then
    echo "❌ 不支持的平台: $(uname -s)-$(uname -m)"
    echo "   支持的平台: Linux x64 / macOS x64 / macOS arm64"
    exit 1
  fi

  echo "检测到平台: $PLATFORM"
  echo ""

  # 安装 Rust CLI
  echo "[1/2] 安装 EKET CLI..."
  if download_and_verify "$PLATFORM" "/tmp/eket"; then
    sudo mv /tmp/eket /usr/local/bin/eket
    sudo chmod +x /usr/local/bin/eket
    echo "✅ CLI 安装完成 (/usr/local/bin/eket)"
  else
    echo "❌ CLI 安装失败"
    exit 1
  fi

  # Skills 安装
  echo "[2/2] 安装 Skills..."
  install_skills || {
    echo "❌ Skills 安装失败"
    exit 1
  }

  echo ""
  echo "═══════════════════════════════════"
  echo "✅ EKET 安装完成！"
  echo ""
  echo "验证安装:"
  echo "  eket --version"
  echo ""
  echo "启动 EKET:"
  echo "  在 Claude Code 中输入 '/eket' 或 '召唤 EKET 团队'"
  echo "═══════════════════════════════════"
}

main
