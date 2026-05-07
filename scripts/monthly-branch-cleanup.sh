#!/bin/bash
# Monthly Branch Cleanup Script
# 每月 1 日执行，清理已合并超过 7 天的远程分支

set -e

REPORT_DATE=$(date +%Y-%m)
REPORT_FILE="confluence/memory/branch-cleanup-${REPORT_DATE}.md"

echo "=== 月度分支清理开始 ==="
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 生成报告头部
cat > "$REPORT_FILE" << EOF
# 月度分支清理报告 - ${REPORT_DATE}

**执行时间**: $(date '+%Y-%m-%d %H:%M:%S')
**执行人**: Master (自动化)

---

## 检查已合并分支

EOF

# 同步远程状态
echo "同步远程分支状态..."
git fetch origin --prune

# 获取已合并到 main 的远程分支
echo "检查已合并分支..."
git branch -r --merged origin/main | \
  grep "origin/feature/" | \
  sed 's|[ *]*origin/||' | \
  grep -v "^HEAD" > /tmp/merged-branches.txt || touch /tmp/merged-branches.txt

MERGED_COUNT=$(wc -l < /tmp/merged-branches.txt | tr -d ' ')

echo "发现 $MERGED_COUNT 个已合并的 feature 分支"
echo "发现 $MERGED_COUNT 个已合并的 feature 分支" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ "$MERGED_COUNT" -gt 0 ]; then
  echo "### 待删除分支列表" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  cat /tmp/merged-branches.txt >> "$REPORT_FILE"
  echo '```' >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  echo "### 删除结果" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"

  # 删除远程分支
  while IFS= read -r branch; do
    if [ -n "$branch" ]; then
      echo "删除: $branch"
      if git push origin --delete "$branch" 2>/dev/null; then
        echo "- ✅ $branch" >> "$REPORT_FILE"
      else
        echo "- ❌ $branch (失败或已删除)" >> "$REPORT_FILE"
      fi
    fi
  done < /tmp/merged-branches.txt
else
  echo "✅ 无需清理，所有分支保持清洁" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# 统计分支健康度
echo "## 分支健康度" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

LOCAL_COUNT=$(git branch | wc -l | tr -d ' ')
REMOTE_COUNT=$(git branch -r | grep "origin/" | grep -v "HEAD" | wc -l | tr -d ' ')

echo "- 本地分支: $LOCAL_COUNT" >> "$REPORT_FILE"
echo "- 远程分支: $REMOTE_COUNT" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

if [ "$LOCAL_COUNT" -gt 5 ]; then
  echo "⚠️  警告: 本地分支数量 ($LOCAL_COUNT) 超过 5 个，建议检查" >> "$REPORT_FILE"
  echo ""  >> "$REPORT_FILE"
fi

if [ "$REMOTE_COUNT" -gt 10 ]; then
  echo "⚠️  警告: 远程分支数量 ($REMOTE_COUNT) 超过 10 个，建议清理" >> "$REPORT_FILE"
  echo "" >> "$REPORT_FILE"
fi

# 检查僵尸分支（30 天无更新）
echo "## 僵尸分支检查" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

ZOMBIE_FOUND=0
git for-each-ref --sort=-committerdate refs/remotes/origin/feature/ \
  --format='%(refname:short)|%(committerdate:relative)' | \
  while IFS='|' read -r branch date; do
    if [[ "$date" == *"month"* ]] || [[ "$date" == *"year"* ]]; then
      if [ "$ZOMBIE_FOUND" -eq 0 ]; then
        echo "发现僵尸分支（>30天无更新）:" >> "$REPORT_FILE"
        echo "" >> "$REPORT_FILE"
        ZOMBIE_FOUND=1
      fi
      echo "- ⚠️  $branch (最后更新: $date)" >> "$REPORT_FILE"
    fi
  done

if [ "$ZOMBIE_FOUND" -eq 0 ]; then
  echo "✅ 无僵尸分支" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"

# 报告尾部
echo "---" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "**状态**: ✅ 完成  " >> "$REPORT_FILE"
echo "**删除分支数**: $MERGED_COUNT  " >> "$REPORT_FILE"
echo "**当前分支数**: 本地 $LOCAL_COUNT / 远程 $REMOTE_COUNT" >> "$REPORT_FILE"

# 清理临时文件
rm -f /tmp/merged-branches.txt

echo ""
echo "=== 清理完成 ==="
echo "报告已保存: $REPORT_FILE"
echo ""
echo "摘要:"
echo "- 删除分支: $MERGED_COUNT 个"
echo "- 本地分支: $LOCAL_COUNT 个"
echo "- 远程分支: $REMOTE_COUNT 个"
