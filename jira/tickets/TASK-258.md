# TASK-258: 实现 EKET MCP Server — AI Agent 原生集成

## 元数据
- **类型**: feature
- **优先级**: P1
- **状态**: todo
- **预估**: 8-11d
- **expertise**: backend,node
- **来源**: TASK-257 MCP 调研结论（2026-05-05）
- **参考**: `confluence/requirements/RESEARCH-MCP-DOCUSEAL.md`

## 背景

TASK-257 调研结论：EKET 实现 MCP Server 改造成本低、价值高。

现有 `eket server`（`node/src/api/eket-server.ts`，Express + HTTP）已有完整路由体系和 SSE bus，可直接扩展 `/mcp` 路由实现 MCP HTTP/SSE Transport，无需引入新的运行时。

**核心价值**：Claude Code Agent 通过 MCP 直接调用 `task:claim`/`task:complete`，消除当前「Agent 需要手动运行 CLI」的摩擦，是 EKET「AI 原生协作框架」定位的核心能力。

## 需求

### 1. MCP Transport 路由

```
POST /mcp        — 接收 JSON-RPC 2.0 请求（tools/list, tools/call）
GET  /mcp/sse    — SSE 流，服务端推送通知（MCP 2025-11-25 spec）
```

认证：`Authorization: Bearer <token>`（复用现有 JWT 中间件）

### 2. 首批暴露的 MCP Tools

| Tool | 对应命令 | 输入 schema |
|------|---------|------------|
| `task_create` | `eket task:create` | title, type, priority, expertise, blocked_by[] |
| `task_claim` | `eket task:claim` | ticket_id? |
| `task_complete` | `eket task:complete` | ticket_id |
| `task_list` | `eket task:progress` | status?, role? |
| `knowledge_search` | `eket knowledge:search` | query |

### 3. 实现文件

```
node/src/api/routes/mcp-routes.ts      ← 新建：/mcp POST + /mcp/sse GET
node/src/api/mcp/dispatcher.ts         ← 新建：JSON-RPC 2.0 dispatch
node/src/api/mcp/tools/                ← 新建：各 tool handler
  ├── task-create.ts
  ├── task-claim.ts
  ├── task-complete.ts
  ├── task-list.ts
  └── knowledge-search.ts
node/src/api/eket-server.ts            ← 修改：挂载 mcp-routes
```

### 4. Claude Code 集成配置

实现完成后，用户只需在 `~/.claude/settings.json` 添加：

```json
{
  "mcpServers": {
    "eket": {
      "url": "http://localhost:9877/mcp",
      "transport": "http"
    }
  }
}
```

### 5. 文档

更新 `~/.claude/skills/eket/SKILL.md`，新增 MCP 配置说明和 tool 列表。

## 验收标准

- [ ] `GET /mcp/sse` 返回合法 SSE 流，连接后不立即断开
- [ ] `POST /mcp` body `{"method":"tools/list"}` 返回 5 个 tool schema
- [ ] `POST /mcp` body `{"method":"tools/call","params":{"name":"task_list"}}` 返回当前 ticket 列表
- [ ] Claude Code 通过 MCP 配置后可直接调用 `task_claim`，效果等同 CLI
- [ ] Bearer Token 认证：无 token 返回 401，错误 token 返回 403
- [ ] `npm test` 新增 MCP routes 的集成测试全绿
- [ ] SKILL.md 已更新 MCP 配置说明

## 依赖

- 依赖 TASK-255（source 枚举）：MCP 调用创建的 ticket source 应为 `mcp`
- 不依赖 TASK-254（webhook）：可并行开发
