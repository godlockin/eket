# 任务完成后标准检查清单 — EKET Post-Task Checklist

## 使用场景

**触发时机**:
- 单个 Ticket 完成后
- 一批任务完成后
- EPIC/Sprint 完成后
- 用户问"做好了吗"时

**目的**: 确保无遗漏、无冗余、经验沉淀

---

## ✅ 4 项强制检查

### 1️⃣ 文档是否更新？

**检查清单**:

```bash
# 1.1 检查未提交的文档
git status --short | grep "\.md$"

# 1.2 检查 confluence/memory/ 是否有新文件
ls -lt confluence/memory/*.md | head -5

# 1.3 检查 memory-index.md 是否同步
git diff confluence/memory/memory-index.md

# 1.4 检查 jira/tickets/ 状态是否更新
grep -l "状态.*donmd
- ❌ Ticket 状态未同步（MD 显示 done 但未提交）
- ❌ 复盘节未填写（TODO 占位）
- ❌ EPIC 完成但 requirement-analysis.md 未归档

**修复**:
```bash
# 更新索引
vim confluence/memory/memory-index.md  # 补充新文件

# 验证一致性
bash scripts/check-requirement-analysis.sh <EPIC-ID>  # EPIC 专用
```

---

### 2️⃣ 要不要更新本地 skills？

**检查清单**:

```bash
# 2.1 skill 源文件是否变更
git diff eket/.claude/skills/eket/SKILL.md

# 2.2 检查本地 skill 与源文件差异
diff eket/.claude/skills/eket/SKILL.md ~/.claude/skills/eket/SKILL.md

# 2.3 检查是否有 evolution.json 待同步
ls ~/.claude/pending-evolutions.jsonl 2>/dev/null
```

**决策树**:
```
IF skill 源文件有变更:
  → bash scripts/install-skill.sh --update
  → 验证: diff 应无差异

IF 有 pending-evolutions.jsonl:
  → Stop hook 会自动 flush
  → 手动检查: cat .claude/skills/eket/evolution.json
  
IF 都无变更:
  → 跳过
```

**常见遗漏**:
- ❌ 改了源文件但未执行 install-skill.sh
- ❌ 本地 skill 过时，下次启动加载旧版本
- ❌ evolution.json 未同步到 skill 目录

**修复**:
```bash
bash scripts/install-skill.sh --update
diff eket/.claude/skills/eket/SKILL.md ~/.claude/skills/eket/SKILL.md
```

---

### 3️⃣ 有没有经验教训？

**检查清单**:

```bash
# 3.1 本批任务是否踩坑
grep -r "TODO\|FIXME\|HACK\|问题\|坑" jira/tickets/TASK-*.md | grep -v archive

# 3.2 是否发现通用模式
grep -r "模式\|pattern\|解法" jira/tickets/TASK-*.md | grep -v archive

# 3.3 复盘节是否填写
grep -L "## 复盘" jira/tickets/TASK-*.md | grep -v archive | wc -l

