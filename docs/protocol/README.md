# EKET Protocol Documentation

**Version**: 1.0.0  
**Status**: Draft  
**Last Updated**: 2026-04-07

---

## 📚 文档索引

### 核心规范

| 文档 | 描述 | 状态 |
|------|------|------|
| [EKET_PROTOCOL_V1.md](EKET_PROTOCOL_V1.md) | 完整协议规范 | ✅ Draft |
| [QUICKSTART.md](QUICKSTART.md) | 5 分钟快速上手 | ✅ Draft |
| [openapi.yaml](openapi.yaml) | OpenAPI 3.0 规范 | ✅ Draft |

### JSON Schema

| Schema | 描述 |
|--------|------|
| [agent_registration.json](schemas/agent_registration.json) | Agent 注册 Schema |
| [message.json](schemas/message.json) | 消息格式 Schema |
| [task.json](schemas/task.json) | 任务格式 Schema |

### 补充文档（待创建）

| 文档 | 描述 | 状态 |
|------|------|------|
| HTTP_API.md | HTTP API 详细参考 | 🚧 TODO |
| FILE_STRUCTURE.md | 文件结构详细说明 | 🚧 TODO |
| MIGRATION.md | 从其他系统迁移指南 | 🚧 TODO |
| SECURITY.md | 安全最佳实践 | 🚧 TODO |
| examples/ | 各语言示例代码 | 🚧 TODO |

---

## 🎯 协议概述

EKET (Efficient Knowledge-based Execution Toolkit) Protocol 是一个**通用的 AI Agent 协作协议**，使得不同 AI 工具可以在同一个项目中协同工作。

### 支持的工具

- **Claude Code** - Anthropic 的 AI 编程助手
- **OpenCLAW** - OpenAI 的协作框架
- **Cursor** - AI-powered 代码编辑器
- **Windsurf** - Codeium 的 AI 开发环境
- **Gemini** - Google 的 AI 模型
- **Custom Tools** - 任何支持 HTTP 或文件系统的工具

### 核心特性

```
┌─────────────────────────────────────────────────────┐
│  Universal                                          │
│  任何 AI 工具都可接入                                │
├─────────────────────────────────────────────────────┤
│  Dual Mode                                          │
│  HTTP (实时) + File (离线)                           │
├─────────────────────────────────────────────────────┤
│  Human-Centric                                      │
│  End User 只与 Master 交互                           │
├─────────────────────────────────────────────────────┤
│  Scalable                                           │
│  支持 1-100+ Agents 协作                             │
├─────────────────────────────────────────────────────┤
│  Auditable                                          │
│  所有操作可追溯、可回滚                               │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 快速开始

### 1. HTTP Mode（服务器模式）

```bash
# 启动 EKET 服务器
node dist/index.js gateway:start --port 8080

# 注册 Agent
curl -X POST http://localhost:8080/api/v1/agents/register \
  -d '{"agent_type": "my_tool", "role": "slaver", "specialty": "frontend"}'

# 领取任务
curl -X POST http://localhost:8080/api/v1/tasks/FEAT-001/claim
```

### 2. File Mode（文件模式）

```bash
# 创建实例
mkdir -p .eket/instances/slaver_001
cat > .eket/instances/slaver_001/identity.yml <<EOF
instance_id: slaver_001
agent_type: my_tool
role: slaver
specialty: frontend
EOF

# 领取任务
sed -i 's/status: ready/status: in_progress/' jira/tickets/FEAT-001.md
sed -i 's/assigned_to:/assigned_to: slaver_001/' jira/tickets/FEAT-001.md
```

**详细教程**: 查看 [QUICKSTART.md](QUICKSTART.md)

---

## 📐 架构设计

### Agent 角色

```
┌──────────────────────────────────────────────┐
│                Master Agent                  │
│  • 分析需求                                   │
│  • 拆解任务                                   │
│  • 审核 PR                                    │
│  • 合并代码                                   │
│  • 监控进度                                   │
└──────────────┬───────────────────────────────┘
               │
    ┌──────────┼──────────┬──────────┐
    │          │          │          │
    ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Slaver 1│ │Slaver 2│ │Slaver 3│ │Slaver N│
