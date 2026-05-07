# TASK-118: Skill Stacking + Task Envelope（oh-my-claudecode 借鉴）

## 元数据
- **状态**: done
- **类型**: feature
- **优先级**: P1
- **负责人**: Slaver
- **创建时间**: 2026-04-20
- **依赖**: TASK-103b（skill index loader 已完成）

## 背景

oh-my-claudecode 的核心设计：`[执行模式] + [0-N 增强] + [可选保证]` 的 Skill 组合公式。
EKET 当前每个 Slaver 只能激活单一 skill，无法声明式地组合多个能力。
引入：
1. **Skill Stacking**：ticket 声明需要的 skill 组合，Slaver 自动加载全部
2. **Task Envelope**：Master 派发任务时附带完整上下文（mode + required_skills + context_snapshot），跨 session 不丢失

## 验收标准

- [ ] `jira/tickets/*.md` 支持新字段 `required_skills: [skill-id-1, skill-id-2]`；验证：`grep -n "required_skills" jira/tickets/TASK-118.md`
- [ ] 新增 `node/src/core/skill-stacker.ts`，`loadStack(skillIds[])` 批量加载 skill 定义并合并为统一上下文；验证：`ls node/src/core/skill-stacker.ts`
- [ ] `claim.ts` 读取 ticket 的 `required_skills`，调用 `loadStack` 注入到 Slaver 上下文；验证：`grep -n "loadStack" node/src/commands/claim.ts`
- [ ] Task Envelope schema：`{ ticketId, mode, requiredSkills, contextSnapshot, dispatchedAt }`，序列化为 `.eket/envelopes/<ticketId>.json`；验证：`grep -n "TaskEnvelope" node/src/types/index.ts`
- [ ] Master 派发时写 envelope，Slaver claim 时读 envelope 恢复上下文；验证：`grep -n "envelope" node/src/commands/claim.ts`
- [ ] ≥5 单元测试；验证：`npm test -- --testPathPattern=skill-stacker 2>&1 | grep -E "PASS|FAIL"`
- [ ] `npm test` 无新增失败；验证：`cd node && npm test 2>&1 | tail -3`

## 实现要点

```typescript
// node/src/core/skill-stacker.ts
export class SkillStacker {
  async loadStack(skillIds: string[]): Promise<StackedContext>
  // StackedContext = merged triggers + merged constraints + merged tools
}

// node/src/types/index.ts
export interface TaskEnvelope {
  ticketId: string;
  mode: 'default' | 'ultrawork' | 'debug';
  requiredSkills: string[];
  contextSnapshot?: string;  // Layer 2 summary
  dispatchedAt: number;
}
```

Ticket 新字段示例：
```markdown
- **required_skills**: [git-master, security-review, typescript-expert]
```

## PR

https://github.com/godlockin/eket/pull/125
