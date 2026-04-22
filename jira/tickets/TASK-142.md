# TASK-142: Hook HTTP Server（pre-tool-use 等 5 个端点）

## 元数据
- **类型**: feature
- **优先级**: P0
- **状态**: ready
- **创建**: 2026-04-21
- **依赖**: 无

## 背景

Node.js `http-hook-server.ts` 暴露 5 个 webhook 端点，让 Master 可以观察 Slaver 的工具调用行为并做介入决策。这是 Master 监控 Slaver 的核心机制，Rust 中完全缺失。

## 验收标准

- [ ] `POST /hooks/pre-tool-use` — Slaver 调用工具前通知 Master
- [ ] `POST /hooks/post-tool-use` — 工具调用完成后通知
- [ ] `POST /hooks/teammate-idle` — Slaver 空闲通知
- [ ] `POST /hooks/task-completed` — 任务完成通知
- [ ] `POST /hooks/permission-request` — 权限申请（Master 审批）
- [ ] 响应体包含 `{ allow: bool, reason?: string }`
- [ ] Master 可注册自定义 hook handler（配置文件或 CLI flag）
- [ ] 超时处理：Slaver 等待 hook 响应最多 5s，超时默认放行

## 请求 Schema

```json
{
  "hook_type": "pre-tool-use",
  "agent_id": "slaver_rust_01",
  "ticket_id": "TASK-200",
  "tool_name": "bash",
  "tool_input": { "command": "rm -rf /" },
  "timestamp": "2026-04-21T10:00:00Z"
}
```

## 负责人
待认领（推荐：后端工程师 + Rust 工程师）
