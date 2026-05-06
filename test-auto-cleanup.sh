#!/bin/bash
# TASK-275 自动测试：后台启动 poll，3秒后 kill

set -e

INSTANCE_ID="test_cleanup_auto"
RUST_BIN="./rust/target/debug/eket"
DB_PATH=".eket/state/eket.db"

echo "=== TASK-275 退出清理自动测试 ==="
echo

# 清理旧实例
sqlite3 $DB_PATH "DELETE FROM slaver_instances WHERE id='$INSTANCE_ID';" 2>/dev/null || true
rm -f .eket/state/instance_config.yml

# 1. 注册
echo "1. 注册 Slaver..."
$RUST_BIN slaver:register \
  --id "$INSTANCE_ID" \
  --role "backend" \
  --skills "rust" \
  --db-path "$DB_PATH" > /dev/null

echo "   ✓ 注册成功"

# 2. 创建配置
cat > .eket/state/instance_config.yml << EOF
role: "slaver"
status: "polling"
EOF
echo "   ✓ 配置文件已创建"
echo

# 3. 启动 poll
echo "2. 启动 Slaver poll (后台 3秒)..."
$RUST_BIN slaver:poll \
  --id "$INSTANCE_ID" \
  --interval 1 \
  --mailbox-dir "~/.eket/mailbox" \
  --db-path "$DB_PATH" &

PID=$!
echo "   PID: $PID"

sleep 3

# 4. 发送 SIGINT
echo
echo "3. 发送 SIGINT..."
kill -INT $PID 2>/dev/null || true
sleep 1

# 5. 验证
echo
echo "4. 验证清理..."

if [ -f ".eket/state/instance_config.yml" ]; then
  echo "   ✗ 配置文件未删除"
  CONFIG_DELETED=false
else
  echo "   ✓ 配置文件已删除"
  CONFIG_DELETED=true
fi

STATUS=$(sqlite3 $DB_PATH "SELECT status FROM slaver_instances WHERE id='$INSTANCE_ID';" 2>/dev/null || echo "")
echo "   DB status: $STATUS"

if [[ "$STATUS" == "offline" ]]; then
  echo "   ✓ DB 状态已更新为 offline"
  DB_UPDATED=true
else
  echo "   ✗ DB 状态错误（期望 offline）"
  DB_UPDATED=false
fi

echo
if $CONFIG_DELETED && $DB_UPDATED; then
  echo "=== ✅ 测试通过 ==="
  exit 0
else
  echo "=== ❌ 测试失败 ==="
  exit 1
fi
