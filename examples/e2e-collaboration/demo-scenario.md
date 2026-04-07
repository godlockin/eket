# EKET 端到端协作演示场景

## 场景概述

**场景名称**: 实现用户登录功能
**任务 ID**: FEAT-001
**参与者**: Master Agent (TypeScript) + Slaver Agent (Python)
**通信方式**: HTTP API + WebSocket
**预计时长**: 约 30 秒

---

## 时序图

```
Master Agent          EKET Server         Slaver Agent           Redis
     │                     │                     │                  │
     │─1. Register─────────>│                     │                  │
     │<────instance_id,token│                     │                  │
     │                     │                     │                  │
     │─2. Connect WS───────>│                     │                  │
     │<────WS connected─────│                     │                  │
     │                     │                     │                  │
     │─3. Create Task──────>│                     │                  │
     │  (FEAT-001)          │────store───────────>│                  │
     │<────success──────────│                     │                  │
     │                     │                     │                  │
     │                     │<─4. Register────────│                  │
     │                     │──instance_id,token─>│                  │
     │                     │                     │                  │
     │                     │<─5. List Tasks──────│                  │
     │                     │──[FEAT-001]────────>│                  │
     │                     │                     │                  │
     │                     │<─6. Claim Task──────│                  │
     │                     │  (FEAT-001)         │                  │
     │                     │────update──────────>│                  │
     │                     │──success───────────>│                  │
     │                     │                     │                  │
     │                     │<─7. Heartbeat───────│                  │
     │                     │  (progress: 0.25)   │                  │
     │                     │────update──────────>│                  │
     │                     │                     │                  │
     │                     │    ... (3 more heartbeats)             │
     │                     │                     │                  │
     │                     │<─8. Submit PR───────│                  │
     │                     │  (FEAT-001)         │                  │
     │                     │──pr_id─────────────>│                  │
     │                     │                     │                  │
     │                     │<─9. Send Message────│                  │
     │                     │  (pr_review_request)│                  │
     │<─10. WS Message─────│                     │                  │
     │  (pr_review_request)│                     │                  │
     │                     │                     │                  │
     │─11. Review PR───────>│                     │                  │
     │  (approved)          │────update──────────>│                  │
     │<────success──────────│                     │                  │
     │                     │                     │                  │
     │─12. Merge PR────────>│                     │                  │
     │<────merge_commit─────│                     │                  │
     │                     │                     │                  │
     │                     │<─13. Deregister─────│                  │
     │                     │──success───────────>│                  │
     │                     │                     │                  │
     │─14. Deregister──────>│                     │                  │
     │<────success──────────│                     │                  │
     │                     │                     │                  │
```

---

## 详细步骤

### Phase 1: 初始化 (Master)

**步骤 1-3**: Master Agent 启动和初始化

```typescript
// 1. 注册 Master
const registration = await client.registerAgent({
  agent_type: 'claude_code',
  agent_version: '1.0.0',
  role: 'master',
  metadata: {
    user: 'demo',
    machine: 'localhost',
    timezone: 'Asia/Shanghai',
  },
});

// 2. 连接 WebSocket
await client.connectWebSocket(registration.instance_id);

// 3. 创建任务
const task = {
  id: 'FEAT-001',
  title: 'Implement user login',
  type: 'feature',
  priority: 'P0',
  status: 'ready',
  description: 'Implement user login with email and password',
  acceptance_criteria: [
    { description: 'Users can login with email/password', completed: false },
    { description: 'Invalid credentials show error message', completed: false },
    { description: 'Successful login stores auth token', completed: false },
  ],
  tags: ['frontend', 'authentication'],
  estimate: '8h',
};
```

**预期输出**:
```
[Master] 🚀 Starting Master Agent...
[Master] ✅ Registered as master_20260407_150000_12345
[Master] 🔌 WebSocket connected
[Master] 📋 Creating task FEAT-001: Implement user login
[Master] 💓 Heartbeat started (every 30s)
[Master] 👂 Listening for messages...
```

---

### Phase 2: Slaver 加入

**步骤 4-6**: Slaver Agent 启动并领取任务

```python
# 4. 注册 Slaver
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
    specialty=AgentSpecialty.BACKEND,
    capabilities=['python', 'fastapi', 'postgresql'],
    metadata={
        'user': 'demo',
        'machine': 'localhost',
        'timezone': 'Asia/Shanghai',
    }
)

# 5. 查询任务
tasks = client.list_tasks(status=TaskStatus.READY)
print(f"Found {len(tasks)} available tasks")

# 6. 领取任务
if tasks:
    task = client.claim_task(task_id='FEAT-001', instance_id=agent.instance_id)
    print(f"Claimed task: {task.title}")
```

