# MCP 集成调研报告 — DocuSeal × EKET

**调研日期**：2026-05-05  
**调研人**：Architecture Slaver（TASK-257）  
**状态**：DONE

---

## 执行摘要

DocuSeal 自 v2.3.7（2026-03-09）起已有官方 MCP Server，支持 AI Agent 通过 `send_documents` 工具发起签署请求，并在 v2.5.0 新增字段预填（prefill）能力，OAuth 2.1/PKCE 授权 PR 正在合并中。EKET 作为 MCP Server 的价值高、改造路径清晰（现有 Express HTTP Server 可直接扩展 `/mcp` 路由），建议立即创建 TASK-258；EKET 调用 DocuSeal MCP 作为外部 action 的价值相对有限（EKET 当前无「人工签署确认」场景），建议 TASK-259 列入 backlog 待场景成熟再实施。

---

## Q1：DocuSeal MCP Server 现状

### 1.1 官方 MCP Server 已存在

| 版本 | 日期 | MCP 相关变更 |
|------|------|------------|
| v2.3.7 | 2026-03-09 | 首次引入 MCP Server：「Create, send, and manage eSignatures with AI agents via MCP or Agent Skills」|
| v2.5.0 | 2026-04-20 | 「Prefill document fields with MCP」—新增字段预填能力 |
| v2.5.1 | 2026-04-27 | AI field detection 增强，支持 custom fields |

**结论**：DocuSeal 已有**官方** MCP Server（非社区维护），随主仓库发布。

### 1.2 GitHub Issues / PR 活跃度

| 编号 | 类型 | 标题 | 状态 | 日期 |
|------|------|------|------|------|
| #614 | Issue | Feature request: add fill/sign submission operations to MCP server | Open | 2026-03-18 |
| #630 | Issue | Support OAuth 2.1 on MCP server endpoint (for Claude.ai Team/Enterprise) | **Closed/Done** | 2026-04-18 |
| #633 | PR | Add OAuth 2.1 + PKCE + DCR authorization to MCP endpoint | Open (in review) | 2026-04-20 |
| #635 | PR | feat(mcp): accept field-fill params on send_documents tool | Open (in review) | 2026-04-22 |

### 1.3 已知 MCP Tools

根据发布日志和 PR 内容推断（API 文档 503，无法直接确认完整列表）：

| Tool 名称 | 功能 | 状态 |
|-----------|------|------|
| `send_documents` | 创建签署请求（指定模板+收件人） | ✅ 已发布 |
| `send_documents` (with prefill) | 创建时预填字段值 | ✅ v2.5.0+ |
| fill/sign 操作 | 填写并签署（Issue #614） | 🔄 计划中 |

### 1.4 认证机制

- 当前（v2.5.0）：推测为 API Token（Bearer Header），与 REST API 一致
- 进行中（PR #633）：OAuth 2.1 + PKCE + DCR，完成后可接入 Claude.ai Team/Enterprise 官方连接器
- MCP transport：HTTP/SSE（符合 MCP 2025-11-25 spec）

### 1.5 社区 MCP Server

GitHub 搜索 `docuseal mcp`（429 限流，无法列出完整列表），但从官方 release 来看已内置，无需依赖社区实现。

---

## Q2：EKET 作为 MCP 调用方可行性

### 2.1 EKET 是否有「外部审批」场景？

分析 `node/src/commands/complete.ts`，`task:complete` 流程包含：
1. 读取 ticket + 验证 schema
2. 合并 worktree → PR
3. 发布 `task_completed` SSE 事件
4. Master review（人工）

**当前无自动化文档签署场景**。EKET 的「审批」是 Master Review（由人工在 ticket 中填写），不是法律文件签署。

### 2.2 DocuSeal REST API 调用成本估算

基于文档结构推断（API 文档 503）：

| 指标 | 估算 |
|------|------|
| 创建 submission 端点 | `POST /api/submissions` |
| 关键参数 | `template_id`, `submitters[]`（email, role, fields） |
| 延迟 P50 | ~200–500ms（标准 REST，文档生成同步） |
| 配额 | 按计划收费，无公开 rate limit |
| 认证 | `X-Auth-Token: <api_key>` |

