# TASK-122: 自然语言 Ticket → 自动 DAG 依赖提取（MiroFish 借鉴）

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P3
- **负责人**: Slaver
- **PR**: https://github.com/godlockin/eket/pull/126
- **创建时间**: 2026-04-20
- **依赖**: TASK-110a（task:create 已完成）

## 背景

MiroFish 的知识图谱：从非结构化文本中提取实体和关系。借鉴到 EKET：
`task:create` 时，自动分析 ticket 描述，推断与已有 ticket 的依赖关系，
减少 Master 手动填写 `依赖: TASK-xxx` 的负担，防止遗漏隐性依赖。

## 验收标准

- [ ] 新增 `node/src/core/dependency-inferrer.ts`，`inferDependencies(ticketContent, existingTickets[])` → `string[]`（推断的依赖 ticket ID 列表）；验证：`ls node/src/core/dependency-inferrer.ts`
- [ ] 推断逻辑：匹配关键技术词（函数名、模块名、接口名）与已有 ticket 的验收标准和实现内容；验证：`grep -n "inferDependencies" node/src/core/dependency-inferrer.ts`
- [ ] `task:create` 流程中，写文件前调用 `inferDependencies`，将推断结果作为候选依赖展示给用户确认；验证：`grep -n "inferDependencies" node/src/commands/task-create.ts`
- [ ] 置信度过滤：相似度 < 0.6 的候选不展示；验证：`grep -n "confidence" node/src/core/dependency-inferrer.ts`
- [ ] ≥4 单元测试：命中依赖、无依赖、低置信度过滤、空 ticket 列表；验证：`npm test -- --testPathPattern=dependency-inferrer 2>&1 | grep -E "PASS|FAIL"`
- [ ] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
// node/src/core/dependency-inferrer.ts
export class DependencyInferrer {
  async inferDependencies(
    newTicketContent: string,
    existingTickets: { id: string; content: string }[]
  ): Promise<Array<{ ticketId: string; confidence: number; reason: string }>>
}
```

相似度计算：TF-IDF 或简单关键词重叠（无需向量模型）：
- 提取 newTicket 中的技术词（驼峰命名、文件名、函数名）
- 在每个 existingTicket 的验收标准中搜索
- 重叠词数 / 总技术词数 = 置信度

展示格式（task:create 引导时）：
```
[推断依赖]
- TASK-103b（置信度 0.82）：均涉及 SkillIndex / loadSkillIndex
- TASK-095（置信度 0.71）：均涉及 RAG / knowledge search
确认加入依赖？[Y/n/s(跳过)]
```
