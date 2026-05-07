# TASK-112: Ticket Schema 强校验（claim 时验收标准非空）

## 元数据
- **状态**: done
- **PR**: https://github.com/godlockin/eket/pull/121
- **类型**: feature
- **优先级**: P2
- **负责人**: 待领取
- **创建时间**: 2026-04-20
- **依赖**: TASK-110b（ticket-reviewer 框架已完成）

## 背景

SLAVER-RULES 规定「禁止修改验收标准」，但当前 `task:claim` 并不校验 ticket 是否有验收标准。
若 Master 建卡时漏写验收标准，Slaver 领取后无法判断完成条件，导致交付质量不可控。
需在 `ticket-reviewer.ts`（TASK-110b 产物）扩展校验规则，将此约束升级为 harness 强制。

## 验收标准

- [ ] `ticket-reviewer.ts` 新增校验规则：
  - 验收标准章节（`## 验收标准` 或 `## Acceptance Criteria`）必须存在
  - 章节内容至少含 1 个非空行（不含标题本身）
  - 验收标准中至少有 1 个 `- [ ]` 或 `- [x]` 格式的检查项，或至少 50 字的文字描述
- [ ] `claim.ts` 调用 reviewer 时包含此规则（无需额外改动，复用 TASK-110b 流程）
- [ ] `task:create`（TASK-110a 产物）在写文件前同样调用此校验，若缺失则触发引导补全
- [ ] 单元测试：覆盖「有验收标准通过」「无验收标准拦截」「验收标准为空拦截」「仅有标题无内容拦截」
- [ ] `npm test` 无新增失败

## 实现要点

```typescript
// ticket-reviewer.ts 新增规则
function checkAcceptanceCriteria(content: string): CheckResult {
  const section = extractSection(content, ['验收标准', 'Acceptance Criteria']);
  if (!section) return { pass: false, issue: '缺少验收标准章节' };
  
  const hasChecklist = /- \[[ x]\]/.test(section);
  const hasDescription = section.replace(/^##.*$/m, '').trim().length >= 50;
  
  if (!hasChecklist && !hasDescription)
    return { pass: false, issue: '验收标准内容为空或不足' };
  
  return { pass: true };
}
```

## 技术说明

- 复用 TASK-110b 的 `ReviewResult` 接口，新增 `acceptanceCriteria` 字段
- `task:create` 集成：`checkCompleteness()` 函数中添加此校验，缺失时触发 Socratic 引导
- 不修改已有 ticket 文件，只在 claim/create 时拦截
