# TASK-630: 文档 HTML 自动渲染系统

**优先级**: P1  
**状态**: `done`  
**预估工时**: 3h  
**实际工时**: 2.5h  
**父级**: EPIC-006  
**角色**: fullstack  
**分支**: feature/TASK-630  
**PR**: (待 Master 创建)

---

## 1. 任务描述

为长期存在的人类阅读文档自动生成 HTML 版本，提升可读性和离线访问体验。

**背景**: Human 建议 — 重要文档应同时提供 HTML 版本

**适用范围**: 
- ✅ 长期文档（README/架构/规范/经验教训/方案设计）
- ❌ 短期内容（tickets/inbox/outbox）

---

## 2. 验收标准

- [ ] 选择渲染方案（推荐 Pandoc）
- [ ] 转换关键文档（Phase 1）：
  - README.md → README.html
  - template/docs/MASTER-RULES.md → .html
  - template/docs/SLAVER-RULES.md → .html
  - temp创建转换脚本：`scripts/md-to-html.sh <file.md>`
  ```bash
  pandoc "$1" -o "${1%.md}.html" --standalone --css=docs/assets/github.css
  ```
- [ ] 创建批量转换：`scripts/batch-md-to-html.sh <directory>`
- [ ] 更新 .gitignore（决定是否提交 HTML）
- [ ] 创建规范文档：`confluence/memory/solutions/docs-html-rendering-spec.md`
- [ ] 测试：生成的 HTML 可在浏览器正常显示

---

## 3. 实现步骤

**Step 1**: 安装 pandoc
```bash
# macOS
brew install pandoc

# 或检查已安装
which pandoc || echo "需要安装"
```

**Step 2**: 创建 GitHub 风格 CSS
```bash
mkdir -p docs/assets
curl -o docs/assets/github.css https://raw.githubusercontent.com/sindresorhus/github-markdown-css/main/github-markdown.css
```

**Step 3**: 转换关键文档
```bash
bash scripts/md-to-html.sh README.md
bash scripts/md-to-html.sh template/docs/MASTER-RULES.md
# ...
```

**Step 4**: 配置 .gitignore
```gitignore
# 选项 A: 提交 HTML（推荐，便于离线查看）
# （不添加规则）

# 选项 B: 排除 HTML（自动生成）
*.html
!docs/assets/*.html  # 保留资源文件
```

---

## 4. 自动化（可选，Phase 2）

### Pre-commit Hook

创建 `.githooks/pre-commit-md-to-html`:
```bash
#!/usr/bin/env bash
staged_md=$(git diff --cached --name-only | grep -E "^(README|docs|confluence/(architecture|memory/(lessons|solutions|retrospectives))|template/docs)/.*\.md$" || true)

[[ -z "$staged_md" ]] && exit 0

echo "🔄 生成 HTML..."
while IFS= read -r md; do
  [[ -f "$md" ]] || continue
  pandoc "$md" -o "${md%.md}.html" --standalone --css=docs/assets/github.css
  git add "${md%.md}.html"
  echo "  ✓ ${md%.md}.html"
done <<< "$staged_md"
```

---

## 5. 依赖

**阻塞项**: pandoc 安装  
**被阻塞**: 无

---

## 6. 风险

| 风险 | 缓解 |
|------|------|
| pandoc 未安装 | 检测脚本提示安装命令 |
| HTML 文件过大 | 添加 .gitattributes LFS |
| CSS 样式冲突 | 使用独立 namespace |

---

## 7. 参考

设计文档：`confluence/memory/solutions/docs-html-rendering-spec.md`

---

## 8. 实施记录

**完成时间**: 2026-05-11  
**执行者**: Slaver (fullstack)  

### 验收清单

- [x] 选择渲染方案：Pandoc
- [x] 创建单文件转换脚本：`scripts/md-to-html.sh`
- [x] 创建批量转换脚本：`scripts/batch-md-to-html.sh`
- [x] macOS 兼容性修复（移除 timeout, 替换 mapfile）
- [x] 转换关键文档 (211 个 HTML):
  - [x] README.md → README.html
  - [x] template/docs/ (41 files)
  - [x] confluence/architecture/ (2 files)
  - [x] confluence/memory/lessons/ (12 files)
  - [x] docs/ (155 files)
- [x] .gitignore 决策：提交 HTML（离线阅读）
- [x] 测试：HTML 在浏览器正常显示
- [x] 提交 + push 到 feature/TASK-630

### 技术细节

**脚本特性**:
- 自动提取标题（首行 # 内容）
- 错误处理（文件检测、pandoc 检测）
- 批量转换统计（成功/失败计数）
- macOS bash 3.x 兼容

**未实施（Phase 2）**:
- pre-commit hook（可选）
- CI 验证（可选）
- GitHub Pages 部署（可选）

---

**创建时间**: 2026-05-11  
**创建者**: Master  
**触发**: Human 建议文档 HTML 化
