# TASK-209: Execution Proof Anchor — 知识写入质量门控

**优先级**: P0
**类型**: Feature
**模块**: node/src/commands/knowledge.ts, SLAVER-RULES, confluence/memory/
**来源**: GenericAgent借鉴研究 — "无行动不记忆"公理落地
**工作量**: 1-2天

## 背景

EKET 的 `confluence/memory/` 写入目前无验证约束，Slaver 可写入未经测试的假设，污染知识库。
GenericAgent 证明：每条持久化记录必须绑定执行证明（exit_code=0 + task_id + timestamp），
才能从根本上防止幻觉污染知识库。

## 需求

为 EKET 知识写入引入 Execution Proof Anchor 机制：每条写入 confluence/memory/ 的技术结论
必须附带执行证明元数据，`knowledge:index` 命令在写入前校验字段完整性。

## 验收标准

- [x] 定义 `KnowledgeEntry` 接口（`node/src/types/index.ts` 或新文件）：
  ```typescript
  interface KnowledgeEntry {
    content: string;
    proof: {
      task_id: string;       // 来源 ticket
      exit_code: 0;          // 只允许 0（成功）
      timestamp: string;     // ISO 8601
      tool_name?: string;    // 产生结论的工具/命令
      ci_url?: string;       // 可选：CI 链接
    };
    tags?: string[];
  }
  ```
- [x] `knowledge:index` 命令新增 `--proof-required` flag（默认 true）
- [x] 写入时校验：`proof.exit_code === 0` + `task_id` 非空，否则 exit(1) + 结构化错误
- [x] 已有 markdown 文件（无 proof）：兼容读取，但 `--strict` 模式下拒绝追加
- [x] SLAVER-RULES.md 新增一节：「知识沉淀红线 — 凡写入 confluence/memory/ 必须附 execution proof」
- [x] 单元测试：valid proof 通过，缺 task_id 拒绝，exit_code≠0 拒绝

## 实现记录

**状态**: ✅ Done  
**完成时间**: 2026-04-26  
**实现者**: Slaver

### 变更文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `node/src/types/index.ts` | 新增 | `KnowledgeProof`, `KnowledgeIndexEntry`, `KnowledgeValidationError`, `KnowledgeValidationResult` 接口；`KnowledgeEntry` 增加可选 `proof` 字段 |
| `node/src/commands/knowledge-index.ts` | 修改 | 新增 `--proof-required`（默认 true）和 `--strict` flag；`validateKnowledgeProof()` + `hasProofMetadata()` 函数 |
| `node/tests/commands/knowledge-proof.test.ts` | 新增 | 15 个单元测试覆盖 valid/invalid proof 场景 |
| `template/docs/SLAVER-RULES.md` | 修改 | 新增第 12 节「知识沉淀红线 — Execution Proof 强制要求」 |

### 测试结果

```
Tests: 15 passed, 15 total
Time: 0.193s
```
