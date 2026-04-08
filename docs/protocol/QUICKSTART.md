# EKET Protocol Quick Start Guide

快速上手 EKET 协议，5 分钟理解如何接入你的 AI 工具。

---

## 1. 选择运行模式

EKET 支持两种模式：

### HTTP Mode（推荐，满血版）
- ✅ 实时通信
- ✅ 自动调度
- ✅ Web 监控
- ⚠️ 需要运行服务器

### File Mode（轻量，残血版）
- ✅ 零依赖
- ✅ 完全离线
- ✅ 基于 Git
- ⚠️ 异步通信

---

## 2. 注册你的 Agent

### HTTP Mode

```bash
curl -X POST http://localhost:8080/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "my_ai_tool",
    "role": "slaver",
    "specialty": "frontend",
    "capabilities": ["react", "typescript"]
  }'

# Response:
{
  "success": true,
  "instance_id": "slaver_frontend_20260407_143045",
  "token": "eyJhbGci..."
}
```

### File Mode

```bash
# 创建实例目录
mkdir -p .eket/instances/slaver_frontend_001

# 创建身份文件
cat > .eket/instances/slaver_frontend_001/identity.yml <<EOF
instance_id: slaver_frontend_001
agent_type: my_ai_tool
role: slaver
specialty: frontend
capabilities:
  - react
  - typescript
created_at: $(date -Iseconds)
EOF

# 初始化心跳
date +%s > .eket/instances/slaver_frontend_001/heartbeat.txt
```

---

## 3. 领取任务

### HTTP Mode

```bash
curl -X POST http://localhost:8080/api/v1/tasks/FEAT-001/claim \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"instance_id": "slaver_frontend_001"}'

# Response:
{
  "success": true,
  "task": {
    "id": "FEAT-001",
    "title": "Implement user login",
    "status": "in_progress",
    "assigned_to": "slaver_frontend_001"
  }
}
```

### File Mode

```bash
# 更新任务文件
sed -i 's/^status:.*/status: in_progress/' jira/tickets/FEAT-001.md
sed -i 's/^assigned_to:.*/assigned_to: slaver_frontend_001/' jira/tickets/FEAT-001.md

# 记录到我的任务列表
echo "FEAT-001" >> .eket/instances/slaver_frontend_001/claimed_tasks.txt

# 提交到 Git
git add jira/tickets/FEAT-001.md .eket/instances/slaver_frontend_001/
git commit -m "claim: FEAT-001 by slaver_frontend_001"
git push
```

---

## 4. 发送消息

### HTTP Mode

```bash
curl -X POST http://localhost:8080/api/v1/messages \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "from": "slaver_frontend_001",
    "to": "master",
    "type": "pr_review_request",
    "payload": {
      "task_id": "FEAT-001",
      "branch": "feature/FEAT-001-login"
    }
  }'
```

### File Mode

```bash
# 创建消息文件
cat > .eket/messages/inbox/msg_$(date +%s).json <<EOF
{
  "id": "msg_$(date +%s)_$$",
  "from": "slaver_frontend_001",
  "to": "master",
  "type": "pr_review_request",
  "timestamp": "$(date -Iseconds)",
  "payload": {
    "task_id": "FEAT-001",
    "branch": "feature/FEAT-001-login"
  }
}
EOF

# 提交到 Git
git add .eket/messages/
git commit -m "message: PR review request for FEAT-001"
git push
```

---

## 5. 保持心跳

### HTTP Mode

```bash
# 每 60 秒发送一次
while true; do
  curl -X POST http://localhost:8080/api/v1/agents/slaver_frontend_001/heartbeat \
    -H "Authorization: Bearer $TOKEN" \
    -d '{
      "status": "busy",
      "current_task": "FEAT-001",
      "progress": 0.75
    }'
  sleep 60
done
```

### File Mode

```bash
# 每 60 秒更新一次
while true; do
  date +%s > .eket/instances/slaver_frontend_001/heartbeat.txt
  git add .eket/instances/slaver_frontend_001/heartbeat.txt
  git commit -m "heartbeat: slaver_frontend_001"
  git push
  sleep 60
done
```

---

## 完整示例

### Python SDK 示例

```python
from eket_sdk import EKETClient

# 自动检测模式（HTTP 优先，降级到 File）
client = EKETClient(mode="auto")

# 注册 Agent
result = client.register_agent(
    agent_type="my_tool",
    role="slaver",
    specialty="backend",
    capabilities=["python", "fastapi"]
)

print(f"Registered as: {result['instance_id']}")

# 领取任务
task = client.claim_task("FEAT-001")
print(f"Claimed task: {task['id']}")

# 发送消息
client.send_message(
    to="master",
    type="pr_review_request",
    payload={
        "task_id": "FEAT-001",
        "branch": "feature/FEAT-001"
    }
)

# 心跳循环
import time
while True:
    client.heartbeat(status="busy", current_task="FEAT-001")
    time.sleep(60)
```

### JavaScript SDK 示例

```javascript
const { EKETClient } = require('eket-sdk');

(async () => {
  // 创建客户端
  const client = new EKETClient({ mode: 'auto' });
  
  // 注册
  const result = await client.register({
    agentType: 'my_tool',
    role: 'slaver',
    specialty: 'fullstack',
    capabilities: ['react', 'node']
  });
  
  console.log(`Registered as: ${result.instance_id}`);
  
  // 领取任务
  const task = await client.claimTask('FEAT-001');
  console.log(`Claimed: ${task.id}`);
  
  // 心跳
  setInterval(async () => {
    await client.heartbeat({ status: 'busy', currentTask: 'FEAT-001' });
  }, 60000);
})();
```

---

## 下一步

- 📖 阅读完整协议规范：[EKET_PROTOCOL_V1.md](EKET_PROTOCOL_V1.md)
- 🔌 查看 API 文档：[OpenAPI Spec](openapi.yaml)
- 📝 查看 JSON Schema：[schemas/](schemas/)
- 💡 查看更多示例：[examples/](examples/)

---

## 常见问题

### Q: 如何选择运行模式？

**A**: 
- 团队协作（>3人）→ HTTP Mode
- 个人或小团队 → File Mode
- 需要实时监控 → HTTP Mode
- 追求简单 → File Mode

### Q: 能否混合使用两种模式？

**A**: 可以！EKET 支持自动降级：
```
HTTP Server 可用 → HTTP Mode
HTTP Server 不可用 → 自动降级到 File Mode
```

### Q: 如何实现自定义消息类型？

**A**: 使用 `custom:` 前缀：
```json
{
  "type": "custom:my_special_event",
  "payload": { /* 自定义数据 */ }
}
```

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-07
