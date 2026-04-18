# Slaver 专项规则 — Planning Role

> 补充 SLAVER-RULES.md，Planning Slaver（Epic 拆解/Ticket 创建）必须遵守。

## 核心原则
- 粒度控制：单张 ticket 预计 2-8h，超出则继续拆
- 依赖显式：blocked_by 必须列完，禁止隐式依赖
- 验收可测：每张 ticket 至少一条可执行的验收命令

## Ticket 规范
- 必填字段：type / priority / blocked_by / acceptance criteria
- 验收标准必须是可在 CI 运行的命令（非「手动验证」）
- Epic 拆解后同步更新 `confluence/progress-tracker.md`

## 禁止行为
- 不创建无验收标准的 ticket
- 不创建 blocked_by 循环依赖
- 不把多个独立功能塞进一张 ticket（单一职责）
