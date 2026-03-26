#!/bin/bash
# 不使用 set -e，测试需要捕获失败

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟项目初始化
mkdir -p inbox outbox/review_requests tasks .eket/state

# 复制 template 内容
if [ -d "$PROJECT_ROOT/template/.claude" ]; then
    cp -r "$PROJECT_ROOT/template/.claude" .
fi

# 运行 eket-init
if [ -x ".claude/commands/eket-init.sh" ]; then
    bash .claude/commands/eket-init.sh > /dev/null 2>&1 || true
fi

# 验证基本结构
if [ -d ".claude" ] && [ -d ".eket" ]; then
    # 清理
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
