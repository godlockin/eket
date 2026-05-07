# TASK-506: Skills 安装逻辑抽取

**EPIC**: EPIC-005 | **Milestone**: M2 | **优先级**: P0 | **工时**: 3h | **状态**: ready | **依赖**: 无

## 需求
创建 `scripts/lib/install-skills.sh`，提供 `install_skills()` 函数供简版和研发版共用。

## AC
- **AC-1**: 函数实现
  - Given: 调用 `install_skills`
  - When: 函数执行
  - Then: 复制 `.claude/skills/eket/` → `~/.claude/skills/eket/`

- **AC-2**: 幂等性
  - Given: 重复调用 `install_skills`
  - When: skills 已存在
  - Then: 覆盖安装，无报错

- **AC-3**: 验证
  - Given: 安装完成
  - When: 检查 `~/.claude/skills/eket/SKILL.md`
  - Then: 文件存在且内容正确

## 技术方案
```bash
#!/bin/bash
# scripts/lib/install-skills.sh - Skills 安装共享函数

install_skills() {
  SKILLS_SRC="${PROJECT_ROOT:-.}/.claude/skills/eket"
  SKILLS_DEST="$HOME/.claude/skills/eket"
  
  if [ ! -d "$SKILLS_SRC" ]; then
    echo "⚠️  源 skills 目录不存在: $SKILLS_SRC"
    return 1
  fi
  
  echo "正在安装 EKET skills..."
  mkdir -p "$(dirname "$SKILLS_DEST")"
  
  # 完整复制（覆盖旧版本）
  rm -rf "$SKILLS_DEST"
  cp -r "$SKILLS_SRC" "$SKILLS_DEST"
  
  echo "✅ Skills 已安装: $SKILLS_DEST"
  echo "   Claude Code 中输入 '/eket' 或 '召唤 EKET 团队' 即可使用"
  
  return 0
}

# 允许直接执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  install_skills
fi
```

## 交付物
- [ ] `scripts/lib/install-skills.sh` 创建
- [ ] 测试验证（本地运行 `bash scripts/lib/install-skills.sh`）

## 时限
**3h**
