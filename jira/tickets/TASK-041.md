# TASK-041: 集成验收 — 三层防遗忘联动测试

**Ticket ID**: TASK-041
**Epic**: RULE-RETENTION
**标题**: 模拟长上下文 session，验证 hook 触发率 + mini-rules 存在性 + token 压缩率三层同时达标
**类型**: task
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-15
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: []
- blocked_by: [TASK-036, TASK-038, TASK-039, TASK-040]

**标签**: `integration-test`, `rule-retention`, `e2e`

---

## 1. 需求概述

### 1.1 功能描述

作为 EKET 框架维护者，我需要一个集成测试套件，同时验证三层防遗忘方案的核心指标，以便在单次测试运行中确认整体方案的有效性。

### 1.2 验收标准

- [ ] `npm test -- --testPathPattern=rule-retention` 0 failures
- [ ] Hook 触发率：进入 `pr_review` 状态的 mock transition 100% 触发 hook
- [ ] mini-rules 存在性：`buildProgressReport()` 输出包含 5 条 `SLAVER_HARD_RULES`
- [ ] CLAUDE.md token 压缩：`scripts/count-tokens.sh --compare` 输出压缩 > 0%
- [ ] 违规上报：合成违规场景后 `inbox/human_feedback/` 有对应文件
- [ ] 验收命令：
  ```bash
  cd node && npm test -- --testPathPattern=rule-retention 2>&1 | tail -10
  bash scripts/count-tokens.sh --compare
  cd node && npm test 2>&1 | tail -3  # 全量回归，确保 0 新增失败
  ```

---

## 2. 技术设计

### 2.1 影响文件

- `node/tests/integration/rule-retention.test.ts` — 新建集成测试

### 2.2 测试场景

```typescript
// rule-retention.test.ts
describe('Rule Retention — 三层防遗忘集成验收', () => {

  describe('Layer 3b: Hook 触发率', () => {
    it('pr_review transition 100% 触发 hook', async () => {
      const hookSpy = jest.fn().mockResolvedValue({ success: true, data: undefined });
      // mock runPrePrReviewHook
      // 调用 transitionStatus(id, 'ready', 'pr_review')
      // 验证 hookSpy 被调用
    });

    it('非 pr_review 状态不触发 hook', async () => {
      // transitionStatus(id, 'backlog', 'analysis')
      // hookSpy 未被调用
    });

    it('DRYRUN 模式不调用 shell，只记录日志', async () => {
      process.env.EKET_HOOK_DRYRUN = 'true';
      // 验证 execFile 未被调用
    });
  });

  describe('Layer 2: mini-rules 存在性', () => {
    it('buildProgressReport 包含 5 条 SLAVER_HARD_RULES', () => {
      const report = buildProgressReport({ ... });
      expect(report.selfCheck.rules).toHaveLength(5);
      expect(report.selfCheck.checklist).toHaveLength(5);
    });

    it('passed:false + note 空时抛出验证错误', () => {
      expect(() => validateProgressReport({
        ...report,
        selfCheck: { checklist: [{ passed: false, note: undefined }] }
      })).toThrow();
    });
  });

  describe('Layer 1: CLAUDE.md 精简验证', () => {
    it('MASTER-RULES.md 和 SLAVER-RULES.md 文件存在', () => {
      expect(fs.existsSync('template/docs/MASTER-RULES.md')).toBe(true);
      expect(fs.existsSync('template/docs/SLAVER-RULES.md')).toBe(true);
    });

    it('MASTER-RULES.md 包含 Anti-Hallucination 关键词', () => {
      const content = fs.readFileSync('template/docs/MASTER-RULES.md', 'utf8');
      expect(content).toContain('禁止伪造测试结果');
    });
  });

  describe('Layer 3b: 违规上报', () => {
    it('hook 失败时生成 violation 文件', async () => {
      // 触发一次 mock 违规
      // 验证 inbox/human_feedback/violation-*.md 文件存在
    });
  });
});
```

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 3h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-15 | backlog → ready | Master | 初始创建，blocked_by TASK-036/038/039/040 |
