# TASK-110b: task:claim 前 Slaver 自主 review（完整性检查 + BLOCKED 上报）

## 元数据
- **状态**: todo
- **类型**: feature
- **优先级**: P1
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-105b（task:claim 已存在）

## 背景

Slaver 领取 ticket 后才发现需求不清，变成 BLOCKED 浪费执行周期。
在 claim 成功后、开始执行前，Slaver 自主 review ticket 完整性，
不通过则立即 BLOCKED 并通知 Master 补充，而非等到执行中途。

## 验收标准

1. `task:claim` 成功后自动触发完整性检查（不可跳过）
2. 检查项（Slaver 自主判断）：
   - 详细描述是否足够实现（< 30 字视为不足）
   - 验收标准是否存在且可验证（无验收标准则不足）
   - 依赖 ticket 是否都已完成（有未完成依赖则不足）
3. 不通过：
   - ticket 状态设为 blocked
   - 输出具体疑问列表
   - 写入 `inbox/human_feedback/blocked-<ticketId>-<slaverId>.md`
4. 通过：输出「✅ Ticket review passed，开始执行」，继续正常流程
5. `npm test` 全绿，新增 ≥ 4 单测

## 检查报告格式（写入 inbox）

```markdown
## Ticket Review 不通过 — <ticketId>
Slaver: <slaverId>
时间: <timestamp>

### 问题清单
- [ ] 详细描述不足：<具体说明>
- [ ] 验收标准缺失
- [ ] 依赖 TASK-XXX 未完成

### 建议补充
<Slaver 的具体建议>

Master 补充后请重新分配：node dist/index.js task:claim <ticketId>
```

## 实现步骤

1. 读取 `node/src/commands/claim.ts`，在 worktree 创建后、返回成功前插入 review 逻辑
2. 新建 `node/src/core/ticket-reviewer.ts`：`reviewTicket(ticketId): Promise<ReviewResult>`
3. ReviewResult：`{ passed: boolean; issues: string[]; suggestions: string[] }`
4. 不通过时：更新 ticket 状态为 blocked，写 inbox 文件，删除已创建的 worktree
5. 写单测（mock ticket 文件读取）
