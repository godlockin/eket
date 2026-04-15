# TASK-039: Layer 2 — 进度上报模板内嵌 mini-rules

**Ticket ID**: TASK-039
**Epic**: RULE-RETENTION
**标题**: 在进度上报消息模板中内嵌 Slaver Hard Rules 自检 checklist
**类型**: feature
**优先级**: P2
**重要性**: medium

**状态**: ready
**创建时间**: 2026-04-15
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: [TASK-041]
- blocked_by: [TASK-037]

**标签**: `message-queue`, `typescript`, `layer2`

---

## 1. 需求概述

### 1.1 功能描述

作为 EKET 框架维护者，我需要在 Slaver 每次发送 `progress_report` 消息时，消息体自动携带 5 条核心 Hard Rules 作为自检 checklist，以便在 agent 上下文中周期性锚定关键规则，减少因规则遗忘导致的错误行为。

### 1.2 验收标准

- [ ] 新建 `node/src/core/slaver-rules.ts`，包含 `SLAVER_HARD_RULES` 常量（5条）
- [ ] `ProgressReport` 接口新增 `selfCheck` 字段
- [ ] `buildProgressReport()` 自动注入 `selfCheck`（所有规则默认 passed: true）
- [ ] `passed: false` 时 `note` 字段必填（schema 验证拒绝空 note）
- [ ] 新增 2 个单元测试：规则完整性 + 违规 note 必填验证
- [ ] 验收命令：
  ```bash
  grep -c 'SLAVER_HARD_RULES\|selfCheck' node/src/core/slaver-rules.ts node/src/types/index.ts
  cd node && npm test -- --testPathPattern=slaver-rules 2>&1 | tail -5
  cd node && npm test 2>&1 | tail -3
  ```

---

## 2. 技术设计

### 2.1 影响文件

- `node/src/core/slaver-rules.ts` — 新建，规则常量
- `node/src/types/index.ts` — 扩展 `ProgressReport` 接口，新增 `SelfCheckItem` 类型
- `node/src/core/message-queue.ts` — `buildProgressReport()` 注入逻辑
- `node/tests/core/slaver-rules.test.ts` — 新建测试文件

### 2.2 规则常量

```typescript
// node/src/core/slaver-rules.ts
export interface SlaverHardRule {
  id: string;
  desc: string;
}

export const SLAVER_HARD_RULES: SlaverHardRule[] = [
  { id: 'SR-01', desc: '不得修改验收标准/优先级/依赖关系' },
  { id: 'SR-02', desc: '不得审查自己的 PR' },
  { id: 'SR-03', desc: '连续读5+文件无代码产出 → 立即写或报 BLOCKED' },
  { id: 'SR-04', desc: '架构类变更必须上报 Master，禁止自行决定' },
  { id: 'SR-05', desc: 'PR 必须包含真实命令输出，不得仅描述或截图' },
];
```

### 2.3 类型扩展

```typescript
// types/index.ts 新增
interface SelfCheckItem {
  ruleId: string;
  description: string;
  passed: boolean;
  note?: string;  // passed: false 时必填
}

// 扩展 ProgressReport（若该接口已存在）
interface ProgressReport {
  // ... existing fields ...
  selfCheck: {
    rules: SlaverHardRule[];
    checklist: SelfCheckItem[];
    analysisParalysisFlag: boolean;
  };
}
```

### 2.4 注入逻辑

```typescript
// message-queue.ts 修改 buildProgressReport()
import { SLAVER_HARD_RULES } from './slaver-rules.js';

function buildProgressReport(params: ReportParams): ProgressReport {
  return {
    ...params,
    selfCheck: {
      rules: SLAVER_HARD_RULES,
      checklist: SLAVER_HARD_RULES.map(rule => ({
        ruleId: rule.id,
        description: rule.desc,
        passed: true,
        note: undefined,
      })),
      analysisParalysisFlag: false,
    },
  };
}
```

> ⚠️ 注意：先确认 `shared/message_queue/` 实际结构及 `buildProgressReport` 是否存在。如不存在，改为在 shared/ 下的对应模板文件中追加 selfCheck 区块格式说明。

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 6h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-15 | backlog → ready | Master | 初始创建，blocked_by TASK-037 |
