---
name: repo-slimming
type: lesson
created: 2026-05-27
source: manual-cleanup-session
tags: [git, repo-size, git-filter-repo, devops]
confidence: high
---

# 仓库瘦身经验

> rust/target/ 和 node_modules/ 误提交导致 .git 膨胀至 2.8GB

## 背景

EKET 仓库在开发过程中意外将编译产物和依赖目录提交到 Git 历史:
- `rust/target/` - Rust 编译输出
- `node_modules/` - Node.js 依赖

## 问题规模

| 指标 | 清理前 | 清理后 |
|------|--------|--------|
| .git 目录 | 2.8GB | 37MB |
| 压缩率 | - | 98.7% |

## 解决方案

### 使用 git-filter-repo 重写历史

```bash
# 安装 (macOS)
brew install git-filter-repo

# 清理大目录
git filter-repo --path rust/target/ --invert-paths
git filter-repo --path node_modules/ --invert-paths

# 清理后强制推送 (危险操作，需团队协调)
git push origin --force --all
```

### 预防措施

**1. .gitignore 必备条目**

```gitignore
# Rust
rust/target/
*.rlib
*.rmeta

# Node.js
node_modules/
*.tgz

# 编译产物
dist/
build/
*.o
*.so
*.dylib
```

**2. 提交前检查脚本**

```bash
#!/bin/bash
# scripts/pre-commit-size-check.sh

MAX_SIZE_MB=10

for file in $(git diff --cached --name-only); do
  size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null)
  size_mb=$((size / 1024 / 1024))
  if [ "$size_mb" -gt "$MAX_SIZE_MB" ]; then
    echo "ERROR: $file is ${size_mb}MB (max ${MAX_SIZE_MB}MB)"
    exit 1
  fi
done
```

**3. 定期检查仓库大小**

```bash
# 检查 .git 目录大小
du -sh .git

# 检查历史中的大文件
git rev-list --objects --all | \
  git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' | \
  awk '/^blob/ {print $3, $4}' | sort -rn | head -20
```

## 核心教训

1. **CI 门禁**: 添加 .git 目录大小检查到 CI，超过阈值 (如 100MB) 告警
2. **定期审计**: 每月检查仓库大小趋势
3. **新成员 Onboarding**: 确保所有开发者理解 .gitignore 的重要性

## 相关工具

- [git-filter-repo](https://github.com/newren/git-filter-repo) - 历史重写 (推荐)
- [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) - 替代方案
- `git gc --aggressive` - 常规垃圾回收

---

**注意**: 历史重写是破坏性操作，执行前必须:
1. 通知所有团队成员
2. 备份仓库
3. 协调强制推送时间窗口
