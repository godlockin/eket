# TASK-202: MultiProvider — 角色级模型路由

**状态**: dropped

**优先级**: P2
**类型**: Feature
**模块**: node/src/models/provider.ts
**来源**: openai-agents-python借鉴研究（ModelProvider接口）
**工作量**: 2天

## 背景

EKET单一绑定OPENCLAW_API_KEY，Master/Slaver/Reviewer用同一模型，成本无差异。
openai-agents的ModelProvider接口支持运行时切换，按角色分配不同模型可降低30-50%成本。

## 需求

实现 `ModelProvider` 接口 + `AgentModelConfig` 按角色路由。

## 验收标准

- [x] 定义 `ModelProvider` 接口：`modelForRole(role) => AgentModelConfig | null`
- [x] `BuiltinModelProvider`：内置 master→opus / slaver→sonnet / reviewer→haiku 映射
- [x] `EnvModelProvider`：读取 `EKET_MASTER_MODEL`、`EKET_SLAVER_MODEL`、`EKET_REVIEWER_MODEL`、`EKET_DEFAULT_MODEL`
- [x] `FallbackModelProvider`：provider链，第一个非null结果获胜
- [x] `AgentModelConfig`：`{ model, provider, maxTokens, temperature }`
- [x] 环境变量：`EKET_MASTER_MODEL`、`EKET_SLAVER_MODEL`、`EKET_REVIEWER_MODEL`（均有默认值）
- [x] `createModelConfig()` factory读取env路由
- [x] 集成到现有claude-runner.ts，新增 `role?` 字段通过角色选择model
- [x] 测试：19个测试全部通过（role routing, fallback chain, env override）

## 实现

- `node/src/core/model-provider.ts` — ModelProvider接口 + 3个实现 + factory
- `node/src/core/claude-runner.ts` — 新增 `role?` 参数，priority: explicit tier > role config > profile
- `node/tests/core/model-provider.test.ts` — 19 tests, all pass

**完成时间**: 2026-04-26
