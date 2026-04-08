# EKET End-to-End Collaboration Example

完整的 Master-Slaver 协作演示，展示 EKET Framework 的完整工作流程。

## 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    EKET Server                          │
│              (HTTP API + WebSocket)                     │
│                  localhost:8080                         │
└────────────┬──────────────────┬────────────────────────┘
             │                   │
             ▼                   ▼
    ┌────────────────┐   ┌────────────────┐
    │ Master Agent   │   │ Slaver Agent   │
    │ (TypeScript)   │   │ (Python)       │
    │                │   │                │
    │ - 创建任务     │   │ - 查询任务     │
    │ - Review PR    │   │ - 领取任务     │
    │ - 合并代码     │   │ - 提交 PR      │
    │ - 自动心跳     │   │ - 自动心跳     │
    └────────────────┘   └────────────────┘
             │                   │
             └───────┬───────────┘
                     ▼
            ┌───────────────┐
            │ Redis         │
            │ localhost:6379│
            └───────────────┘
```

## 功能特性

### Master Agent (JavaScript/TypeScript)
- 使用 `sdk/javascript` 中的 EKET SDK
- 注册为 Master 角色
- 创建示例任务
- 监听 WebSocket 消息（实时通知）
- 接收 PR Review 请求
- 审核并合并 PR
- 自动心跳维持连接

### Slaver Agent (Python)
- 使用 `sdk/python` 中的 EKET SDK
- 注册为 Slaver 角色（specialty: backend）
- 查询可用任务
- 领取任务
- 模拟开发工作（进度更新）
- 提交 PR
- 发送 Review 请求消息给 Master
- 自动心跳维持连接

## 演示场景

**Scenario**: "实现用户登录功能"

**时序流程**:

```
1. Master 启动
   ├─ 注册为 master
   ├─ 连接 WebSocket
   ├─ 创建任务 FEAT-001 "实现用户登录"
   └─ 开始监听消息

2. Slaver 启动
   ├─ 注册为 slaver (backend specialty)
   ├─ 查询可用任务
   ├─ 发现 FEAT-001
   └─ 领取任务

3. Slaver 开发
   ├─ 模拟开发工作
   ├─ 更新进度 25% → 50% → 75% → 100%
   └─ 每次进度更新发送心跳

4. Slaver 提交 PR
   ├─ 提交 PR (branch: feature/FEAT-001)
   ├─ 更新任务状态为 review
   └─ 发送 pr_review_request 消息给 Master

5. Master 审核
   ├─ 接收 WebSocket 消息
   ├─ 查看 PR 详情
   ├─ Review PR (approved)
   └─ 合并 PR 到 main 分支

6. 完成清理
   ├─ Slaver 注销
   └─ Master 注销
```

## 运行方法

### 1. 环境准备

```bash
# 克隆项目
cd /path/to/eket

# 确保 Redis 运行
./examples/e2e-collaboration/scripts/start-redis.sh

# 构建 EKET Server
cd node
npm install
npm run build
```

### 2. 启动 EKET Server

```bash
./examples/e2e-collaboration/scripts/start-server.sh
```

服务器将在 `http://localhost:8080` 启动

### 3. 运行完整演示

```bash
# 自动运行完整流程
./examples/e2e-collaboration/scripts/run-demo.sh
```

或者手动分步运行：

```bash
# Terminal 1: 启动 Master
cd examples/e2e-collaboration/master
npm install
npm start

# Terminal 2: 启动 Slaver (等待 Master 创建任务后)
cd examples/e2e-collaboration/slaver
pip install -r requirements.txt
python slaver-agent.py
```

## 预期输出