**预期输出**:
```
[Slaver] 🚀 Starting Slaver Agent...
[Slaver] ✅ Registered as slaver_backend_20260407_150002_67890
[Slaver] 📋 Querying available tasks...
[Slaver] 🎯 Found task: FEAT-001 - Implement user login
[Slaver] ✅ Claimed task FEAT-001
```

---

### Phase 3: 开发工作

**步骤 7**: Slaver 模拟开发并发送心跳

```python
# 模拟开发工作（分 4 个阶段）
work_stages = [
    (0.25, "Implemented login UI component"),
    (0.50, "Added API integration"),
    (0.75, "Completed unit tests"),
    (1.00, "All tests passing"),
]

for progress, note in work_stages:
    time.sleep(WORK_DELAY)  # 模拟工作时间

    # 发送心跳
    client.send_heartbeat(
        instance_id=agent.instance_id,
        status=AgentStatus.ACTIVE,
        current_task='FEAT-001',
        progress=progress,
    )

    print(f"💼 Working on task... (Progress: {int(progress*100)}%)")
    print(f"💓 Heartbeat sent: {note}")
```

**预期输出**:
```
[Slaver] 💼 Working on task... (Progress: 25%)
[Slaver] 💓 Heartbeat sent: Implemented login UI component

[Slaver] 💼 Working on task... (Progress: 50%)
[Slaver] 💓 Heartbeat sent: Added API integration

[Slaver] 💼 Working on task... (Progress: 75%)
[Slaver] 💓 Heartbeat sent: Completed unit tests

[Slaver] 💼 Working on task... (Progress: 100%)
[Slaver] 💓 Heartbeat sent: All tests passing
```

---

### Phase 4: PR 提交和审核

**步骤 8-10**: Slaver 提交 PR 并请求 Review

```python
# 8. 提交 PR
pr_id = client.submit_pr(
    instance_id=agent.instance_id,
    task_id='FEAT-001',
    branch='feature/FEAT-001-user-login',
    description='''
Implemented user login feature:
- Added LoginForm component with email/password inputs
- Integrated with /api/auth/login endpoint
- Added error handling and validation
- Completed unit and integration tests (100% coverage)
    '''.strip(),
    test_status=TestStatus.PASSED,
)

# 9. 发送 Review 请求消息
client.send_message(
    from_id=agent.instance_id,
    to_id='master',
    msg_type=MessageType.PR_REVIEW_REQUEST,
    payload={
        'task_id': 'FEAT-001',
        'pr_id': pr_id,
        'branch': 'feature/FEAT-001-user-login',
        'test_status': 'passed',
        'test_coverage': 1.0,
    },
    priority=MessagePriority.HIGH,
)

# 更新任务状态
client.update_task('FEAT-001', status=TaskStatus.REVIEW, progress=1.0)
```

**步骤 11-12**: Master 接收消息并审核

```typescript
// 10. WebSocket 接收消息
client.onMessage(async (message) => {
  if (message.type === 'pr_review_request') {
    console.log(`📬 Received PR review request from ${message.from}`);

    const { task_id, branch } = message.payload;

    // 11. Review PR
    await client.reviewPR(task_id, {
      reviewer: masterInstanceId,
      status: 'approved',
      summary: 'Great work! Code looks clean and tests are comprehensive.',
      comments: [],
    });

    console.log(`✅ PR approved!`);

    // 12. Merge PR
    const result = await client.mergePR(task_id, {
      merger: masterInstanceId,
      target_branch: 'main',
      squash: false,
    });

    console.log(`🔀 PR merged successfully! (commit: ${result.merge_commit})`);
  }
});
```

**预期输出**:
```
[Slaver] 📤 Submitting PR for FEAT-001
[Slaver] ✅ PR submitted: feature/FEAT-001-user-login
[Slaver] 📨 Sending review request to Master

[Master] 📬 Received PR review request from slaver_backend_20260407_150002_67890
[Master] 🔍 Reviewing PR for FEAT-001...
[Master] ✅ PR approved!
[Master] 🔀 Merging PR to main...
[Master] ✅ PR merged successfully! (commit: abc123def456)
```

---

### Phase 5: 清理

**步骤 13-14**: 双方注销

```python
# 13. Slaver 注销
client.deregister_agent(agent.instance_id)
print("✅ Deregistered successfully")
```

