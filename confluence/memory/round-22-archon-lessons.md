# Archon 借鉴 Round 22 — 经验教训

**归档日期**: 2026-04-19
**覆盖 Ticket**: TASK-070 ~ TASK-075（6张）
**来源项目**: https://github.com/coleam00/Archon

## 1. YAML DAG 引擎（TASK-070）

拓扑排序按层分组 + Promise.allSettled 是并行 DAG 执行的最简实现。
- when 表达式避免动态执行，手写解析器支持 $a.b.c == 'val' 格式足够用
- ctx 变量 map 在层间传递，下层节点通过 $nodeId.output 访问前层输出
- fresh_context 标记让执行引擎为该节点创建独立 session，避免上下文污染

## 2. Agent 模型路由（TASK-071）

按 ticket 标签路由模型，分类用 haiku、实现用 opus，可降低 30-50% 成本。
- 规则优先级：显式 model 字段 > tag 匹配 > 默认 sonnet
- getModelDisplayName() 做别名映射，避免业务代码硬编码模型版本号

## 3. SSE 事件体系（TASK-072）

SSE 比 WebSocket 轻量，适合单向推送；__dashboard__ 全局广播频道是关键设计。
- SSE 格式：data: JSON\n\n，必须双换行
- mock Response：{ write: jest.fn(), setHeader: jest.fn(), on: jest.fn() }
- res.on('close', unsubscribe) 自动清理断线客户端防内存泄漏
- heartbeat 定时器不应在模块加载时启动，在 subscribe 后才开始

## 4. DAG 可视化（TASK-073）

先做后端 API，前端 ReactFlow 留后续；ticket-dag-parser.ts 纯函数设计测试零依赖。
- GET /api/v1/tickets/dag 返回 { nodes, edges }
- 解析 blocked_by: [TASK-X, TASK-Y] 用正则匹配方括号内容

## 5. 3层 RAG 检索（TASK-074）

FTS5 upsert 必须先 DELETE 再 INSERT，FTS5 不支持 ON CONFLICT。
- hashEmbedding() 基于字符编码+bigram 生成 128 维向量，无外部依赖
- Strategy Pattern 使3层检索策略独立可测

## 6. trigger_rule + fresh_context（TASK-075）

向后兼容设计：缺省值等于原有行为，老 ticket 无需修改。
- canProceed() 默认 all_success 等同于原有语义
- blockedBy 为空时无论何种规则都返回 true
- all_done 规则适合"失败也要继续"的容错工作流

## 通用模式

| 模式 | 关键点 |
|------|--------|
| DAG 按层并行 | topologicalSort + Promise.allSettled |
| SSE 全局广播 | __dashboard__ 频道，publish 自动广播 |
| 纯函数解析器 | 独立模块，单元测试零依赖 |
| Strategy Pattern | interface SearchStrategy { search() } |
| 向后兼容默认值 | 缺省值=原有行为 |
| FTS5 upsert | DELETE 再 INSERT，不用 ON CONFLICT |
