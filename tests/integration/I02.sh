#!/bin/bash
# 不使用 set -e，测试需要捕获失败

TEST_DIR=$(mktemp -d)
cd "$TEST_DIR"

PROJECT_ROOT="$1"

# 模拟未初始化项目（setup 模式）
mkdir -p inbox outbox/review_requests tasks .eket/state

# 创建需求输入
cat > inbox/human_input.md << 'EOF'
# 项目需求

## 愿景
创建一个简单的博客系统

## 核心功能
- 用户注册/登录
- 文章发布
- 评论功能
EOF

# 复制必要脚本
cp "$PROJECT_ROOT/template/.claude/commands/eket-start.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/prioritize-tasks.sh" . 2>/dev/null || true
cp "$PROJECT_ROOT/scripts/recommend-tasks.sh" . 2>/dev/null || true

# 运行 eket-start
output=$(bash eket-start.sh 2>&1) || true

# 验证进入 setup 模式
if echo "$output" | grep -q "任务设定模式"; then
    cd /
    rm -rf "$TEST_DIR"
    exit 0
else
    cd /
    rm -rf "$TEST_DIR"
    exit 1
fi
