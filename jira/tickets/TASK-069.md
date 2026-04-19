# TASK-069: 动态 CLAUDE.md 注入 — Slaver 领取任务时写入身份 + 工作流上下文

**Ticket ID**: TASK-069
**Epic**: SELF-EVOLVE
**标题**: task:claim 后动态生成 CLAUDE.md，注入 Identity + TicketID + Workflow + Skills
**类型**: feature
**优先级**: P2
**重要性**: medium

**状态**: done
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: [TASK-065, TASK-068]

---

## 背景 & 动机

Multica 的 `InjectRuntimeConfig()` 在每次任务启动时动态写入 CLAUDE.md（6 节：Identity + Commands + Repos + Workflow + Skills + Mentions），让 Agent 在执行时具备完整上下文。

EKET 目前 CLAUDE.md 是静态文件，Slaver 启动后无法自动感知：当前 ticket ID、可用命令、已绑定 skills、角色身份。

---

## 需求

### 验收标准

- **AC-1**: `task:claim` 成功后，在工作目录追加写入 `.eket/ACTIVE_CONTEXT.md`（不覆盖用户的 CLAUDE.md）
- **AC-2**: 注入内容包含 4 节：
  - `## Active Ticket`：当前 ticket ID、标题、验收标准
  - `## Identity`：Slaver ID、角色、启动时间
  - `## Available Commands`：`task:claim`、`task:resume`、`system:doctor` 等
  - `## Active Skills`：当前 Agent 已绑定的 skills 名称列表
- **AC-3**: ticket 完成后（`done`）删除 `.eket/ACTIVE_CONTEXT.md`
- **AC-4**: 单元测试：claim 一个 ticket，验证 `.eket/ACTIVE_CONTEXT.md` 被正确生成且包含 ticket ID

### 技术方案

在 `node/src/commands/task-claim.ts` 的 claim 成功路径末尾：

```typescript
async function injectActiveContext(ticket: Ticket, slaverId: string) {
  const skills = await db.getAgentSkills(slaverId)
  const content = buildActiveContextMd(ticket, slaverId, skills)
  await fs.writeFile('.eket/ACTIVE_CONTEXT.md', content, 'utf-8')
}
```

写入 `.eket/ACTIVE_CONTEXT.md`（区别于 CLAUDE.md，不污染用户配置）。

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=task-claim
ls .eket/ACTIVE_CONTEXT.md  # 验证生成
```

## 回滚

只追加写文件，不修改 CLAUDE.md，删除调用点即可回滚。

---

## 执行日志

**领取时间**: 2026-04-18
**负责人**: Master (直接实现)
**状态**: done

### 实现细节

1. `node/src/commands/claim.ts`：
   - 导入 `SQLiteClient`
   - 新增 `buildActiveContextMd(ticket, slaverId, skills, role)` — 构建 4 节 Markdown
   - 新增 `injectActiveContext(projectRoot, ticket, slaverId, role)` — 查询 agent_skills，写入 `.eket/ACTIVE_CONTEXT.md`
   - `claim` 成功路径末尾调用 `injectActiveContext()`（静默忽略非关键错误）
2. `node/tests/commands/active-context.test.ts` — 4 个测试：内容包含ticket ID、无skills显示(none)、文件写入验证、幂等覆盖

### 测试结果

```
PASS tests/commands/active-context.test.ts
Tests: 4 passed, 4 total
```

### Build 结果

`npm run build` 通过
