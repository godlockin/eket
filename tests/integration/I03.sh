#!/bin/bash
# 不使用 set -e，测试需要捕获失败

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟已初始化项目（execution 模式）
mkdir -p confluence jira/tickets/feature code_repo .eket/state/agents
echo "# Confluence" > confluence/README.md
echo "# Jira" > jira/README.md

# 创建多个任务
cat > jira/tickets/feature/FEAT-001.md << 'EOF'
title: Urgent Feature
status: ready
priority: urgent
labels: backend
EOF

cat > jira/tickets/feature/FEAT-002.md << 'EOF'
title: Normal Feature
status: ready
priority: normal
labels: frontend
EOF

# 复制必要脚本
cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/template/.claude/commands/eket-claim.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/load-agent-profile.sh" . 2>/dev/null || true
mkdir -p scripts
cp "$PROJECT_ROOT/scripts/load-agent-profile.sh" scripts/ 2>/dev/null || true

# 运行自动模式
output=$(bash eket-start.sh -a 2>&1) || true

# 验证：自动领取最高优先级任务
# FEAT-001 应该是 in_progress
status=$(grep "^status:" jira/tickets/feature/FEAT-001.md 2>/dev/null | cut -d: -f2 | tr -d ' ')

if [ "$status" = "in_progress" ]; then
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
