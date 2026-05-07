#!/bin/bash
# EKET 安装脚本（简版 - 仅 Rust 预编译包）
# 本文件由 GitHub Actions 自动生成
# 生成时间: {{GENERATED_TIME}}

set -e

VERSION="{{VERSION}}"
BASE_URL="https://github.com/godlockin/eket/releases/download/${VERSION}"

declare -A SHA256_MAP=(
  ["linux-amd64"]="{{RUST_LINUX_SHA256}}"
  ["darwin-arm64"]="{{RUST_DARWIN_ARM_SHA256}}"
  ["darwin-amd64"]="{{RUST_DARWIN_AMD_SHA256}}"
)

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

# Rust 命名映射：platform → release filename
map_rust_filename() {
  case $1 in
    linux-amd64)   echo "eket-linux-x64" ;;
    darwin-arm64)  echo "eket-macos-arm64" ;;
    darwin-amd64)  echo "eket-macos-x64" ;;
  esac
}

download_and_verify() {
  local platform=$1
  local dest=$2
  local filename=$(map_rust_filename "$platform")
  local url="${BASE_URL}/${filename}"
  local expected_sha="${SHA256_MAP[$platform]}"
  
  echo "下载: $url"
  curl -fsSL "$url" -o "$dest" || {
    echo "❌ 下载失败"
    return 1
  }
  
  echo "校验 SHA256..."
  local actual_sha=$(sha256sum "$dest" 2>/dev/null || shasum -a 256 "$dest" | awk '{print $1}')
  
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "❌ SHA256 校验失败"
    rm -f "$dest"
    return 1
  fi
  
  echo "✅ 校验通过"
  return 0
}

install_skills() {
  local skills_dest="$HOME/.claude/skills/eket"
  local skills_url="${BASE_URL}/eket-skills.tar.gz"
  
  echo "安装 Skills..."
  curl -fsSL "$skills_url" -o /tmp/eket-skills.tar.gz || return 1
  
  mkdir -p "$(dirname "$skills_dest")"
  rm -rf "$skills_dest"
  tar -xzf /tmp/eket-skills.tar.gz -C "$HOME/.claude/skills/"
  rm -f /tmp/eket-skills.tar.gz
  
  [ -f "$skills_dest/SKILL.md" ] && echo "✅ Skills 已安装" || return 1
}

main() {
  echo "═══════════════════════════════════"
  echo "  EKET 安装 ${VERSION}"
  echo "═══════════════════════════════════"
  
  PLATFORM=$(detect_platform)
  [[ "$PLATFORM" == "unsupported" ]] && echo "❌ 不支持平台" && exit 1
  
  echo "平台: $PLATFORM"
  echo ""
  
  echo "[1/2] 安装 EKET (Rust)..."
  download_and_verify "$PLATFORM" "/tmp/eket" || exit 1
  sudo mv /tmp/eket /usr/local/bin/eket
  sudo chmod +x /usr/local/bin/eket
  echo "✅ 已安装"
  
  echo "[2/2] 安装 Skills..."
  install_skills || exit 1
  
  echo ""
  echo "✅ 安装完成！"
  echo ""
  echo "验证: eket --version"
  echo "诊断: eket doctor"
  echo "Claude: 输入 '/eket' 或 '召唤 EKET 团队'"
  echo ""
  echo "研发版（本地编译 Rust + Node）:"
  echo "  git clone https://github.com/godlockin/eket.git"
  echo "  cd eket && bash scripts/dev-install.sh"
  echo "═══════════════════════════════════"
}

main
