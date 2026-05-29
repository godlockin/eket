#!/bin/bash
# detect-at-risk-projects.sh
# 自动检测可能失败/风险项目
# Usage: ./scripts/detect-at-risk-projects.sh [directory]

set -euo pipefail

# Colors
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Thresholds (days)
THRESHOLD_WARN=90      # 90天无commit → 需关注
THRESHOLD_AT_RISK=365  # 1年无commit → at-risk
THRESHOLD_FAILED=730   # 2年无commit → 高度疑似失败

# Default directory
TARGET_DIR="${1:-$HOME/working/sourcecode/my_projects}"

if [[ ! -d "$TARGET_DIR" ]]; then
    echo -e "${RED}[ERROR]${NC} Directory not found: $TARGET_DIR"
    exit 1
fi

echo "🔍 Scanning projects in: $TARGET_DIR"
echo "================================================"
echo ""

# Find all git repositories
find "$TARGET_DIR" -maxdepth 2 -type d -name ".git" | while read -r git_dir; do
    project_dir=$(dirname "$git_dir")
    project_name=$(basename "$project_dir")

    # Skip if not a directory
    [[ ! -d "$project_dir" ]] && continue

    cd "$project_dir" || continue

    # Get last commit date
    last_commit_date=$(git log -1 --format=%ct 2>/dev/null || echo "0")

    # Skip if no commits
    [[ "$last_commit_date" == "0" ]] && continue

    # Calculate days since last commit
    current_date=$(date +%s)
    days_since_commit=$(( (current_date - last_commit_date) / 86400 ))

    # Format last commit date
    last_commit_formatted=$(date -r "$last_commit_date" +"%Y-%m-%d" 2>/dev/null || echo "unknown")

    # Determine status
    if [[ $days_since_commit -ge $THRESHOLD_FAILED ]]; then
        echo -e "${RED}[FAILED]${NC} $project_name"
        echo "  └─ Last commit: $last_commit_formatted (${days_since_commit} days ago)"
        echo "  └─ Status: 高度疑似失败,建议创建失败案例"
        echo ""
    elif [[ $days_since_commit -ge $THRESHOLD_AT_RISK ]]; then
        echo -e "${YELLOW}[AT-RISK]${NC} $project_name"
        echo "  └─ Last commit: $last_commit_formatted (${days_since_commit} days ago)"
        echo "  └─ Status: at-risk,需评估是否继续"
        echo ""
    elif [[ $days_since_commit -ge $THRESHOLD_WARN ]]; then
        echo -e "${YELLOW}[WARN]${NC} $project_name"
        echo "  └─ Last commit: $last_commit_formatted (${days_since_commit} days ago)"
        echo "  └─ Status: 需关注,可能停滞"
        echo ""
    fi
done

echo "================================================"
echo "📊 Detection Complete"
echo ""
echo "Legend:"
echo "  - WARN: >90 days, 需关注"
echo "  - AT-RISK: >365 days, 高风险"
echo "  - FAILED: >730 days, 建议归档到 confluence/failure-archive/"
echo ""
echo "Next Steps:"
echo "  1. Review FAILED projects"
echo "  2. Create failure case: cp confluence/failure-archive/TEMPLATE.md confluence/failure-archive/[project].md"
echo "  3. Update index: confluence/failure-archive/index.md"