│Frontend│ │Backend │ │  QA    │ │DevOps  │
└────────┘ └────────┘ └────────┘ └────────┘
```

### 通信层

```
┌──────────────────────────────────────────────┐
│  Application Layer                           │
│  Task Management | PR Workflow | Monitoring  │
├──────────────────────────────────────────────┤
│  Message Layer                               │
│  Message Queue | Event Bus | Notifications   │
├──────────────────────────────────────────────┤
│  State Layer                                 │
│  Instance Registry | Task FSM | Heartbeat    │
├──────────────────────────────────────────────┤
│  Transport Layer                             │
│  HTTP/REST (Online) | File System (Offline)  │
└──────────────────────────────────────────────┘
```

---

## 📝 协议版本

### 版本格式

`MAJOR.MINOR.PATCH`

- **MAJOR**: 不兼容的 API 变更
- **MINOR**: 向后兼容的功能新增
- **PATCH**: 向后兼容的 Bug 修复

### 当前版本

- **Protocol**: v1.0.0
- **HTTP API**: v1
- **Status**: Draft (征求意见中)

---

## 🔌 SDK 支持

### 官方 SDK

| 语言 | 包名 | 状态 |
|------|------|------|
| Python | `eket-sdk` | 🚧 开发中 |
| JavaScript/TypeScript | `eket-sdk` | 🚧 开发中 |
| Go | `github.com/eket/sdk-go` | 🚧 计划中 |
| Rust | `eket-sdk` | 🚧 计划中 |

### 社区 SDK

欢迎贡献其他语言的 SDK！

---

## 📖 使用示例

### Python

```python
from eket_sdk import EKETClient

client = EKETClient(mode="auto")
client.register_agent(agent_type="my_tool", role="slaver", specialty="backend")
task = client.claim_task("FEAT-001")
client.submit_pr(task_id="FEAT-001", branch="feature/FEAT-001")
```

### JavaScript

```javascript
const { EKETClient } = require('eket-sdk');
const client = new EKETClient({ mode: 'auto' });

await client.register({ agentType: 'my_tool', role: 'slaver' });
await client.claimTask('FEAT-001');
await client.submitPR({ taskId: 'FEAT-001', branch: 'feature/FEAT-001' });
```

### Shell (Claude Code)

```bash
/eket-init
/eket-claim FEAT-001
/eket-submit-pr
```

### HTTP (OpenCLAW)

```bash
curl -X POST http://localhost:8080/api/v1/agents/register \
  -d '{"agent_type": "openclaw", "role": "slaver"}'
```

---

## 🤝 贡献指南

### 反馈协议草案

协议当前处于 **Draft** 状态，欢迎反馈：

1. 在 [GitHub Issues](https://github.com/eket-framework/protocol/issues) 提交建议
2. 提交 Pull Request 完善文档
3. 参与 [Discussions](https://github.com/eket-framework/protocol/discussions) 讨论

### 实现协议

如果你想为你的 AI 工具实现 EKET 协议：

1. 阅读 [EKET_PROTOCOL_V1.md](EKET_PROTOCOL_V1.md)
2. 参考 [QUICKSTART.md](QUICKSTART.md)
3. 使用 [OpenAPI Spec](openapi.yaml) 生成客户端
4. 查看 [examples/](examples/) 目录的示例
5. 提交你的实现到社区展示

---

## 📊 兼容性矩阵

| AI Tool | HTTP Mode | File Mode | Status |
|---------|-----------|-----------|--------|
| Claude Code | ✅ | ✅ | 已实现 |
| OpenCLAW | 🚧 | ⏳ | 开发中 |
| Cursor | ⏳ | ⏳ | 计划中 |
| Windsurf | ⏳ | ⏳ | 计划中 |
| Gemini | ⏳ | ⏳ | 计划中 |

---

## 🛠️ 工具和资源

### 在线工具

- **API 文档**: http://localhost:8080/api/docs
- **Schema 验证器**: 使用 [ajv](https://ajv.js.org/) 验证消息
- **OpenAPI 编辑器**: [Swagger Editor](https://editor.swagger.io/)

### 测试工具

```bash
# HTTP 模式测试
curl -X POST http://localhost:8080/api/v1/health

# File 模式测试
cat .eket/instances/*/identity.yml

# Schema 验证
ajv validate -s schemas/message.json -d test_message.json
```

---

## 📜 许可证

EKET Protocol 使用 **MIT License**。

你可以自由地：
- 使用协议
- 修改协议
- 分发协议
- 商业使用

---

## 📞 联系我们

- **GitHub**: https://github.com/eket-framework/protocol
- **Issues**: https://github.com/eket-framework/protocol/issues
- **Discussions**: https://github.com/eket-framework/protocol/discussions
- **Email**: protocol@eket.dev

---

## 🗺️ Roadmap

### v1.0.0 (当前)
- ✅ 核心协议定义
- ✅ HTTP API 规范
- ✅ File Mode 规范
- ✅ JSON Schema
- ✅ OpenAPI 规范

### v1.1.0 (Q2 2026)
- 🚧 Python SDK
- 🚧 JavaScript SDK
- 🚧 OpenCLAW 适配器
- 🚧 详细示例

### v2.0.0 (Q3 2026)
- ⏳ WebSocket 实时通信
- ⏳ 工作流引擎
- ⏳ 智能调度器
- ⏳ 监控面板

---

**维护者**: EKET Framework Team  
**最后更新**: 2026-04-07  
**协议版本**: 1.0.0 (Draft)
