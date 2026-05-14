# 文档 HTML 渲染规范

**创建时间**: 2026-05-11  
**来源**: Human 建议  
**适用**: 长期存在的人类阅读文档

---

## 规则

### 触发条件

创建或更新以下类型文档时，**必须**同时生成 HTML 版本：

| 文档类型 | 位置 | 示例 |
|---------|------|------|
| 项目说明 | README.md | README.html |
| 架构设计 | confluence/architecture/ | *.html |
| 使用指南 | docs/ | installation.html |
| 开发规范 | template/docs/ | MASTER-RULES.html |
| 经验教训 | confluence/memory/lessons/ | *.html |
| 复盘记录 | confluence/memory/retrospectives/ | *.html |
| 方案设计 | confluence/memory/solutions/ | *.html |

### 不需要 HTML 的文档

**短期存在**：
- ❌ jira/tickets/ (任务卡片，完成后归档)
- ❌ jira/epics/ (EPIC 定义，完成后不再修改)
- ❌ inbox/outbox/ (临时通信)
- ❌ .eket/logs/ (日志文件)

**自动生成**：
- ❌ node/dist/ (编译产物)
- ❌ confluence/memory/codebase-map.md (脚本生成)

---

## 实现方式

### 方案 A: Pandoc（推荐）

```bash
# 安装
brew install pandoc  # macOS
apt-get install pandoc  # Linux

# 转换
pandoc README.md -o README.html --standalone --css=docs/assets/github.css

# 批量转换
find docs/ confluence/ -name "*.md" -type f | while read f; do
  pandoc "$f" -o "${f%.md}.html" --standalone --css=docs/assets/github.css
done
```

### 方案 B: Node.js marked

```bash
cd node
npm install --save-dev marked

# 脚本：scripts/md-to-html.js
const { marked } = require('marked');
const fs = require('fs');

const md = fs.readFileSync(process.argv[2], 'utf8');
const html = marked(md);
fs.writeFileSync(process.argv[2].replace('.md', '.html'), html);
```

### 方案 C: GitHub Pages（自动渲染）

在 `.github/workflows/deploy-docs.yml` 配置自动部署。

---

## Git 管理

### .gitignore 配置

```gitignore
# 排除自动生成的 HTML（可选）
*.html

# 但保留手动编写的 HTML
!docs/assets/*.html
```

或**提交 HTML**（便于离线查看）：
```bash
git add *.html
git commit -m "docs: add HTML versions for offline reading"
```

---

## 自动化集成

### Pre-commit Hook

创建 `.githooks/pre-commit-md-to-html`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 检测 staged .md 文件
staged_md=$(git diff --cached --name-only | grep -E "^(docs|confluence/architecture|confluence/memory/(lessons|solutions|retrospectives))/.*\.md$" || true)

if [[ -z "$staged_md" ]]; then
  exit 0
fi

echo "🔄 检测到长期文档修改，生成 HTML..."

while IFS= read -r md_file; do
  if [[ -f "$md_file" ]]; then
    html_file="${md_file%.md}.html"
    pandoc "$md_file" -o "$html_file" --standalone --css=docs/assets/github.css
    git add "$html_file"
    echo "  ✓ $html_file"
  fi
done <<< "$staged_md"

echo "✅ HTML 生成完成"
```

### CI 验证

`.github/workflows/docs-html-check.yml`:

```yaml
name: Docs HTML Check

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install pandoc
        run: sudo apt-get install -y pandoc
      
      - name: Check MD files have corresponding HTML
        run: bash scripts/check-docs-html.sh
```

---

## 迁移计划

### Phase 1: 关键文档（立即执行）

```bash
# 转换核心文档
pandoc README.md -o README.html --standalone
pandoc template/docs/MASTER-RULES.md -o template/docs/MASTER-RULES.html --standalone
pandoc template/docs/SLAVER-RULES.md -o template/docs/SLAVER-RULES.html --standalone
pandoc template/docs/EXPERT-PANEL-PLAYBOOK.md -o template/docs/EXPERT-PANEL-PLAYBOOK.html --standalone
```

### Phase 2: 批量转换（本周）

```bash
# confluence/architecture
find confluence/architecture/ -name "*.md" -exec pandoc {} -o {}.html --standalone \;

# confluence/memory/lessons
find confluence/memory/lessons/ -name "*.md" -exec pandoc {} -o {}.html --standalone \;

# docs/
find docs/ -name "*.md" -exec pandoc {} -o {}.html --standalone \;
```

### Phase 3: 自动化（下周）

安装 pre-commit hook + CI check

---

## 创建实施 Ticket

**TASK-630**: 实现文档 HTML 自动渲染系统

**优先级**: P1  
**预估**: 3h

---

**创建时间**: 2026-05-11  
**创建者**: Master  
**触发**: Human 建议 MD 文档同步生成 HTML
