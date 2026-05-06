#!/bin/bash
# TASK-275 测试脚本：验证 Slaver 退出清理

set -e

echo "=== TASK-275 退出清理测试 ==="
echo

# 1. 注册 Slaver
echo "1. 注册测试 Slaver..."
INSTANCE_ID="test_cleanup_$(date +%s%N | cut -c1-8)"
RUST_BIN="./rust/target/debug/eket"

$RUST_BIN slaver:register \
  --id "$INSTANCE_ID" \
  --role "backend" \
  --skills "rust" \
  --db-path ".eket/state/eket.db"

echo "   ✓ 注册成功: $INSTANCE_ID"
echo

# 2. 验证注册状态
echo "2. 验证 DB 注册状态..."
DB_STATUS=$(sqlite3 .eket/state/eket.db \
  "SELECT status FROM slaver_instances WHERE id='$INSTANCE_ID';" 2>/dev/null || echo "")
echo "   DB status: $DB_STATUS"
[[ "$DB_STATUS" == "idle" ]] || { echo "   ✗ 期望 idle，实际 $DB_STATUS"; exit 1; }
echo "   ✓ DB 状态正确"
echo

# 3. 写入配置文件
echo "3. 模拟配置文件..."
mkdir -p .eket/state
cat > .eket/state/instance_config.yml << EOF
role: "slaver"
agent_type: "backend"
status: "polling"
EOF
echo "   ✓ 配置文件已创建"
echo

# 4. 启动 Slaver poll（3秒后 SIGINT）
echo "4. 启动 Slaver poll (3秒后自动停止)..."
timeout -s INT 3 $RUST_BIN slaver:poll \
  --id "$INSTANCE_ID" \
  --interval 1 \
  --mailbox-dir "~/.eket/mailbox" \
  --db-path ".eket/state/eket.db" \
  2>&1 | grep -E "event|cleanup|stopped" || true

echo
echo "5. 验证清理结果..."

# 5a. 验证配置文件删除
if [ -f ".eket/state/instance_config.yml" ]; then
  echo "   ✗ 配置文件未删除"
  exit 1
else
  echo "   ✓ 配置文件已删除"
fi

# 5b. 验证 DB 状态
FINAL_STATUS=$(sqlite3 .eket/state/eket.db \
  "SELECT status FROM slaver_instances WHERE id='$INSTANCE_ID';" 2>/dev/null || echo "")
echo "   DB status: $FINAL_STATUS"
[[ "$FINAL_STATUS" == "offline" ]] || { echo "   ✗ 期望 offline，实际 $FINAL_STATUS"; exit 1; }
echo "   ✓ DB 状态已更新为 offline"

echo
echo "=== ✅ 测试通过 ==="
