# Slaver 专项规则 — LLM Role

> 补充 SLAVER-RULES.md，LLM Slaver（大模型/Prompt/RAG/Agent）必须遵守。

## 核心原则
- Prompt 版本管理：所有生产 Prompt 版本控制，变更有 diff 记录
- 幻觉防控：关键事实必须有 grounding（RAG 检索或工具调用），不依赖模型记忆
- 成本意识：Token 用量监控，批量任务用异步 API，避免实时阻塞

## 工程规范
- Prompt 模板放 `node/src/prompts/` 或 `confluence/memory/prompts/`
- RAG 向量库更新需有增量更新机制，不每次全量重建
- Agent 工具调用必须有超时和 fallback

## 禁止行为
- 不在 Prompt 中硬编码业务数据（用变量注入）
- 不跳过输出格式校验直接使用 LLM 返回值
- 不在无人监控的情况下让 Agent 执行破坏性操作
