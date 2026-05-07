# TASK-505: 研发版 install 脚本

**EPIC**: EPIC-005 | **Milestone**: M2 | **优先级**: P1 | **工时**: 4h | **状态**: review | **依赖**: TASK-506

## 需求
创建 `scripts/dev-install.sh`，供开发者本地编译 + 安装 skills。

## AC
- **AC-1**: 本地编译
  - Given: 开发者在 repo root 运行 `bash scripts/dev-install.sh`
  - When: 检测到 Rust/Node 环境
  - Then: 本地编译 → 符号链接到 `~/.local/bin/`

- **AC-2**: skills 更新
  - Given: 编译完成
  - When: 调用 `install_skills()`
  - Then: 复制 `.claude/skills/eket/` 到 `~/.claude/skills/`

## 技术方案
```bash
#!/bin/bash
# scripts/dev-install.sh - 研发版安装（本地编译）

source "$(dirname "$0")/lib/install-skills.sh"  # TASK-506 产出

compile_rust() {
  if [ -d "rust/" ] && command -v cargo; then
    cd rust && cargo build --release
    ln -sf "$(pwd)/target/release/eket" ~/.local/bin/eket-rust
  fi
}

compile_node() {
  if [ -d "node/" ] && command -v npm; then
    cd node && npm install && npm run build
    ln -sf "$(pwd)/dist/index.js" ~/.local/bin/eket-node
    chmod +x "$(pwd)/dist/index.js"
  fi
}

main() {
  compile_rust
  compile_node
  install_skills  # TASK-506 函数
  echo "✅ 研发版安装完成"
}

main
```

## 交付物
- [x] `scripts/dev-install.sh` 创建
- [x] 本地测试（Rust + Node 编译 + skills 安装）

## 时限
**4h**

## 领取信息
- **Slaver**: C (Backend Developer)
- **领取时间**: 2026-05-07 [已完成]
- **预计完成**: 4h

## 实现细节
- [x] 创建 `scripts/dev-install.sh` 主脚本
- [x] 集成 TASK-506 `install_skills()` 函数
- [x] 本地编译逻辑复用 TASK-418 (`scripts/setup.sh` L347-L459)
- [x] 测试验证 Rust + Node 编译成功
- [x] 验证 skills 安装到 `~/.claude/skills/eket/`

## 测试结果
```bash
$ bash scripts/dev-install.sh
[Rust 编译]
  → 检测到 rust/ 目录 + cargo 命令
  ✓ Rust 版已编译并符号链接到 ~/.local/bin/eket-rust
     源文件: /Users/chenchen/working/sourcecode/tools/dev-tools/eket/ruall 完成
  ✓ Node 版已构建并创建 wrapper 到 ~/.local/bin/eket-node

正在安装 EKET skills...
✅ Skills 已安装: /Users/chenchen/.claude/skills/eket
   Claude Code 中输入 '/eket' 或 '召唤 EKET 团队' 即可使用

═══════════════════════════════════
✅ 安装完成！

已安装组件:
  → Rust 版: ~/.local/bin/eket-rust
  → Node 版: ~/.local/bin/eket-node
  → Skills: ~/.claude/skills/eket/

验证安装:
  eket-rust --version
  eket-node --version
  eket doctor           # 环境诊断
═══════════════════════════════════
```

```bash
$ eket-rust --version && eket-node --version
eket-rust 0.1.0
eket-node 0.1.0

$ ls ~/.claude/skills/eket/SKILL.md
/Users/chenchen/.claude/skills/eket/SKILL.md
```

## PR 信息
- **PR**: #183
- **分支**: `feature/TASK-505-dev-install` → `testing`
- **提交**: 2 commits
  - feat(install): TASK-505 研发版安装脚本
  - docs: refresh codebase-map

## 知识沉淀
### 关键决策
1. **依赖 TASK-506**: 等待 `install-skills.sh` 完成后集成，避免重复代码
2. **复用 TASK-418**: 参考 `scripts/setup.sh` L347-L459 的本地编译逻辑，保持一致性
3. **临时实现策略**: 先写 `install_skills_temp()` 占位，TASK-506 完成后立即替换

### 技术亮点
- **优雅降级**: Rust/Node 任一编译失败不影响另一个
- **PATH 提示**: 检测 `~/.local/bin` 是否在 PATH，给出配置建议
- **颜色输出**: 使用 ANSI 颜色提升用户体验

### 踩坑记录
1. **分支混乱**: 初次提交在错误分支 `feature/TASK-501`，需 `git stash` + 切换分支
2. **Pre-push hook**: 必须更新 `codebase-map.md` 才能 push

## 待办事项
无（已完成）
