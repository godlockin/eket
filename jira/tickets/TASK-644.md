# TASK-644: epic-run/epic-analyze 代码去重

**EPIC**: EPIC-017  
**状态**: done  
**优先级**: P1  
**预估**: 0.5d  
**依赖**: TASK-640, TASK-642  
**层级**: L2 Node.js  
**来源**: Adversarial Review (架构)

---

## 问题描述

`epic-run.ts` 第60-246行与 `epic-analyze.ts` 第30-312行存在大量重复逻辑（约200行）：
- `findEpicTickets()`
- `parseTicket()`
- `topologicalSort()`
- `dagToYaml()`

**违反 DRY 原则**，修改一处需要同步另一处。

## 验收标准

- [x] 提取共享函数到 `node/src/core/epic-utils.ts`
- [x] `epic-run.ts` 和 `epic-analyze.ts` 改为引用共享模块
- [x] 单元测试覆盖 epic-utils.ts
- [x] 无功能回归

## 重构方案

```typescript
// node/src/core/epic-utils.ts
export interface EpicTicket { ... }

export async function findEpicTickets(epicId: string): Promise<EpicTicket[]>;
export function parseTicketFile(filePath: string): EpicTicket;
export function topologicalSort(tickets: EpicTicket[]): EpicTicket[];
export function generateDagYaml(epicId: string, tickets: EpicTicket[]): string;
export function analyzeComplexity(tickets: EpicTicket[]): ComplexityReport;
```

---

## 变更日志

| 日期 | 变更 | 操作人 |
|------|------|--------|
| 2026-06-01 | 创建 ticket (架构 Review P1) | Master |
| 2026-06-01 | 完成重构: 提取200+行重复代码到epic-utils.ts, 25个单测全通过 | Slaver |
