#!/bin/bash
# 不使用 set -e，测试需要捕获失败

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟已初始化项目
mkdir -p confluence jira/tickets/feature code_repo .eket/state
echo "# Confluence" > confluence/README.md
echo "# Jira" > jira/README.md

# 创建任务
for i in 1 2 3 4 5; do
    cat > jira/tickets/feature/FEAT-00$i.md << EOF
title: Feature $i
status: ready
priority: normal
labels: frontend
EOF
done

# 复制必要脚本
cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true

# 运行手动模式
output=$(bash eket-start.sh 2>&1) || true

# 验证：显示推荐
if echo "$output" | grep -q "推荐 1" && echo "$output" | grep -q "推荐 3"; then
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
