#!/bin/bash
# TASK-275 手动测试：启动 Slaver poll，手动 Ctrl+C 验证清理

set -e

INSTANCE_ID="test_cleanup_manual"
RUST_BIN="./rust/target/debug/eket"

echo "=== TASK-275 手动测试指引 ==="
echo
echo "1. 先注册 Slaver..."
$RUST_BIN slaver:register \
  --id "$INSTANCE_ID" \
  --role "backend" \
  --skills "rust" \
  --db-path ".eket/state/eket.db"

echo
echo "2. 创建配置文件..."
cat > .eket/state/instance_config.yml << EOF
role: "slaver"
agent_type: "backend"
status: "polling"
EOF

echo "3. 启动 Slaver poll（手动按 Ctrl+C 停止）..."
echo "   期望输出："
echo "   - cleanup: removed .eket/state/instance_config.yml"
echo "   - cleanup: marked instance $INSTANCE_ID as offline in DB"
echo
echo "按任意键继续..."
read -n 1

$RUST_BIN slaver:poll \
  --id "$INSTANCE_ID" \
  --interval 2 \
  --mailbox-dir "~/.eket/mailbox" \
  --db-path ".eket/state/eket.db"

echo
echo "4. 验证结果..."
[ -f ".eket/state/instance_config.yml" ] && echo "✗ 配置文件未删除" || echo "✓ 配置文件已删除"

STATUS=$(sqlite3 .eket/state/eket.db "SELECT status FROM slaver_instances WHERE id='$INSTANCE_ID';")
echo "DB status: $STATUS"
[[ "$STATUS" == "offline" ]] && echo "✓ DB 状态正确" || echo "✗ DB 状态错误"
