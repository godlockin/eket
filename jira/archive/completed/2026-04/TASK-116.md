# TASK-116: Ticket 完成验证 + RAG 引用（DeepTutor 借鉴）

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-095（RAG 已完成）、TASK-110b（ticket-reviewer 已完成）

## 背景

当前 Slaver 完成 ticket 后仅靠 `npm test` 验证。DeepTutor 的核心洞见：
完成前用 RAG 知识库交叉验证——检查架构一致性、代码规范、文档完整性，
并对每条验证结论给出引用来源（哪个 skill/memory 文件支持该判断）。

## 验收标准

- [x] 新增 `node/src/core/completion-validator.ts`，导出 `CompletionValidator` class；验证：`ls node/src/core/completion-validator.ts`
- [x] `validateCompletion(ticketId, changedFiles)` 查询 RAG 知识库，返回 `ValidationReport`；验证：`grep -n "validateCompletion" node/src/core/completion-validator.ts`
- [x] `ValidationReport` 包含：`passed: boolean`、`checks: ValidationCheck[]`（每条含 `source` 引用文件路径）；验证：`grep -n "ValidationReport" node/src/types/index.ts`
- [x] 检查维度：架构规范（来自 confluence/memory/）、代码风格（来自 skill 定义）、ticket 验收标准全覆盖；验证：`grep -n "confluence/memory" node/src/core/completion-validator.ts`
- [x] `complete.ts` 在 PR 创建前调用 validator，报告失败时写 inbox 并阻断；验证：`grep -n "CompletionValidator" node/src/commands/complete.ts`
- [x] ≥5 单元测试；验证：`npm test -- --testPathPattern=completion-validator 2>&1 | grep -E "PASS|FAIL"`
- [x] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
interface ValidationCheck {
  dimension: 'architecture' | 'code-style' | 'acceptance-criteria';
  passed: boolean;
  message: string;
  source: string;  // 引用文件路径，如 "confluence/memory/lessons/xxx.md:L42"
}

interface ValidationReport {
  passed: boolean;
  checks: ValidationCheck[];
  summary: string;
}

class CompletionValidator {
  async validateCompletion(ticketId: string, changedFiles: string[]): Promise<ValidationReport>
}
```

RAG 查询策略：
- 查询关键词：ticket 标题 + 修改文件名
- 匹配 confluence/memory/ 和 node/src/skills/**/*.json
- 每条 check 的 source 指向最相关的 memory/skill 文件
