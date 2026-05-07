#!/bin/bash
# EKET Skills 安装共享函数
# 用途：为 install.sh / dev-install.sh 提供统一的 skills 安装逻辑

install_skills() {
  # 支持两种场景：
  # 1. CI 生成的 install.sh（skills 作为独立 tarball 下载）
  # 2. 研发版 dev-install.sh（直接从 repo 复制）

  local skills_src="${EKET_SKILLS_SRC:-${PROJECT_ROOT:-.}/.claude/skills/eket}"
  local skills_dest="$HOME/.claude/skills/eket"

  echo "正在安装 EKET skills..."

  # 检查源目录
  if [ ! -d "$skills_src" ]; then
    echo "⚠️  源 skills 目录不存在: $skills_src"

    # fallback: 从 GitHub 下载（简版 install.sh 场景）
    if [ -n "$EKET_SKILLS_URL" ]; then
      echo "  → 尝试从 $EKET_SKILLS_URL 下载..."

      # 下载到临时目录验证
      local tmp_dir=$(mktemp -d)
      if curl -fsSL "$EKET_SKILLS_URL" 2>/dev/null | tar -xz -C "$tmp_dir" 2>/dev/null; then
        if [ -d "$tmp_dir/eket" ] && [ -f "$tmp_dir/eket/SKILL.md" ]; then
          mkdir -p "$HOME/.claude/skills"
          rm -rf "$skills_dest"
          mv "$tmp_dir/eket" "$skills_dest"
          rm -rf "$tmp_dir"
          echo "✅ Skills 已从远程安装"
          return 0
        fi
      fi

      rm -rf "$tmp_dir"
      echo "⚠️  远程下载失败"
    fi

    echo "❌ Skills 安装失败"
    return 1
  fi

  # 创建目标目录
  mkdir -p "$(dirname "$skills_dest")"

  # 完整复制（覆盖旧版本）
  rm -rf "$skills_dest"
  cp -r "$skills_src" "$skills_dest"

  # 验证
  if [ -f "$skills_dest/SKILL.md" ]; then
    echo "✅ Skills 已安装: $skills_dest"
    echo "   Claude Code 中输入 '/eket' 或 '召唤 EKET 团队' 即可使用"
    return 0
  else
    echo "❌ Skills 安装失败（SKILL.md 不存在）"
    return 1
  fi
}

# 允许直接执行（测试用）
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  install_skills
fi
