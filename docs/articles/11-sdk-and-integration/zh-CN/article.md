# 11 — SDK 与集成：JS / Python / axum / OpenClaw

> **TL;DR** — EKET 通过**四种集成面**对外暴露协议：**JavaScript SDK**（`sdk/javascript/`，npm 包名 `eket-sdk`）、**Python SDK**（`sdk/python/`，PyPI 包名 `eket-sdk`）、**axum HTTP API**（`rust/crates/eket-server/`，默认端口 9877）、**OpenClaw 桥接**（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`）。四种面共享同一份协议（`EKET Protocol v1.0.0`）与同一套鉴权——**JWT（HS256）**优先、**静态 Bearer token** 兜底，密钥长度 ≥32 字符在启动时强制（`rust/crates/eket-server/src/lib.rs:511-521`）。选哪种面取决于**调用方是谁**：进程内 Slaver → SDK；跨服务调用 → HTTP；跨框架编排器（OpenClaw）→ 桥接网关。

> **核心要点**
> 1. EKET 暴露**四个集成面**——SDK 与 axum API 是**平级兄弟**，不是栈式层级。底层是同一份协议，四个面是该协议的不同 binding。
> 2. **鉴权双模、服务端强制**：JWT（HS256，`EKET_JWT_SECRET`）或静态 Bearer（`EKET_AUTH_TOKEN`），常量时间比较；`/health /ready /live /sse/events` 四个路径白名单免鉴权（`auth.rs:40`）。**目前没有 scope**——授权靠**状态机里的角色**。
> 3. **JS SDK**（`sdk/javascript/src/index.ts:92`）和 **Python SDK**（`sdk/python/eket_sdk/__init__.py:13`）都把 `__version__` 与 `__protocol_version__` 钉在 `1.0.0`，并以**独立的 semver 轨道**与 node core（`2.x.x`）解耦（`sdk/VERSIONING.md:5-11`）。
> 4. **axum HTTP API** 在 `rust/crates/eket-server/src/lib.rs:461-492` 暴露 15 条 `/api/v1/*` 路由，外加 `/sse/events` 与 `/ws` 实时通道。
> 5. **OpenClaw 桥接**不是替代品，是**协议翻译器**——`Workflow → Task → Agent` 一对一映射到 `Epic → Ticket → Slaver`（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30`）。执行仍在 EKET 内部完成。

---

## Executive Summary

**给决策者（读完这段即可离开）：**

| 问题 | 答案 |
|---|---|
| 谁该读这篇？ | 在 EKET **之上**构建的人——agent 作者、dashboard 作者、跨框架编排器作者。 |
| 暴露哪些面？ | JS SDK、Python SDK、axum HTTP API、OpenClaw 桥接。四者都实现 `EKET Protocol v1.0.0`。 |
| 鉴权怎么搞？ | 双模：JWT HS256（`EKET_JWT_SECRET` ≥32 字符，启动时强制）或静态 Bearer（`EKET_AUTH_TOKEN`，常量时间比对）；`/health /ready /live /sse/events` 免鉴权。 |
| 版本怎么管？ | 独立 semver。SDK 是 `1.x.x`，node core 是 `2.x.x`。详见 `sdk/VERSIONING.md:5-11`。 |
| 怎么选？ | 进程内 agent → SDK。跨服务 → HTTP。跨框架编排器（OpenClaw）→ 桥接。浏览器 dashboard → HTTP + SSE/WS。 |
| 想加第五种面？ | 协议是开放的，状态机（`rust/crates/eket-core/src/ticket.rs`）与角色门控转换（`protocol/state-machines/ticket-status.yml`）就是契约，套任何传输都行。 |

下文是给**集成者**的细节，每个面都附**可直接复制运行**的代码片段。

---

## 目录

1. 动机——为什么需要"集成面"
2. 四种集成面一览
3. JavaScript SDK（`sdk/javascript/`）——安装与首次调用
4. Python SDK（`sdk/python/`）——安装与首次调用
5. axum HTTP API（`rust/crates/eket-server/`）——REST 端点与鉴权
6. OpenClaw 桥接（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`）——能力清单
7. Webhook 事件——发什么、怎么订阅
8. 自建集成——何时用 SDK、何时直接打 HTTP
9. 版本策略（`sdk/VERSIONING.md`）——SDK 的 semver 政策
10. 参考

---

## 1. 动机——为什么需要"集成面"

本系列前 10 篇把 EKET 当成**协议**讲：状态机、三仓分离、四级降级、Saga 5 步完成。这都是必要前提，但**集成者真正摸到的**不是这些。

集成者摸到的第一样东西，必然是下列之一：

1. `npm install eket-sdk` 后 `import { EketClient } from 'eket-sdk'`。
2. `pip install eket-sdk` 后 `from eket_sdk import EketClient`。
3. 对 axum 服务发一条 `curl http://localhost:9877/api/v1/tasks`。
4. 来自 OpenClaw 的一条"创建 workflow EPIC-001，把 FEAT-001 分给前端 Slaver"的请求。

本文是 EKET 的**集成者视角**。不重复讲状态机（那是 `06-master-slaver-protocol`）、三仓分离（那是 `04-three-repo-arch`）、四级降级（那是 `05-four-level-degradation`）。**只把协议映射到四种真正承载流量的面**上，回答实际的问题：*给定我的语言、运行时、调用方，我该用哪个面？*

集成者的时间很贵。本文结构保证**复制 → 粘贴 → 跑通**能在 5 分钟内完成。协议层面的语义（Saga、CAS、角色门控）给出链接但不重述——协议是契约，面是调用契约的方式。

> "任何想参与协议的外部系统都通过四种面之一接入。面不是层级，是平级兄弟。选谁取决于**谁在调用**，不是**谁先出生**。"
> — *EKET 集成笔记，2026-05*

三种失败模式塑造了四种面的形态：

1. **"我只想取一个任务"的陷阱。** 早期 SDK（v1.0 之前）堆了 14 个门面方法，集成者必须先学协议才能干正事。现在 JS SDK 的 `registerAgent → listTasks → claimTask → sendHeartbeat → submitPR` 循环压到 25 行（`sdk/javascript/README.md:38-80`）。
2. **"我手撸了个 HTTP 客户端"的陷阱。** 协议成熟前，几个团队用自己写的 JWT 签名器、重试器、分页器糊上去。现在 axum API（`rust/crates/eket-server/src/lib.rs:461-492`）仍然是**跨服务调用**的正确选择；SDK 存在是为了**进程内代码**不必再撸一遍。
3. **"OpenClaw 是竞品"的陷阱。** OpenClaw **不是** EKET 的替代品，是**调用 EKET 作为执行层**的编排器（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:11-17`）。把它们当竞品会错过真正的价值——它们是**组合**关系。

---

## 2. 四种集成面一览

| 面 | 路径 | 传输 | 鉴权 | 适用场景 |
|---|---|---|---|---|
| **JavaScript SDK** | `sdk/javascript/`（`npm install eket-sdk`） | HTTP + WebSocket，自动重连 | JWT 或静态 Bearer（`registerAgent` 响应里**自动设置**） | 进程内 Node.js / 浏览器 agent；Claude Code skill 作者 |
| **Python SDK** | `sdk/python/`（`pip install eket-sdk`） | HTTP via `requests.Session`；`retry_with_backoff` 工具 | JWT 或静态 Bearer | 进程内 Python agent；数据流水线胶水；ML serving 适配 |
| **axum HTTP API** | `rust/crates/eket-server/`（默认 9877） | REST + SSE + WebSocket | JWT（HS256）或静态 Bearer，`/health /ready /live /sse/events` 白名单 | 跨服务调用；dashboard 后端；不能引入 SDK 依赖的任意系统 |
| **OpenClaw 桥接** | `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`（4 阶段：网关 → 动态加载 → 消息队列 → 强化 Claude Code） | HTTP/REST + Redis Pub/Sub | API Key + JWT（三层：OpenClaw→Gateway API key、Gateway→Master JWT、Master→Slaver 实例证书） | 外部 AI 编排器；多框架协同；OpenClaw-native workflow |

几条值得注意的观察：

- **四个面都实现 `EKET Protocol v1.0.0`。** 协议是契约，面是不同 binding。
- **SDK 和 axum API 是兄弟，不是栈。** JS SDK（`sdk/javascript/src/client.ts:88-94`）最终就是打 `/api/v1/*` 的 HTTP——它只是给 axum 服务套了**类型、重连、退避、WebSocket**。SDK 后面没有"另一台协议服务器"。
- **OpenClaw 桥接是协议翻译器，不是平行引擎。** 它把 OpenClaw 的 `Workflow → Task → Agent` 翻译成 EKET 的 `Epic → Ticket → Slaver`（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30`），执行仍然发生在 EKET 内部。
- **目前没有 gRPC、没有 GraphQL。** 都有人要过。当前的决定是"REST + SSE + WS 够了，有真用户再加 gRPC"——`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:90-117` 是网关规划，不是 gRPC 规划。

```
                     ┌────────────────────────────┐
                     │   外部编排器                │
                     │   (OpenClaw / 人类总控)     │
                     └─────────────┬──────────────┘
                                   │ Phase 1 网关（HTTP）
                                   ▼
        ┌──────────────────────────────────────────────────┐
        │              EKET 集成面                          │
        │                                                  │
        │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
        │  │  JS SDK  │  │  Py SDK  │  │  axum HTTP   │  │
        │  │  (npm)   │  │  (pip)   │  │  (端口 9877) │  │
        │  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
        │       │             │               │          │
        │       │   ┌─────────┴────────┐      │          │
        │       │   │  OpenClaw 桥接   │      │          │
        │       │   │  (网关 +         │      │          │
        │       │   │   Redis Pub/Sub) │      │          │
        │       │   └─────────┬────────┘      │          │
        │       │             │               │          │
        └───────┼─────────────┼───────────────┼──────────┘
                │             │               │
                └─────────────┴───────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  EKET Core       │
                    │  (SQLite +       │
                    │   状态机)         │
                    └──────────────────┘
```

---

## 3. JavaScript SDK（`sdk/javascript/`）——安装与首次调用

JS SDK 以 npm 包 `eket-sdk` 发布（见 `sdk/javascript/README.md:23-25`）。当前版本 `1.0.0`，在 `sdk/javascript/src/index.ts:92` 用常量导出（`export const VERSION = '1.0.0';`）。TypeScript 优先，附完整类型定义；`sdk/javascript/README.md:11-20` 列出的能力：

- 完整 TypeScript 支持（类型在 `sdk/javascript/src/types.ts`）
- WebSocket 实时消息（agent ↔ agent）
- Promise / async-await 风格
- 类型安全错误（`sdk/javascript/src/errors.ts`）
- 零配置安装
- WebSocket 指数退避自动重连
- 完整文档（README 450+ 行）
- 配套单元测试

### 3.1 安装

```bash
npm install eket-sdk
# 或
yarn add eket-sdk
```

（出处：`sdk/javascript/README.md:23-31`）

### 3.2 首次调用——注册、列出、领取、心跳、PR

README 的 Quick Start（`sdk/javascript/README.md:38-80`）把完整 agent 生命周期压到 ~25 行。**最小可跑**版本：

```typescript
import { EketClient } from 'eket-sdk';

// 1. 创建 client。baseURL 指向 axum 服务（默认 9877，见
//    rust/crates/eket-server/src/main.rs:28-31）。
const client = new EketClient({
  serverUrl: 'http://localhost:9877',
});

// 2. 注册。服务端返回 { instance_id, token, server_url,
//    websocket_url, heartbeat_interval }。token 自动套用到后续请求。
const { instance_id, token } = await client.registerAgent({
  agent_type: 'claude_code',
  role: 'slaver',
  specialty: 'frontend',
  capabilities: ['react', 'typescript', 'css'],
});
console.log('Registered as:', instance_id);

// 3. 列出 READY 任务。
const tasks = await client.listTasks({ status: 'ready' });

// 4. 领取第一个（原子 CAS，见 06-master-slaver-protocol）。
const task = await client.claimTask(tasks[0].id, instance_id);

// 5. 心跳——保活，可能带回消息。
await client.sendHeartbeat(instance_id, {
  status: 'active',
  current_task: task.id,
  progress: 0.5,
});

// 预期日志（stdout）：
//   Registered as: claude-code-<uuid>
```

片段使用 `sdk/javascript/src/index.ts:10-89` 导出的公开 API，以及 `sdk/javascript/README.md:135-170` 描述的方法签名。字段名（`agent_type`、`role`、`specialty`、`capabilities`）和联合类型在编译期强约束。错误处理用 `sdk/javascript/src/errors.ts`（`index.ts:61-71` 导出）的有类型异常——例如 `ConflictError` 在抢任务竞争失败时抛出。

### 3.3 WebSocket——实时通道

`EketClient` 自带**默认开启**的 WebSocket（`enableWebSocket: true`）。连接/订阅/断开在 `sdk/javascript/README.md:84-114`：

```typescript
await client.connectWebSocket(instance_id);

client.onMessage((message) => {
  console.log('Received:', message.type, message.payload);
});

client.onError((error) => {
  console.error('WebSocket error:', error);
});

client.onClose(() => {
  console.log('WebSocket disconnected');
});
```

服务端 WebSocket 端点在 `rust/crates/eket-server/src/lib.rs:467`（`/ws`），handler 在 `rust/crates/eket-server/src/ws.rs`。重连有上限：`wsMaxReconnectAttempts = 5`，`wsReconnectDelay = 1000` ms 初始，来源 `sdk/javascript/src/client.ts:69-70`。

### 3.4 错误模型

SDK 导出 8 个错误类（`sdk/javascript/src/index.ts:61-71`）：`EketError`、`NetworkError`、`AuthenticationError`、`ValidationError`、`NotFoundError`、`ConflictError`、`ServiceUnavailableError`、`WebSocketError`。catch 模式在 `sdk/javascript/README.md:357-382`：

```typescript
import {
  EketError,
  ConflictError,
  NotFoundError,
  NetworkError,
} from 'eket-sdk';

try {
  await client.claimTask('FEAT-001', instance_id);
} catch (error) {
  if (error instanceof ConflictError) {
    console.log('Task already claimed by another agent');
  } else if (error instanceof NotFoundError) {
    console.log('Task not found');
  } else if (error instanceof NetworkError) {
    console.log('Network issue:', error.message);
  } else {
    console.log('Unknown error:', error);
  }
}
```

---

## 4. Python SDK（`sdk/python/`）——安装与首次调用

Python SDK 以 PyPI 包 `eket-sdk` 发布（`sdk/python/README.md:25-27`）。当前版本 `1.0.0`，在 `sdk/python/eket_sdk/__init__.py:13` 用 `__version__ = "1.0.0"` 导出。要求 Python 3.8+、依赖 `requests >= 2.31.0`（`sdk/python/README.md:472-475`）。`sdk/python/README.md:13-19` 列出的能力：

- 完整协议支持
- JWT 鉴权，token 自动管理
- 指数退避自动重试（`utils.retry_with_backoff`）
- 完整 type hints
- 完整单元测试
- Pythonic、符合直觉的 API

### 4.1 安装

```bash
pip install eket-sdk          # 从 PyPI（未来）
# 或，当前：
cd sdk/python && pip install -e .
```

（出处：`sdk/python/README.md:23-39`）

### 4.2 首次调用——注册、列出、领取、更新

README Quick Start（`sdk/python/README.md:46-82`）把生命周期压到 ~30 行。**最小可跑**版本：

```python
from eket_sdk import (
    EketClient, AgentType, AgentRole, AgentSpecialty,
    TaskStatus, MessageType, TestStatus,
)

# 1. 创建 client。server_url 指向 axum 服务（默认 9877）。
client = EketClient(server_url="http://localhost:9877")

# 2. 注册。Agent dataclass 包含 instance_id、role、capabilities 等。
agent = client.register_agent(
    agent_type=AgentType.CUSTOM,
    role=AgentRole.SLAVER,
    specialty=AgentSpecialty.BACKEND,
    capabilities=["python", "fastapi", "postgresql"],
)
print(f"Registered as {agent.instance_id}")

# 3. 列出 READY 任务。
tasks = client.list_tasks(status=TaskStatus.READY)

# 4. 领取第一个。
task = client.claim_task(tasks[0].id)
print(f"Claimed task: {task.id}")

# 5. 更新进度并提交 PR。
client.update_task(
    task.id,
    status=TaskStatus.REVIEW,
    progress=1.0,
    notes="Implementation completed",
)

pr_id = client.submit_pr(
    instance_id=agent.instance_id,
    task_id=task.id,
    branch=f"feature/{task.id}-impl",
    description="Implemented feature",
    test_status=TestStatus.PASSED,
)

# 6. 通知 Master。
masters = client.list_agents(role=AgentRole.MASTER)
client.send_message(
    from_id=agent.instance_id,
    to_id=masters[0].instance_id,
    msg_type=MessageType.PR_REVIEW_REQUEST,
    payload={"task_id": task.id, "pr_id": pr_id},
)

# 预期日志（stdout）：
#   Registered as <instance_id>
```

片段用到 `sdk/python/eket_sdk/__init__.py:16-29` 导出的公开面，以及 `sdk/python/eket_sdk/client.py:174-202`（`register_agent`）、`client.py:375-422`（`list_tasks`、`claim_task`）、`client.py:598-...`（`submit_pr`）的方法签名。

### 4.3 上下文管理器

Python SDK 支持 `with` 语法自动收尾（`sdk/python/README.md:110-120`）：

```python
with EketClient(server_url="http://localhost:9877") as client:
    agent = client.register_agent(
        agent_type=AgentType.CUSTOM,
        role=AgentRole.SLAVER,
    )
    # ... 干活 ...
    client.deregister_agent()
# Session 自动关闭，instance 自动注销。
```

### 4.4 错误模型

SDK 导出 6 个异常类（`sdk/python/eket_sdk/__init__.py:22-29`，定义在 `exceptions.py`）：`EketError`（基类）、`AuthenticationError`（401）、`ValidationError`（400）、`NotFoundError`（404）、`ConflictError`（409，例如"已被领取"）、`ServerError`（500）。catch 模式在 `sdk/python/README.md:319-337`：

```python
from eket_sdk import EketError, ConflictError, NotFoundError

try:
    task = client.claim_task("FEAT-001")
except ConflictError as e:
    print(f"Task already claimed: {e.message}")
    print(f"Claimed by: {e.details.get('assigned_to')}")
except NotFoundError:
    print("Task not found")
except EketError as e:
    print(f"Error {e.code}: {e.message}")
```

### 4.5 自动重试

长跑的 claim 循环可以用 `sdk/python/eket_sdk/utils.py` 里的装饰器（`sdk/python/README.md:373-385`）：

```python
from eket_sdk.utils import retry_with_backoff

@retry_with_backoff(max_retries=5, initial_delay=1.0)
def claim_task_with_retry(client, task_id):
    return client.claim_task(task_id)
```

---

## 5. axum HTTP API（`rust/crates/eket-server/`）——REST 端点与鉴权

axum HTTP 服务是**协议的规范线协议**。SDK 是它的类型化封装。**无法引入 SDK 依赖**时——例如 Java/Go 跨服务调用、Serverless 函数、shell 脚本——HTTP API 就是入口。

### 5.1 路由表

完整路由在 `rust/crates/eket-server/src/lib.rs:461-492`（`build_router` 函数）：

| Method | Path | Handler | 用途 |
|---|---|---|---|
| GET | `/health` | `health_handler` | 存活 + 启动秒数 |
| GET | `/live` | `live_handler` | 仅存活 |
| GET | `/ready` | `ready_handler` | 就绪——检查 SQLite |
| GET | `/sse/events` | `sse_handler` | SSE 实时事件流 |
| GET | `/ws` | `ws::ws_handler` | WebSocket 升级 |
| GET | `/api/v1/tasks` | `list_tasks` | 列出任务，按 status / assignee / priority 过滤 |
| GET | `/api/v1/tasks/:id` | `get_task` | 取一个任务 |
| PATCH | `/api/v1/tasks/:id/status` | `update_task_status` | 改状态（Saga 步骤 5） |
| GET | `/api/v1/agents` | `list_agents` | 列出 agent，按 role 过滤 |
| POST | `/api/v1/agents/register` | `register_agent_handler` | 注册 agent |
| GET | `/api/v1/agents/:id` | `get_agent` | 取一个 agent |
| DELETE | `/api/v1/agents/:id` | `delete_agent_handler` | 标记 offline |
| POST | `/api/v1/agents/:id/heartbeat` | `agent_heartbeat_handler` | 心跳（也返回 last_seen） |
| POST | `/api/v1/tasks/:id/claim` | `claim_task_handler` | 原子领取（SQLite CAS） |
| GET | `/api/v1/dag` | `get_dag` | 票务 DAG 与边 |
| POST | `/hooks/pre-tool-use` | `hooks::pre_tool_use` | Claude Code hook |
| POST | `/hooks/post-tool-use` | `hooks::post_tool_use` | Claude Code hook |
| POST | `/hooks/teammate-idle` | `hooks::teammate_idle` | Claude Code hook |
| POST | `/hooks/task-completed` | `hooks::task_completed` | Claude Code hook |
| POST | `/hooks/permission-request` | `hooks::permission_request` | Claude Code hook |

（出处：`rust/crates/eket-server/src/lib.rs:468-486`）

**默认端口 9877**，在 `rust/crates/eket-core/src/config.rs:49` 设置，启动时从 `rust/crates/eket-server/src/main.rs:28-31` 读取（可用 `EKET_SERVER_PORT` 覆盖）。CORS 是**开放**的（`lib.rs:490` 的 `CorsLayer::permissive()`）——生产部署要收紧。

### 5.2 鉴权模型——双模、服务端强制

HTTP API、SDK、（以及往上多一层的）OpenClaw 桥接**共用同一套鉴权**。实现在 `rust/crates/eket-server/src/auth.rs:1-93`，源码注释（1-3 行）解释得很直白：

> "TASK-184: Unified auth — supports both JWT (HS256) and static Bearer token.
> - JWT: verified via `EKET_JWT_SECRET` (HS256, exp checked)
> - Static token: compared constant-time via `EKET_AUTH_TOKEN` (backward compat)"

按优先级排序的规则：

1. **两种都关**——请求直接放行（`auth.rs:47-50`）。这是开发/单租户默认。**生产必须开一种。**
2. **白名单路径**（`/health`、`/ready`、`/live`、`/sse/events`）**永远免鉴权**（`auth.rs:40` 与 `54-56`）。`/sse/events` 放行是有意为之——SSE 消费者（dashboard、OpenClaw）不该被 JWT 拖住。
3. **Authorization 头**被读取（`auth.rs:59-63`）。若 `Bearer <token>` 缺失，返回 `401 {"error": "missing_token"}`（65-70 行）。
4. **JWT 模式**（`EKET_JWT_SECRET` 已设置，≥32 字符在启动时强制——见 `lib.rs:511-521`）：token 用 HS256 解码，`validate_exp = true`（73-79 行）。过期或错密钥的 token 落到下一步静态检查。
5. **静态模式**（`EKET_AUTH_TOKEN` 已设置）：用 `constant_time_eq` **常量时间**比对（83-86 行），避免时序侧信道。
6. **全部失败**——`401 {"error": "invalid_token"}`（89-92 行）。

JWT 密钥长度在启动时被强制校验（`lib.rs:512-519`）：

```rust
let jwt_secret = std::env::var("EKET_JWT_SECRET").ok();
if let Some(ref secret) = jwt_secret {
    if secret.len() < 32 {
        return Err(anyhow::anyhow!(
            "EKET_JWT_SECRET must be ≥32 chars (256-bit entropy), got {} chars",
            secret.len()
        ));
    }
    info!("JWT auth enabled via EKET_JWT_SECRET");
}
```

单测 `weak_jwt_secret_rejected`（`lib.rs:744-760`）断言：5 字符的密钥会让 `start()` 返回带 `≥32 chars` 的错误。

**目前没有 scope。** `Claims` 结构在 `auth.rs:16-20` 只有 `sub` 与 `exp`：

```rust
struct Claims {
    sub: String,
    exp: usize,
}
```

授权靠**状态机里的角色**（`who_can_transition: [slaver]` 等，见 `06-master-slaver-protocol:284-292`），不靠 token scope。如果要**多租户 scope 隔离**，提个 ticket；设计意图是把它作为 Claims 的第三个字段加上，**不破坏 v1.0.0 协议**。

### 5.3 首次调用——curl

```bash
# 健康检查（白名单，无需鉴权）。
curl -s http://localhost:9877/health
# {"status":"ok","uptime_secs":42}

# 注册 agent（若 EKET_AUTH_TOKEN 或 EKET_JWT_SECRET 已设置则需鉴权）。
curl -X POST http://localhost:9877/api/v1/agents/register \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}" \
  -d '{
    "agent_id": "claude-frontend-001",
    "role": "slaver",
    "type": "claude_code",
    "skills": ["react", "typescript"]
  }'
# {"ok":true,"agent_id":"claude-frontend-001"}

# 心跳。
curl -X POST http://localhost:9877/api/v1/agents/claude-frontend-001/heartbeat \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}"
# {"ok":true,"last_seen":"2026-06-04T11:23:55Z"}

# 领取任务（原子 CAS）。
curl -X POST http://localhost:9877/api/v1/tasks/FEAT-001/claim \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}" \
  -d '{"agent_id":"claude-frontend-001"}'
# {"ok":true,"ticket_id":"FEAT-001","assignee":"claude-frontend-001","claimed_at":"..."}
# 抢失败时：
# 409 {"error":"already_claimed"}

# 列出任务。
curl -s 'http://localhost:9877/api/v1/tasks?status=ready' \
  -H "Authorization: Bearer ${EKET_AUTH_TOKEN}"
# {"tasks":[...],"total":N}
```

这四次调用覆盖了四个 handler：`register_agent_handler`（`lib.rs:326-336`）、`agent_heartbeat_handler`（`lib.rs:353-367`）、`claim_task_handler`（`lib.rs:374-403`）、`list_tasks`（`lib.rs:188-233`）。**claim handler 最值得看**——它发一条 SQL `UPDATE`，**仅当行还在 `('todo', 'ready', 'backlog')` 时**才翻 `status='in_progress'` 与 `assignee=?`（`lib.rs:381-387`）。`info.changes === 0` 时返回 `409 Conflict` + `{"error":"already_claimed"}`（`lib.rs:392-395`）。**这是防双领的 CAS 原语。**

### 5.4 实时——SSE 与 WebSocket

`/sse/events` 端点（`lib.rs:407-440`）把 `EventBus` 的 `EventType` 流出去。事件联合在 `lib.rs:35-72`：

```rust
pub enum EventType {
    TaskStarted, TaskCompleted, TaskFailed, TaskBlocked,
    AgentRegistered, AgentHeartbeat, AgentOffline,
    MasterElected, MasterFailover,
    QueueOverflow, QueueDrained,
    ReviewRequested, ReviewApproved, ReviewRejected,
}
```

每个事件名通过 `as_str()`（`lib.rs:54-72`）序列化为 snake_case（`task_started`、`agent_offline` 等）。Handler 接受可选 `?filter=task_*` 查询参数订阅子集（411 行、418-422 行）。

慢订阅者落后于 broadcast 4096 槽位缓冲时，**会发 `lagged` 事件**（`lib.rs:427-431`），payload 是 `{"missed": N}`。**这是特性不是 bug**——另一选择是静默丢消息。

WebSocket 端点（`/ws`，`lib.rs:467`）实现在 `rust/crates/eket-server/src/ws.rs`。订阅者在 ticket 状态转换时收到 `WorkflowEvent`（由 `lib.rs:692-740` 的 `ws_event_on_transition` 测试验证）。

---

## 6. OpenClaw 桥接（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md`）——能力清单

OpenClaw 是**外部 AI 编排器**，EKET 是**执行层**。桥接是它们之间的协议翻译器。设计在 `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:1-517`（517 行、9 节）；数据流在 `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:1-777`（777 行、6 节）。

### 6.1 概念映射（原文）

`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30` 定义了一对一映射：

| OpenClaw 概念 | EKET 对应物 | 说明 |
|---|---|---|
| Workflow | Epic | Workflow = 史诗级工作 |
| Task | Ticket | Task = Jira Ticket |
| Agent Instance | Slaver Instance | 执行实例 |
| Orchestrator | Master Instance | 协调实例 |
| Tool | Skill | Tool = Skill |
| Memory | `.eket/memory/` | 记忆存储 |

映射是**结构性的**，不是名义上的。OpenClaw 的 `Task`（`type=feature, priority=P1`）变成 EKET 的 `FEAT-001` ticket，`type` 与 `importance` 一致（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:139-155`）。`Workflow → Epic` 的映射由网关在 `POST /api/v1/workflow` 强制（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:106-117`）。

### 6.2 四阶段上线

桥接分四阶段发布（`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:90-275`）：

| 阶段 | 版本 | 增量 | 出处 |
|---|---|---|---|
| **阶段 1：API 网关** | v1.0.0 | REST API：`/api/v1/workflow`、`/api/v1/task`、`/api/v1/agent`、`/api/v1/memory`；协议翻译器 `openCLAWToEKET(task)` | `OPENCLAW-INTEGRATION-DESIGN.md:92-155` |
| **阶段 2：动态 agent 加载** | v1.1.0 | `scripts/openclaw-load-agent.sh`、`scripts/openclaw-exec.sh`、Agent Profile 模板 `.eket/profiles/openclaw_managed.yml` | `OPENCLAW-INTEGRATION-DESIGN.md:157-207` |
| **阶段 3：消息队列集成** | v1.2.0 | 双向 Redis Pub/Sub 通道：`openclaw:tasks:assign`、`openclaw:tasks:status`、`openclaw:agents:lifecycle` | `OPENCLAW-INTEGRATION-DESIGN.md:209-242` |
| **阶段 4：强化 Claude Code** | v1.3.0 | 多实例 Claude Code 团队（master + 4 类 Slavers：前端/后端/QA/Devops），由 OpenClaw 编排 | `OPENCLAW-INTEGRATION-DESIGN.md:243-285` |

**截至 2026 年中，阶段 1、2 已稳定；阶段 3、4 是正在落地的参考设计。** 部署前查一下桥接状态。

### 6.3 数据流——跨边界的内容

完整数据流在 `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:9-99`。9 步流：

| 步骤 | 方向 | 数据类型 | 协议 | 内容 |
|---|---|---|---|---|
| 1 | OpenClaw → Gateway | Workflow 创建 | HTTP/REST | `{name, description, priority, deadline}` |
| 2 | Gateway → Master | Epic 创建 | Internal event | Epic 元数据 |
| 3 | Master → Jira | Ticket 创建 | Git commit | Markdown ticket 文件 |
| 4 | Master → Redis | 任务发布 | Redis Pub/Sub | `{type: task_assignment, payload: {...}}` |
| 5 | Slaver → Redis | 任务领取 | Redis Pub/Sub | `{type: task_claimed, ticket_id: ...}` |
| 6 | Slaver → Code repo | 代码提交 | Git push | Feature branch + PR |
| 7 | Slaver → Redis | 状态更新 | Redis Pub/Sub | `{type: task_status_update, status: review}` |
| 8 | Master → Redis | Review 完成 | Redis Pub/Sub | `{type: task_status_update, status: done}` |
| 9 | Gateway → OpenClaw | Webhook | HTTP POST | Workflow 进度 |

（出处：`docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:86-96`）

**步骤 9 是集成者最该关注**——桥接**回调**到 OpenClaw 报状态（不是反过来）。回调 URL 在桥接配置（`.eket/config.yml`，`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:322-360`）里注册。

### 6.4 示例——OpenClaw 创建并派发任务

`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:387-410` 是规范工作例。压缩版：

```bash
# OpenClaw 创建并分配 Task。
curl -X POST http://eket.local:8080/api/v1/task \
  -H "Authorization: Bearer ${OPENCLAW_API_KEY}" \
  -d '{
    "workflow_id": "EPIC-001",
    "type": "feature",
    "title": "User login flow",
    "description": "Implement JWT-auth login",
    "priority": "P1",
    "assignee_role": "frontend_dev",
    "skills_required": ["react", "typescript"]
  }'

# 响应：
# {
#   "task_id": "FEAT-001",
#   "ticket_id": "FEAT-001",
#   "status": "ready",
#   "assigned_to": "agent_frontend_dev_001"
# }
```

一个前端 Slaver 探测到 `FEAT-001` 为 `ready`，通过 SDK 领取，桥接在 ticket 翻到 `done` 时回推回调（上面的步骤 9）。

### 6.5 为什么桥接对集成者重要

多数团队**感知不到**桥接——你对着 SDK / HTTP API 写，协议语义不变。桥接重要在以下场景：

- **换编排器**（n8n、Temporal、自家系统）想把 EKET 当执行层。
- **已经在用 OpenClaw** 想补上 EKET 的 audit 轨迹、角色门控、Saga 5 步。
- **写 dashboard** 想通过现有 OpenClaw 兼容的 UI 暴露 EKET 状态。

桥接也是**多框架协同**的家：`docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:248-274` 的 YAML 展示了一个 master + 4 类 Slavers（前端、后端、QA、Devops）挂在同一个 OpenClaw 编排器下。

---

## 7. Webhook 事件——发什么、怎么订阅

Webhook 是 EKET core 向**你注册的 URL** 发出的**出站** HTTP POST。实现在 `rust/crates/eket-core/src/webhook.rs:1-118`。两张表（`webhook.rs:3-5`）：

- `webhook_urls`——注册端点（URL + 密钥**静态加密**）
- `webhook_event_records`——投递日志，含重试状态

### 7.1 事件联合（8 个事件，snake_case）

`webhook.rs:24-40` 定义 `WebhookEvent` 枚举；线协议是 snake_case（`webhook.rs:25-40`）：

```rust
pub enum WebhookEvent {
    #[serde(rename = "task.created")]      TaskCreated,
    #[serde(rename = "task.claimed")]      TaskClaimed,
    #[serde(rename = "task.completed")]    TaskCompleted,
    #[serde(rename = "task.declined")]     TaskDeclined,
    #[serde(rename = "epic.completed")]    EpicCompleted,
    #[serde(rename = "slaver.registered")] SlaverRegistered,
    #[serde(rename = "slaver.offline")]    SlaverOffline,
}
```

这些是**集成事件**——与 `lib.rs:35-72` 里的 SSE `EventType` 是两套；SSE 是**进程内**广播，Webhook 是**出站 HTTP POST**。

### 7.2 订阅与投递

URL 通过 `WebhookStore::add_url(url, events, secret)`（`webhook.rs:379-411`）注册。签名：

```rust
pub fn add_url(
    &self,
    url: &str,
    events: &[String],    // 例如 ["task.created", "task.completed"] 或 ["*"]
    secret: Option<&str>, // HMAC 签名密钥
) -> Result<WebhookUrl>
```

入库前 store 会**校验 SSRF 风险**（`webhook.rs:282-324`）：必须是 `http`/`https`；**不能**指向 `localhost`；**不能**在 `127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`169.254.0.0/16`（云元数据）、`::1`。单测 `webhook.rs:1101-1140` 覆盖这些分支。

**投递尽力而为，带重试。** `retry_delay`（`webhook.rs:620-625`）算 `2^attempt` 分钟，封顶 `MAX_ATTEMPTS - 1`。**重试轮询 60 秒一次**（`webhook.rs:711-719`）：

```rust
pub fn start_retry_poller(store: Arc<WebhookStore>) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        loop {
            interval.tick().await;
            poll_due_retries(&store).await;
        }
    });
}
```

store 在 `lib.rs:499` 启动：`start_retry_poller(Arc::new(WebhookStore::new(pool.clone())));`——服务每次启动都会起一个重试 poller。

**失败只 warn，不 abort 调用方。** `webhook.rs:8` 明文："Fail → warn only, never abort caller." 这是一个审计级系统的正确设计——投递失败**不应该回滚状态转换**。

### 7.3 派发器

`webhook.rs:627-708` 是公开派发器。签名是 fire-and-forget：

```rust
pub async fn dispatch_event(
    pool: DbPool,
    event: WebhookEvent,
    payload: serde_json::Value,
)
```

它读注册的 URL，按事件名（或 `*`）过滤，为每条匹配 URL 在 `webhook_event_records` 里建一条记录，再为每次投递 spawn 一个 Tokio 任务。HTTP 客户端 30 秒超时（`webhook.rs:651-660`）。

### 7.4 从 SDK / HTTP 订阅

**JS SDK 和 Python SDK 目前都没有** `add_url` 的类型化封装（截至 2026 年中）。当前路径是：

1. 写一个 Rust 二进制调 `WebhookStore::add_url`，**或**
2. 直接插 `webhook_urls` 表，**或**
3. 等规划中的 `api/v1/webhooks` REST 路由（桥接设计里有，目前**未上线**）。

未来一篇文章（12-multi-tool-support）会讲 webhook 体验；目前**故意收窄**。

---

## 8. 自建集成——何时用 SDK、何时直接打 HTTP

四种面按**需要**组合，不是层级。下面是决策矩阵：

| 你在造… | 用… | 理由 |
|---|---|---|
| Node.js / TypeScript agent（与 EKET 服务同进程） | **JS SDK** | 自动重连、类型化错误、内建 WebSocket、零 HTTP 模板 |
| Python agent、数据流水线胶水、ML serving handler | **Python SDK** | 连接池、重试装饰器、`requests.Session`、type hints |
| Go / Java / Rust 跨服务调用（不能引 SDK 依赖） | **axum HTTP** | 一等公民 REST；与 SDK 同鉴权；`/health /ready /live` 给 k8s probe 留白名单 |
| Serverless 函数（Lambda、Cloud Functions）几秒超时 | **axum HTTP** | 冷启动友好；SDK 加的连接池单次请求根本用不上 |
| 外部编排器（n8n、Temporal、自家） | **OpenClaw 桥接** | 概念映射（Workflow/Task/Agent → Epic/Ticket/Slaver）已内置 |
| 订阅实时状态的 web dashboard | **HTTP + `/sse/events` 或 `/ws`** | 白名单免鉴权；浏览器直连无 token 负担 |
| CI runner `git push` 后报完成 | **HTTP `PATCH /api/v1/tasks/:id/status`** | 一发入魂，无需 SDK |
| 需要响应其他 agent 的 `task.claimed` | **SDK WebSocket** | 实时、自动重连、类型化消息处理 |
| 备份 / 灾备工具重放 audit 日志 | **直读 SQLite** | `tickets`、`task_checkpoints`、`webhook_event_records` 是事实源 |

### 8.1 三条经验法则

1. **能引依赖就引 SDK。** 两个 SDK 都不超过 50 KB 代码、无原生依赖，把鉴权 / 重试 / 错误类型的 80% 苦活都包了，省得自己重写。
2. **不能引依赖就用 HTTP API + `Authorization: Bearer <token>`。** 静态 token 路径在 `auth.rs:82-86`，是 shell 脚本最易接的鉴权方式。
3. **要跨框架就上 OpenClaw 桥接。** 不要在 SDK 之上**自己**撸一个编排器——桥接已有 1:1 概念映射、四阶段发布规划、Redis Pub/Sub 通道全定义。

### 8.2 "我就调一个端点"的反模式

一个常见错误是**一次 curl 的事硬上 SDK**。两个 SDK 都是**集成**，不是框架；为一次 HTTP 调用拖 50 KB 进来是浪费。鉴权模型一样，HTTP API 就是线。**选能让那发请求过去的最简面。**

### 8.3 "我自己撸客户端"的反模式

反面是**自己造 HTTP 客户端**。鉴权头格式一样、重试策略一样、错误类层级一样——而且它们会随协议版本变化。能用 SDK 就用，钉到 `1.0.0`，**有意识地**升级（见 §9）。

---

## 9. 版本策略（`sdk/VERSIONING.md`）——SDK 的 semver 政策

SDK 与 EKET node core 走**独立 semver 轨道**。政策在 `sdk/VERSIONING.md:1-82`；核心是 `VERSIONING.md:7-11` 的版本表：

```
node core:    2.x.x  (框架核心，独立演进)
EKET SDK:     1.x.x  (SDK，独立演进)
EKET Protocol: 1.x.x (协议规范，SDK 实现的标准)
```

两个 SDK 都钉在 `1.0.0`（JS：`sdk/javascript/src/index.ts:92`；Python：`sdk/python/eket_sdk/__init__.py:13`），并把 `__protocol_version__ = "1.0.0"` 显式标出（Python SDK 写在 `__init__.py:14`；JS SDK 在 `sdk/javascript/README.md:440-442`）。

### 9.1 三档 semver 规则（原文）

`VERSIONING.md:27-51` 定义升级规则：

**MAJOR（不兼容）：**"移除或重命名公开 API（方法、类、参数）；改动现有参数类型或返回类型；EKET Protocol major 升级。"示例：`1.x.x → 2.0.0`。

**MINOR（向后兼容新功能）：**"新增公开 API、方法、参数（可选）；新增对 EKET Protocol minor 新特性的支持；性能优化（接口不变）。"示例：`1.0.x → 1.1.0`。

**PATCH（向后兼容 bug fix）：**"Bug 修复，不影响公开接口；文档、注释修正；内部实现优化（接口不变）。"示例：`1.0.0 → 1.0.1`。

### 9.2 协议 / SDK 耦合

`VERSIONING.md:15-25` 定义 SDK 与协议的版本对应：

| SDK 版本 | EKET Protocol | 说明 |
|---|---|---|
| 1.0.0 | 1.0.0 | 初始稳定，完整 v1 协议支持 |
| 1.1.0 | 1.0.x | 新功能，向后兼容 |
| 2.0.0 | 2.0.0 | 协议 major 升级，破坏性 |

要点：**SDK minor 升不要求协议变；SDK major 升意味着协议 major 升。** 协议版本是 SDK **实现的规范**，SDK 版本是用户**依赖的版本**。

### 9.3 与 node core 解耦（原文）

`VERSIONING.md:55-61` 明文：

> - node core（`node/`）版本 `2.x.x`，按框架自己的节奏演进
> - SDK（`sdk/python/`、`sdk/javascript/`）版本 `1.x.x`，按协议的节奏演进
> - 两者**互不依赖版本号**，可独立发布
> - SDK 通过 HTTP / WebSocket 与 EKET Gateway 通信，不依赖 node core 代码

这就是 `eket-cli` 升到 `2.6.0` 不需要 SDK 跟着发版，反之亦然。

### 9.4 发布 tag 规范（原文）

`VERSIONING.md:65-70`：

```
sdk-python-v1.0.0    # Python SDK 发布 tag
sdk-js-v1.0.0        # JavaScript SDK 发布 tag
v2.6.0               # node core 发布 tag（不影响 SDK）
```

### 9.5 当前版本矩阵（原文）

`VERSIONING.md:76-82`：

| 组件 | 版本 | 状态 |
|---|---|---|
| Python SDK | 1.0.0 | 稳定 |
| JavaScript SDK | 1.0.0 | 稳定 |
| EKET Protocol | 1.0.0 | 稳定 |
| node core | 2.x.x | 独立演进 |

### 9.6 集成者的实操建议

- **钉到 `1.0.0`（或最新 `1.x`），有意识地升级。** 每个 `1.x.y` 都保证不破坏你的代码；升前看 CHANGELOG。
- **盯协议版本，不只是 SDK 版本。** 协议 major 升会触发 SDK major 升；上游信号是 `docs/protocol/EKET_PROTOCOL_V1.md` 的 release notes。
- **两个 SDK 都引入时，可能跑在不同的 patch 版本上。** 这是正常的——协议是契约，SDK 是 binding。

---

## 10. 参考

- **SDK 源码：**
  - `sdk/javascript/src/index.ts:1-93`——公开导出，`VERSION = '1.0.0'`
  - `sdk/javascript/src/client.ts:64-110`——`EketClient` 类 + `EketClientConfig`
  - `sdk/javascript/src/types.ts:1-9.9K`——TypeScript 类型
  - `sdk/javascript/src/errors.ts:1-3.5K`——错误类层级
  - `sdk/javascript/README.md:38-114`——Quick Start + WebSocket
  - `sdk/javascript/README.md:135-307`——完整 API 参考
  - `sdk/python/eket_sdk/__init__.py:1-55`——`__version__ = "1.0.0"`，公开导出
  - `sdk/python/eket_sdk/client.py:48-202`——`EketClient` 类 + `register_agent`
  - `sdk/python/eket_sdk/client.py:174-202`——`register_agent` 方法
  - `sdk/python/eket_sdk/exceptions.py:1-2.2K`——错误类层级
  - `sdk/python/README.md:46-120`——Quick Start + 上下文管理器
- **版本策略：**
  - `sdk/VERSIONING.md:1-82`——完整政策、semver 三档、解耦轨道
  - `sdk/VERSIONING.md:5-11`——版本映射（node core / SDK / protocol）
  - `sdk/VERSIONING.md:27-51`——MAJOR / MINOR / PATCH 规则
  - `sdk/VERSIONING.md:76-82`——当前版本矩阵
- **axum 服务：**
  - `rust/crates/eket-server/src/lib.rs:1-538`——服务端模块
  - `rust/crates/eket-server/src/lib.rs:35-72`——`EventType` 枚举
  - `rust/crates/eket-server/src/lib.rs:461-492`——`build_router`（完整路由表）
  - `rust/crates/eket-server/src/lib.rs:496-537`——`start()`（端口、环境、JWT 密钥检查）
  - `rust/crates/eket-server/src/lib.rs:511-521`——JWT 密钥 ≥32 字符强制
  - `rust/crates/eket-server/src/main.rs:1-42`——二进制入口，`EKET_SERVER_PORT` 环境变量
  - `rust/crates/eket-core/src/config.rs:49`——`api_port` 默认 9877
  - `rust/crates/eket-server/src/auth.rs:1-93`——`AuthConfig` + `auth_middleware`
  - `rust/crates/eket-server/src/auth.rs:16-20`——`Claims`（无 scope，只有 `sub` + `exp`）
  - `rust/crates/eket-server/src/auth.rs:40`——白名单（`/health /ready /live /sse/events`）
  - `rust/crates/eket-server/src/hooks.rs:1-80`——Claude Code hook 端点
  - `rust/crates/eket-server/src/ws.rs:1-2.3K`——WebSocket handler
- **Webhook：**
  - `rust/crates/eket-core/src/webhook.rs:1-118`——模块头 + 事件枚举
  - `rust/crates/eket-core/src/webhook.rs:24-67`——`WebhookEvent` 联合 + as_str + parse_event
  - `rust/crates/eket-core/src/webhook.rs:117-150`——`ensure_webhook_tables`
  - `rust/crates/eket-core/src/webhook.rs:282-324`——SSRF URL 校验
  - `rust/crates/eket-core/src/webhook.rs:379-411`——`add_url`
  - `rust/crates/eket-core/src/webhook.rs:620-625`——`retry_delay`（2^attempt 分钟）
  - `rust/crates/eket-core/src/webhook.rs:627-708`——`dispatch_event`（fire-and-forget）
  - `rust/crates/eket-core/src/webhook.rs:711-719`——`start_retry_poller`（60 秒 tick）
- **OpenClaw 桥接：**
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:1-517`——9 节设计
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:18-30`——概念映射表
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:90-117`——阶段 1 API 网关
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:139-155`——`openCLAWToEKET` 翻译器
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:157-207`——阶段 2 动态 agent 加载
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:209-242`——阶段 3 消息队列
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:243-285`——阶段 4 强化 Claude Code
  - `docs/architecture/OPENCLAW-INTEGRATION-DESIGN.md:366-410`——工作例（创建 + 分配）
  - `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:1-777`——6 节数据流
  - `docs/architecture/OPENCLAW-DATAFLOW-DESIGN.md:9-99`——9 步端到端数据流
- **状态机（背景）：**
  - `docs/articles/06-master-slaver-protocol/en/article.md:1-535`——本文对接的协议
- **术语表：** `docs/articles/GLOSSARY.md:1-43`
- **索引：** `docs/articles/INDEX.md:1-70`
- **系列下一篇：** [`12-multi-tool-support`](../../12-multi-tool-support/zh-CN/article.md)——"SDK 即多工具桥"的故事