```
=== EKET E2E Collaboration Demo ===

[Master] 🚀 Starting Master Agent...
[Master] ✅ Registered as master_20260407_150000_12345
[Master] 🔌 WebSocket connected
[Master] 📋 Creating task FEAT-001: Implement user login
[Master] 💓 Heartbeat started (every 30s)
[Master] 👂 Listening for messages...

[Slaver] 🚀 Starting Slaver Agent...
[Slaver] ✅ Registered as slaver_backend_20260407_150002_67890
[Slaver] 📋 Querying available tasks...
[Slaver] 🎯 Found task: FEAT-001 - Implement user login
[Slaver] ✅ Claimed task FEAT-001

[Slaver] 💼 Working on task... (Progress: 25%)
[Slaver] 💓 Heartbeat sent (status: active, task: FEAT-001, progress: 0.25)

[Slaver] 💼 Working on task... (Progress: 50%)
[Slaver] 💓 Heartbeat sent (status: active, task: FEAT-001, progress: 0.50)

[Slaver] 💼 Working on task... (Progress: 75%)
[Slaver] 💓 Heartbeat sent (status: active, task: FEAT-001, progress: 0.75)

[Slaver] 💼 Working on task... (Progress: 100%)
[Slaver] 💓 Heartbeat sent (status: active, task: FEAT-001, progress: 1.00)

[Slaver] 📤 Submitting PR for FEAT-001
[Slaver] ✅ PR submitted: feature/FEAT-001-user-login
[Slaver] 📨 Sending review request to Master

[Master] 📬 Received PR review request from slaver_backend_20260407_150002_67890
[Master] 🔍 Reviewing PR for FEAT-001...
[Master] ✅ PR approved!
[Master] 🔀 Merging PR to main...
[Master] ✅ PR merged successfully! (commit: abc123def456)

[Slaver] 🎉 Task FEAT-001 completed!
[Slaver] 👋 Deregistering...
[Slaver] ✅ Deregistered successfully

[Master] 🎉 All tasks completed!
[Master] 👋 Deregistering...
[Master] ✅ Deregistered successfully

=== Demo Completed Successfully ===
```

## 文件结构

```
examples/e2e-collaboration/
├── README.md                    # 本文件
├── SETUP.md                     # 详细设置说明
├── demo-scenario.md             # 详细场景文档
├── master/                      # Master Agent
│   ├── master-agent.ts          # Master 主程序
│   ├── package.json             # NPM 依赖
│   └── tsconfig.json            # TypeScript 配置
├── slaver/                      # Slaver Agent
│   ├── slaver-agent.py          # Slaver 主程序
│   ├── requirements.txt         # Python 依赖
│   └── config.py                # 配置文件
└── scripts/                     # 运行脚本
    ├── start-redis.sh           # 启动 Redis
    ├── start-server.sh          # 启动 EKET Server
    ├── run-demo.sh              # 运行完整演示
    └── cleanup.sh               # 清理环境
```

## 技术要点

### WebSocket 实时通信
- Master 通过 WebSocket 接收实时消息
- 无需轮询，提高响应速度
- 自动重连机制

### 自动心跳
- 定期发送心跳保持连接
- 报告当前状态和进度
- 服务器监控 Agent 健康状态

### 错误处理
- 网络错误自动重试
- 任务冲突检测（重复 claim）
- 优雅降级和清理

### 多语言 SDK
- JavaScript/TypeScript SDK (Node.js)
- Python SDK
- 统一的 API 接口

## 学习资源

- EKET Protocol: `../../docs/protocol/EKET_PROTOCOL_V1.md`
- JavaScript SDK: `../../sdk/javascript/`
- Python SDK: `../../sdk/python/`
- HTTP API: `../../docs/protocol/HTTP_API.md`

## 扩展示例

基于此示例，你可以：
1. 添加更多 Slaver (不同 specialty)
2. 实现多任务并发处理
3. 添加 PR Comment 交互
4. 集成真实的 Git 操作
5. 添加任务依赖关系
6. 实现工作流引擎

## 故障排查

### Redis 连接失败
```bash
# 检查 Redis 是否运行
docker ps | grep redis

# 启动 Redis
./scripts/start-redis.sh
```

### EKET Server 无法启动
```bash
# 检查端口占用
lsof -i :8080

# 检查 JWT Secret
export OPENCLAW_API_KEY="demo-secret-key-1234567890"
```

### Agent 注册失败
- 确认 Server 已启动
- 检查网络连接
- 查看 Server 日志

## License

MIT

## 贡献

欢迎提交 Issue 和 Pull Request!
