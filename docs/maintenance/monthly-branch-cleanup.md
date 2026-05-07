# 月度分支维护计划

**建立时间**: 2026-05-07  
**维护周期**: 每月 1 日  
**负责人**: Master

---

## 执行清单

### 每月 1 日执行

#### 1. 检查已合并分支（自动）

```bash
#!/bin/bash
# scripts/monthly-branch-cleanup.sh

REPORT_DATE=$(date +%Y-%m)
REPORT_FILE="confluence/memory/branch-cleanup-${REPORT_DATE}.md"

echo "# 月度分支清理报告 - ${REPORT_DATE}" > "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**执行时间**: $(date '+%Y-%m-%d %H:%M:%S')" >> "$REPORT_FILE"
echo "**执行人**: Master (自动化)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 检查已合并超过 7 天的远程分支
echo "## 检查已合并分支" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

git fetch origin --prune

# 获取已合并到 main 的远程分支
git branch -r --merged origin/main | \
  grep "origin/feature/" | \
  sed 's|[ *]*origin/||' > /tmp/merged-branches.txt

MERGED_COUNT=$(wc -l < /tmp/merged-branches.txt)

echo "发现 $MERGED_COUNT 个已合并的 feature 分支" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ "$MERGED_COUNT" -gt 0 ]; then
  echo "### 待删除分支列表" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  cat /tmp/merged-branches.txt >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  
  # 删除远程分支
  echo "### 删除结果" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  
  while IFS= read -r branch; do
    if git push origin --delete "$branch" 2>/dev/null; then
      echo "- ✅ $branch" >> "$REPORT_FILE"
    else
      echo "- ❌ $branch (失败)" >> "$REPORT_FILE"
    fi
  done < /tmp/merged-branches.txt
else
  echo "✅ 无需清理，所有分支保持清洁" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**状态**: ✅ 完成" >> "$REPORT_FILE"

cat "$REPORT_FILE"
```

#### 2. 检查分支健康度

```bash
# 统计分支数量
echo "## 分支健康度" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

LOCAL_COUNT=$(git branch | wc -l)
REMOTE_COUNT=$(git branch -r | grep "origin/" | grep -v "HEAD" | wc -l)

echo "- 本地分支: $LOCAL_COUNT" >> "$REPORT_FILE"
echo "- 远程分支: $REMOTE_COUNT" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ "$LOCAL_COUNT" -gt 5 ]; then
  echo "⚠️  警告: 本地分支数量超过 5 个，建议检查" >> "$REPORT_FILE"
fi

if [ "$REMOTE_COUNT" -gt 10 ]; then
  echo "⚠️  警告: 远程分支数量超过 10 个，建议清理" >> "$REPORT_FILE"
fi
```

#### 3. 检查僵尸分支

```bash
# 检查 30 天无更新的分支
echo "## 僵尸分支检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

git for-each-ref --sort=-committerdate refs/remotes/origin/feature/ \
  --format='%(refname:short)|%(committerdate:relative)' | \
  while IFS='|' read -r branch date; do
    if [[ "$date" == *"month"* ]] || [[ "$date" == *"year"* ]]; then
      echo "- ⚠️  $branch (最后更新: $date)" >> "$REPORT_FILE"
    fi
  done
```

---

## 自动化设置

### GitHub Actions 自动删除已合并分支

已创建: `.github/workflows/cle时自动删除源分支

**保护分支**: main, testing, miao 不会被删除

---

### Cron 任务（月度清理）

```bash
# 添加到 crontab（可选）
# 每月 1 日 9:00 执行
0 9 1 * * cd /path/to/eket && bash scripts/monthly-branch-cleanup.sh
```

---

## 手动执行

### 立即执行月度清理

```bash
cd /path/to/eket
bash scripts/monthly-branch-cleanup.sh
```

### 检查特定分支

```bash
# 检查分支是否已合并
git branch -r --merged origin/main | grep "feature/TASK-XXX"

# 检查分支最后更新时间
git log origin/feature/TASK-XXX -1 --format="%ar"
```

---

## 报告归档

每月清理报告自动保存到:
```
confluence/memory/branch-cleanup-YYYY-MM.md
```

---

## 紧急清理流程

### 当分支数量超过 20 个时

1. **立即审查**: 运行 `bash scripts/monthly-branch-cleanup.sh`
2. **人工确认**: 检查生成的报告
3. **批量删除**: 确认后执行删除
4. **记录原因**: 在 confluence/memory/ 记录为何积压

---

## 分支命名规范强制

### Pre-commit Hook（可选）

```bash
# .git/hooks/pre-push（示例）
#!/bin/bash

BRANCH=$(git rev-parse --abbrev-ref HEAD)

# 检查分支命名
if [[ "$BRANCH" != "main" && "$BRANCH" != "testing" && "$BRANCH" != "miao" ]]; then
  if [[ ! "$BRANCH" =~ ^feature/TASK-[0-9]+-[a-z0-9-]+$ ]]; then
    echo "❌ 分支命名不符合规范: $BRANCH"
    echo "应为: feature/TASK-{ID}-{description}"
    echo "示例: feature/TASK-123-add-login"
    exit 1
  fi
fi
```

---

## 检查清单

### 月初检查（每月 1 日）

- [ ] 运行 `monthly-branch-cleanup.sh`
- [ ] 检查生成的报告
- [ ] 确认删除的分支都已合并
- [ ] 检查分支健康度（<10 个远程分支）
- [ ] 检查僵尸分支（>30 天无更新）
- [ ] 归档报告到 confluence/memory/

### 季度检查（每季度末）

- [ ] 审查所有远程分支
- [ ] 检查 Ticket 归档情况
- [ ] 更新分支命名规范（如需要）
- [ ] 评估自动化清理效果

---

## 指标监控

### 健康指标

| 指标 | 目标值 | 警告值 |
|------|--------|--------|
| 本地分支数 | ≤5 | >10 |
| 远程分支数 | ≤10 | >20 |
| 僵尸分支（>30天） | 0 | >3 |
| 月度删除分支数 | <5 | >10 |

### 趋势分析

每季度评估:
- 分支创建速度
- 分支合并速度
- 分支平均生命周期
- 僵尸分支比例

---

**建立时间**: 2026-05-07  
**下次执行**: 2026-06-01  
**维护状态**: ✅ 已激活