### 2.3 建议插入点

若未来 EKET 需要「合同化 PR 审批」（例：大型架构变更需签字确认），建议在：

```
task:complete Saga
  Step 1: validate ticket schema          ← 现有
  Step 2: merge worktree                  ← 现有
  [Step 2.5: 若 ticket.requires_signature=true]
    → POST DocuSeal /api/submissions      ← 新增
    → 等待 webhook 回调确认签署完成
  Step 3: publish task_completed SSE      ← 现有
```

**但当前场景不存在，不建议现在实施**。

### 2.4 结论

EKET 调用 DocuSeal MCP 作为外部 action 的**价值有限**：
- 无已知触发场景（EKET 是内部工程师协作工具，非合同管理平台）
- 引入异步等待（签署可能需数小时）会破坏现有 Saga 同步完成模型
- 需要额外 webhook 接收基础设施

---

## Q3：EKET 作为 MCP Server 价值评估

### 3.1 暴露为 MCP Tools 的价值

| Tool | 使用场景 | 价值评级 |
|------|---------|---------|
| `task_create` | 外部 Claude Agent 直接在 EKET 创建任务 | ⭐⭐⭐⭐ 高 |
| `task_claim` | Agent 领取并开始执行任务 | ⭐⭐⭐⭐⭐ 极高 |
| `task_complete` | Agent 完成任务并触发 Saga | ⭐⭐⭐⭐⭐ 极高 |
| `task_list` | 查询 backlog/in-progress | ⭐⭐⭐ 中 |
| `task_update` | 更新 ticket 内容 | ⭐⭐⭐ 中 |
| `knowledge_search` | 检索经验知识库 | ⭐⭐⭐⭐ 高 |

**核心价值**：使 Claude Code 可以直接通过 MCP 调用 `eket task:claim` 和 `eket task:complete`，消除当前「Agent 需要手动运行 CLI」的摩擦。

### 3.2 改造成本评估

现有 `eket server`（`node/src/api/eket-server.ts`）基于 **Express + HTTP**，已有路由体系（`/api/tasks`, `/api/agents`），SSE bus（`sse-event-bus`），WebSocket 支持。

**MCP HTTP/SSE Transport** 要求：
- `POST /mcp` 接收 JSON-RPC 2.0 请求
- `GET /mcp/sse` 返回 SSE 流（服务端推送通知）
- 工具列表通过 `tools/list` method 返回
- 工具调用通过 `tools/call` method 处理

