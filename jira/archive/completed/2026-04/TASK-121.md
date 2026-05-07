# TASK-121: SlaveResult Schema 标准化（deer-flow 借鉴）

## 元数据
- **状态**: done
- **类型**: refactor
- **优先级**: P2
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: 无

## 背景

deer-flow 的子 agent 产出结构化 `SlaveResult`，lead agent 用 schema-aware 合并策略聚合结果。
EKET 的 Slaver 当前靠 ticket 文件中非结构化的「实现结果」章节汇报，Master 需人工读取。
标准化 `SlaveResult` 后，Master 可程序化地聚合多 Slaver 输出、检测冲突、自动汇总。

## 验收标准

- [ ] `node/src/types/index.ts` 新增 `SlaveResult` interface；验证：`grep -n "SlaveResult" node/src/types/index.ts`
- [ ] `complete.ts` 生成并写入 `.eket/results/<ticketId>.json` 格式的 SlaveResult；验证：`grep -n "SlaveResult" node/src/commands/complete.ts`
- [ ] 新增 `node/src/core/result-aggregator.ts`，`aggregate(ticketIds[])` 合并多个 SlaveResult，检测文件冲突（同一文件被多个 Slaver 修改）；验证：`ls node/src/core/result-aggregator.ts`
- [ ] Master heartbeat 调用 `aggregate()` 并在 inbox 汇报冲突；验证：`grep -n "aggregate" node/src/commands/master-heartbeat.ts`
- [ ] ≥5 单元测试：结果序列化、冲突检测、无冲突合并、空结果列表处理；验证：`npm test -- --testPathPattern=result-aggregator 2>&1 | grep -E "PASS|FAIL"`
- [ ] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
// node/src/types/index.ts
export interface SlaveResult {
  ticketId: string;
  slaverId: string;
  completedAt: number;
  prNumber?: number;
  prUrl?: string;
  filesChanged: string[];       // 修改的文件列表
  testsAdded: number;
  testsPassed: number;
  keyDecisions: string[];       // 2-3条关键决策
  deferredIssues: string[];     // 未处理的预存在问题
  skillFeedback?: SkillFeedback;
}

// node/src/core/result-aggregator.ts
export class ResultAggregator {
  aggregate(results: SlaveResult[]): AggregatedResult
  detectConflicts(results: SlaveResult[]): FileConflict[]
}
```

## 完成记录

- **PR**: feature/TASK-119-ultrareview-v2 → miao → https://github.com/godlockin/eket/pull/131
- **实现**: `SlaveResult`/`FileConflict`/`AggregatedResult` 接口加入 types/index.ts；`ResultAggregator` 新建；`complete.ts` 成功路径写入 `.eket/results/<ticketId>.json`
- **测试**: 7 个单元测试全通过 (result-aggregator.test.ts)
- **完成时间**: 2026-04-20