```typescript
// 14. Master 注销
await client.deregisterAgent(masterInstanceId);
console.log("✅ Deregistered successfully");
```

**预期输出**:
```
[Slaver] 🎉 Task FEAT-001 completed!
[Slaver] 👋 Deregistering...
[Slaver] ✅ Deregistered successfully

[Master] 🎉 All tasks completed!
[Master] 👋 Deregistering...
[Master] ✅ Deregistered successfully

=== Demo Completed Successfully ===
```

---

## 消息流详解

### PR Review Request 消息

```json
{
  "id": "msg_20260407_150230_99999",
  "from": "slaver_backend_20260407_150002_67890",
  "to": "master",
  "type": "pr_review_request",
  "priority": "high",
  "timestamp": "2026-04-07T15:02:30+08:00",
  "payload": {
    "task_id": "FEAT-001",
    "pr_id": "FEAT-001",
    "branch": "feature/FEAT-001-user-login",
    "description": "Implemented user login feature...",
    "changes_summary": {
      "files_changed": 12,
      "insertions": 450,
      "deletions": 23
    },
    "test_status": "passed",
    "test_coverage": 1.0
  },
  "ttl": 3600
}
```

### WebSocket 消息

```json
{
  "type": "message",
  "data": {
    "id": "msg_20260407_150230_99999",
    "from": "slaver_backend_20260407_150002_67890",
    "to": "master",
    "type": "pr_review_request",
    "payload": { /* ... */ },
    "timestamp": "2026-04-07T15:02:30+08:00"
  }
}
```

---

## 任务状态变更

```
FEAT-001 状态变化：
  ready           (Master 创建)
    ↓
  in_progress     (Slaver claim)
    ↓
  review          (Slaver 提交 PR)
    ↓
  done            (Master 合并 PR)
```

---

## 心跳数据

### Slaver 心跳

```json
{
  "status": "active",
  "current_task": "FEAT-001",
  "progress": 0.25
}
```

服务器响应：

```json
{
  "success": true,
  "server_time": "2026-04-07T15:01:00+08:00",
  "messages": []
}
```

### Master 心跳

```json
{
  "status": "active",
  "current_task": null,
  "progress": null
}
```

---

## 技术亮点

### 1. WebSocket 实时通信
- Master 无需轮询，立即收到 PR 请求
- 减少延迟，提高响应速度

### 2. 心跳机制
- 定期报告状态和进度
- 服务器监控 Agent 健康
- 自动清理失活 Agent

### 3. 消息优先级
- PR Review 请求使用 HIGH 优先级
- 确保重要消息优先处理

### 4. 错误处理
- 任务 claim 冲突检测
- 网络错误自动重试
- 优雅降级

### 5. 多语言协作
- JavaScript Master
- Python Slaver
- 统一协议接口

---

## 扩展场景

基于此场景，可以扩展为：

### 场景 2: 多 Slaver 协作
- 1 个 Master
- 3 个 Slaver (Frontend, Backend, QA)
- 并行开发多个任务

### 场景 3: PR 修改请求
- Slaver 提交 PR
- Master 请求修改 (changes_requested)
- Slaver 修复并重新提交
- Master 批准并合并

### 场景 4: 任务依赖
- FEAT-001 依赖 FEAT-000
- FEAT-002 被 FEAT-001 阻塞
- 按依赖顺序执行

### 场景 5: 异常处理
- Slaver 开发中遇到阻塞
- 发送 help_request 消息
- Master 提供帮助
- 继续开发

---

## 性能指标

预期性能：
- 注册响应时间: < 100ms
- WebSocket 连接: < 200ms
- 任务 claim: < 50ms
- 消息延迟: < 10ms (WebSocket)
- PR 审核: < 500ms
- 总流程时长: 约 30 秒

---

## 监控和调试

### 查看 Redis 数据

```bash
# 查看所有 Agent
redis-cli KEYS "eket:instances:*"

# 查看所有任务
redis-cli KEYS "eket:tasks:*"

# 查看所有消息
redis-cli KEYS "eket:messages:*"
```

### 查看服务器日志

```bash
tail -f logs/eket-server.log
```

### 查看 Agent 日志

```bash
# Master
tail -f master/logs/master.log

# Slaver
tail -f slaver/logs/slaver.log
```

---

## 结论

此端到端场景展示了 EKET Framework 的核心能力：
- 多 Agent 协作
- 实时通信
- 任务管理
- PR 工作流
- 多语言支持

为开发者提供了完整的协作框架基础。