| 改造项 | 工作量 | 说明 |
|--------|--------|------|
| 新增 `/mcp` 路由模块 | S（1-2d） | Express 新增 router |
| JSON-RPC 2.0 dispatch 层 | S（1d） | 解析 method + params |
| `tools/list` handler | XS（0.5d） | 返回静态 tool schema |
| `tools/call` → 调用现有命令 | M（3-4d） | 复用 commands/*.ts 逻辑 |
| SSE transport（`/mcp/sse`） | M（2-3d） | 复用现有 SSE bus |
| 认证（Bearer Token） | XS（0.5d） | 复用现有 JWT 中间件 |
| **总计** | **~8-11d** | 1 位 backend slaver |

### 3.3 与 Claude Code 集成路径

Claude Code 支持 MCP Server 配置（`~/.claude/settings.json` 的 `mcpServers`）：

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

无需额外 transport 层。Claude Code 原生支持 HTTP transport（MCP 2024-11-05+ spec）。

**改造后效果**：Claude Code Agent 可直接通过工具调用操作 EKET，而不需要 CLI 或 bash 命令，大幅降低 Agent 使用摩擦。

---

## Q4：竞争情报

### 4.1 文档签署产品 MCP 集成现状

| 产品 | MCP 支持 | 集成方式 | 备注 |
|------|---------|---------|------|
| **DocuSeal** | ✅ 官方，v2.3.7+ | 内置 MCP Server（HTTP/SSE） | 最早 2026-03 发布；OAuth 2.1 PR 在合并中 |
| **PandaDoc** | ❓ 未知 | GitHub 搜索 429 限流无法确认 | 官网无公开 MCP 文档 |
| **HelloSign/Dropbox Sign** | ❓ 未知 | GitHub 搜索 429 限流无法确认 | Dropbox 收购后产品线整合中 |
| **Adobe Sign** | ❓ 未知 | 企业级，可能有 REST API 封装 | 无公开 MCP 集成信息 |

**判断**：DocuSeal 是目前明确支持 MCP 的**首家**（或极少数）文档签署产品，具有先发优势。

### 4.2 AI Agent + 文档工作流市场趋势

1. **MCP 快速普及**（2026 Q1-Q2）：Claude.ai Team/Enterprise 支持 custom MCP connectors，推动 SaaS 产品加速接入
2. **DocuSeal 的 `source: mcp` 字段**：说明签署请求来源已成为可追踪维度，审计合规需求驱动
3. **Agent-initiated workflows**：合同生命周期管理（CLM）是 AI Agent 的高价值用例，文档签署是其中关键步骤
4. **EKET 的定位机会**：EKET 作为 AI Agent 协作框架，若率先支持 MCP Server，可成为其他 AI 系统（Claude、GPT）直接集成的工作流引擎

### 4.3 DocuSeal AI 功能路线图（近期 releases）

- v2.3.7: MCP Server 首发
- v2.4.0: 动态文档（DOCX → 可编辑变量）
- v2.5.0: MCP 字段预填 + AI 字段检测增强
- v2.5.1: AI field detection 自定义字段支持

**趋势**：DocuSeal 正快速向「AI-native 文档签署平台」演进，每个版本都有 AI/MCP 相关改进。

---

## 结论与建议

### TASK-258：实现 EKET MCP Server

**建议：✅ 创建，优先级 P1**

**理由**：
1. EKET 现有 Express HTTP Server 改造成本低（~8-11d），可复用现有路由 + SSE 基础设施
2. MCP 工具化后，Claude Code Agent 可直接调用 `task:claim`/`task:complete`，消除 CLI 摩擦，是 EKET 「AI 原生协作框架」定位的核心能力
3. MCP 已成为 Claude.ai Enterprise 的标准连接协议，不接入意味着错过生态窗口期
4. DocuSeal 已在 2026-03 实现，EKET 作为 Agent 框架理应更早支持

**实现建议**：
- 新增 `node/src/api/routes/mcp-routes.ts`
- 暴露首批 tools：`task_create`, `task_claim`, `task_complete`, `task_list`, `knowledge_search`
- 认证：Bearer Token（复用现有 JWT）
- Transport：HTTP + SSE（符合 MCP 2025-11-25 spec）

---

### TASK-259：EKET 集成 DocuSeal MCP 作为外部 action

**建议：⏸ 暂不创建，列入 backlog**

**理由**：
1. EKET 当前无「文档签署」触发场景：`task:complete` Saga 是工程交付流程，无合同/审批需求
2. 引入异步等待（签署确认 webhook）会破坏现有同步 Saga 模型，改造成本高
3. 场景不明确时集成属于过度设计（违反 DRY + YAGNI）
4. **等待条件**：当 EKET 有「架构变更需签字确认」或「外部合同审批」真实需求时再立即创建

**保留动作**：在 `confluence/memory/` 记录 DocuSeal API 签名和集成方案草稿，供未来快速启动。

---

## 附录：调研来源

| 来源 | URL | 状态 |
|------|-----|------|
| DocuSeal GitHub Issues (MCP) | `github.com/docusealco/docuseal/issues?q=mcp` | ✅ 获取 |
| DocuSeal Releases | `github.com/docusealco/docuseal/releases` | ✅ 获取 |
| DocuSeal README | `github.com/docusealco/docuseal/blob/master/README.md` | ✅ 获取 |
| DocuSeal API Docs | `docuseal.com/docs/api` | ❌ 503 |
| GitHub search: docuseal+mcp | `github.com/search?q=docuseal+mcp` | ❌ 429 |
| GitHub search: pandadoc+mcp | `github.com/search?q=pandadoc+mcp` | ❌ 429 |
| MCP Specification | `modelcontextprotocol.io/specification` | ✅ 获取 |
| EKET 源码分析 | `node/src/commands/complete.ts`, `api/eket-server.ts` | ✅ 获取 |
