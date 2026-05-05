# TASK-257: MCP 集成调研 — AI Agent 触发文档签署工作流

## 元数据
- **类型**: research / spike
- **优先级**: P3
- **状态**: todo
- **预估**: 2d（调研，无代码产出）
- **expertise**: architecture,backend
- **来源**: DocuSeal 借鉴研究（2026-05-05）
- **参考**: DocuSeal `source: mcp`，Model Context Protocol spec

## 背景

DocuSeal 的 `Submission#source` 枚举中已有 `mcp` 值，表明 DocuSeal 已把「文档签署」作为 MCP 工具对外暴露，AI Agent 可以直接调用创建签署流程。

这对 EKET 有两层意义：

1. **EKET 作为调用方**：EKET 的 Slaver 在执行任务时，如果任务涉及合同审批、文档签署（如 PR 审核文档化、架构决策记录需要签字确认），可以通过 MCP 调用 DocuSeal 完成文档闭环
2. **EKET 作为被调用方**：EKET 的 `task:create`、`task:claim` 等操作本身是否需要暴露为 MCP 工具，允许外部 AI Agent（如 Claude、GPT-4）直接操作 EKET 工作流

## 调研目标

### Q1：DocuSeal MCP Server 现状
- DocuSeal 是否已有官方 MCP Server？还是仅通过 REST API 集成？
- MCP tools 列表：支持哪些操作（创建签署请求、查询状态、获取签署链接）？
- 认证机制：MCP 调用如何传递 API Token？

### Q2：EKET 作为调用方的可行性
- EKET Slaver 执行 `task:complete` 时，是否有「需要外部审批」的场景？
- 如有，DocuSeal API 的调用成本（延迟、配额）是否在可接受范围？
- 集成点：在 `task_complete.rs` 的哪个 Saga Step 插入文档签署步骤？

### Q3：EKET 作为 MCP Server 的价值评估
- 将 `task:create`、`task:claim`、`task:complete` 暴露为 MCP tools 的价值有多大？
- 现有 `eket server`（axum :9877）扩展为 MCP-compatible 的改造成本？
- 与 Claude Code 工具调用的集成路径（是否需要额外 MCP transport 层）？

### Q4：竞争情报
- DocuSeal 的 AI 功能路线图（GitHub Issues / Releases / Blog）
- 其他文档签署类产品（PandaDoc、HelloSign）的 MCP 集成现状
- AI Agent + 文档工作流的市场趋势

## 产出物

- `confluence/requirements/RESEARCH-MCP-DOCUSEAL.md`：调研报告，含 Q1-Q4 回答
- 结论之一：**是否创建 TASK-258（实现 EKET MCP Server）**
- 结论之二：**是否创建 TASK-259（EKET 集成 DocuSeal MCP 作为外部 action）**

## 调研方法

```bash
# 1. 搜索 DocuSeal MCP 相关 Issues 和 PR
# https://github.com/docusealco/docuseal/issues?q=mcp

# 2. 查看 DocuSeal API 文档
# https://www.docuseal.com/docs/api

# 3. 搜索 MCP server 实现
# https://github.com/search?q=docuseal+mcp&type=repositories

# 4. 查阅 MCP 官方 spec
# https://modelcontextprotocol.io/specification
```

## 验收标准

- [ ] `confluence/requirements/RESEARCH-MCP-DOCUSEAL.md` 文件存在且 Q1-Q4 均有回答
- [ ] 明确给出「建议创建 / 暂不创建」TASK-258 和 TASK-259 的结论及理由
- [ ] 报告包含竞品 AI 集成现状对比表
- [ ] Master review 后决定是否立即进入实现阶段

## 依赖

无（纯调研，可立即开始）