# 3.4 是否创建了 lessons-learned 文件
ls -lt confluence/memory/lessons/*.md | head -3
```

**决策树**:
```
遇到坑（非显然问题）:
  → confluence/memory/pitfalls/{症状描述}.md

发现通用解法:
  → confluence/memory/patterns/{主题}.md

单次任务经验:
  → confluence/memory/lessons/{主题}.md
  → 或写入 ticket ## 复盘节

批量任务总结:
  → confluence/memory/lessons-learned-YYYY-MM-DD.md
```

**常见遗漏**:
- ❌ 遇到坑但只写在 ticket，未沉淀到 pitfalls/
- ❌ 复盘节只有 TODO，未实际填写
- ❌ 本轮清理了大量文件，但未写经验教训
- ❌ 发现重要模式但未文档化

**本次示例**（已完成）:
- ✅ `confluence/memory/lessons/deep-cleanup-lessons-2026-05-07.md`（3个严重错误 + 7条教训）
- ✅ `confluence/memory/lessons-learned-2026-05-06.md`（DB+MD 双写修复）
- ✅ 更新 memory-index.md 补充新文件

---

### 4️⃣ 有没有提交推送？

**检查清单**:

```bash
# 4.1 是否有未提交的变更
git status --short

# 4.2 本地分支是否领先 remote
git status | grep "Your branch is ahead"

# 4.3 三分支是否同步
git log miao..testing --oneline  # 应为空
git log testing..main --oneline  # 应为空

# 4.4 验证 remote 最新
git log --oneline -3
git ls-remote origin miao | cut -f1  # 对比 commit hash
```

**标准推送流程**:
```bash
git push origin miao
git checkout testing && git merge miao --no-edit && git push origin testing
git checkout main && git merge testing --no-edit && git push origin main
git checkout miao
```

**常见遗漏**:
- ❌ 只提交到本地，未 push
- ❌ 只 push 到 miao，未同步 testing/main
- ❌ merge 有冲突但未解决
- ❌ 分支顺序错误（直接 miao → main 跳过 testing）

**本次示例**（已完成）:
- ✅ 16次提交全部推送
- ✅ 每次都执行三分支同步
- ✅ 验证 `git status` 显示 clean

---

## 🤖 自动化检查脚本（建议创建）

```bash
#!/bin/bash
# scripts/post-task-check.sh

echo "## 1️⃣ 文档检查"
git status --short | grep "\.md$" && echo "⚠️  有未提交文档" || echo "✅ 无未提交文档"

echo -e "\n## 2️⃣ Skill 检查"
diff eket/.claude/skills/eket/SKILL.md ~/.claude/skills/eket/SKILL.md >/dev/null 2>&1 \
  && echo "✅ Skill 已同步" || echo "⚠️  Skill 需更新"

echo -e "\n## 3️⃣ 经验教训检查"
RECENT_LESSONS=$(find confluence/memory/{lessons,pitfalls,patterns}/ -name "*.md" -mtime -1 2>/dev/null | wc -l)
[ "$RECENT_LESSONS" -gt 0 ] && echo "✅ 有新增经验 ($RECENT_LESSONS 个)" || echo "⚠️  本轮无经验沉淀"

echo -e "\n## 4️⃣ 提交推送检查"
git status --short | grep -q . && echo "⚠️  有未提交变更" || echo "✅ 无未提交变更"
git status | grep -q "ahead" && echo "⚠️  本地领先 remote" || echo "✅ 已推送到 remote"

echo -e "\n## 分支同步检查"
[ $(git log miao..testing --oneline | wc -l) -eq 0 ] && echo "✅ miao=testing" || echo "❌ miao ≠ testing"
[ $(git log testing..main --oneline | wc -l) -eq 0 ] && echo "✅ testing=main" || echo "❌ testing ≠ main"
```

---

## 📊 本次会话自检（示例）

### 1️⃣ 文档 ✅
- 新增: deep-cleanup-lessons, root-directory-audit, duplicate-naming-audit 等
- 更新: memory-index.md, ARCHIVE-INDEX.md, codebase-map.md
- 归档: 12个历史文档

### 2️⃣ Skill ✅
- 无 skill 源文件变更
- 跳过更新

### 3️⃣ 经验教训 ✅
- `confluence/memory/lessons/deep-cleanup-lessons-2026-05-07.md`（217行）
- 3个严重错误 + 7条核心教训

### 4️⃣ 提交推送 ✅
- 16次提交
- 全部推送到 miao → testing → main
- 分支完全同步

---

## 🎓 使用建议

**场景1: 单个 Ticket 完成**
```bash
eket task:complete TASK-NNN
bash scripts/post-task-check.sh  # 执行检查
```

**场景2: 批量任务完成**
```bash
# 先问自己本轮4个问题
bash scripts/post-task-check.sh
# 根据输出逐项修复
```

**场景3: 用户问"做好了吗"**
```bash
# 立刻执行检查清单，而非凭记忆回答
bash scripts/post-task-check.sh
# 展示检查结果给用户
```

---

**关键**: 养成习惯，**每批任务完成后自动执行 4 项检查**，而非等用户追问。
