# TASK-119: Ultrareview 多 Agent 独立代码审查（claude-code-best-practice 借鉴）

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P2
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: 无

## 背景

当前 PR review 由 Master 单独审查，存在同一视角盲点。
claude-code-best-practice 的 Ultrareview：多个独立 reviewer agent 在隔离 sandbox 中并行审查，
汇总不同角度的发现（安全、性能、架构、测试覆盖率），最终 Master 汇总裁决。

## 验收标准

- [ ] 新增 `node/src/commands/ultrareview.ts`，`task:ultrareview <PR_NUMBER>` 命令；验证：`ls node/src/commands/ultrareview.ts`
- [ ] 并行启动 3 个独立 reviewer：security-reviewer、performance-reviewer、architecture-reviewer；验证：`grep -n "Promise.all" node/src/commands/ultrareview.ts`
- [ ] 每个 reviewer 在独立 git worktree 中运行（隔离读取，不互相干扰）；验证：`grep -n "WorktreeManager" node/src/commands/ultrareview.ts`
- [ ] 结果合并为 `UltrareviewReport`：总评分（0-100）+ 各 reviewer 发现 + 建议列表；验证：`grep -n "UltrareviewReport" node/src/types/index.ts`
- [ ] 报告写入 PR comment（`gh pr comment`）和 `.eket/reviews/<PR>.md`；验证：`grep -n "gh pr comment" node/src/commands/ultrareview.ts`
- [ ] `node/src/index.ts` 注册 `task:ultrareview` 命令；验证：`grep -n "ultrareview" node/src/index.ts`
- [ ] ≥4 单元测试（mock reviewer outputs）；验证：`npm test -- --testPathPattern=ultrareview 2>&1 | grep -E "PASS|FAIL"`
- [ ] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
// 3 个 reviewer 角色（从 skills/ 加载对应 skill）
const REVIEWERS = [
  { id: 'security-reviewer',     skill: 'security',     focus: '安全漏洞、权限、注入' },
  { id: 'performance-reviewer',  skill: 'performance',  focus: 'N+1 查询、内存泄漏、复杂度' },
  { id: 'architecture-reviewer', skill: 'architecture', focus: 'SRP 违反、循环依赖、过度设计' },
];

// 并行执行
const results = await Promise.all(
  REVIEWERS.map(r => runReviewerInWorktree(prNumber, r))
);

interface UltrareviewReport {
  prNumber: number;
  overallScore: number;        // 0-100
  reviewers: ReviewerResult[];
  topIssues: Issue[];          // 跨 reviewer 合并后最重要的问题
  recommendation: 'approve' | 'request-changes' | 'comment';
}
```
