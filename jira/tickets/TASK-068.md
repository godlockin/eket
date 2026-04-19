# TASK-068: Skills UI 管理界面 — Dashboard 技能可视化

**Ticket ID**: TASK-068
**Epic**: SELF-EVOLVE
**标题**: Web Dashboard 新增 Skills 管理页：列表 + 详情 + Agent 绑定
**类型**: feature
**优先级**: P1
**重要性**: medium

**状态**: done
**创建时间**: 2026-04-19
**创建者**: Master
**负责人**: 待认领

**依赖关系**:
- blocks: []
- blocked_by: []

---

## 背景 & 动机

Multica Skills UI 三件套（Multica 研究报告）：
1. **Skills 列表页**：左侧卡片列表，右侧 Markdown 预览 + 文件树
2. **Agent-Skills 绑定 Tab**：picker dialog 选择已注册 skill 绑定到 Agent
3. **Skills 注入**：运行时写入 `CLAUDE.md` 的 `## Skills` 节

EKET 目前有 76 个 skill 定义（`node/src/skills/index.ts`），但 Dashboard 无任何 UI 管理入口。

---

## 需求

### 验收标准

- **AC-1**: Dashboard 新增 `/skills` 路由，显示所有已注册 skill 的列表（名称 + 描述 + 类别）
- **AC-2**: 点击 skill 进入详情页，展示 skill 的 `description`、`inputSchema`、`category`
- **AC-3**: Agent 详情页新增 Skills Tab，显示该 Agent 绑定的 skills，支持添加/移除
- **AC-4**: API 端点：`GET /api/v1/skills`（列表）、`GET /api/v1/skills/:id`（详情）、`PUT /api/v1/agents/:id/skills`（绑定）
- **AC-5**: 绑定关系持久化到 SQLite（新增 `agent_skills` 关联表）

### 技术方案

**后端**（`node/src/api/routes/skills.ts`）：
```typescript
GET /api/v1/skills          → skillRegistry.listAll()
GET /api/v1/skills/:id      → skillRegistry.get(id)
PUT /api/v1/agents/:id/skills → db.setAgentSkills(agentId, skillIds)
```

**前端**（`node/src/api/eket-server.ts` 现有 HTML Dashboard 扩展）：
- 新增 Skills 导航项
- 技能卡片网格（名称、类别徽章、描述）
- Agent 详情 Skills 标签页

**Schema 扩展**：
```sql
CREATE TABLE IF NOT EXISTS agent_skills (
  agent_id  TEXT NOT NULL,
  skill_id  TEXT NOT NULL,
  PRIMARY KEY (agent_id, skill_id)
);
```

---

## 测试命令

```bash
cd node && npm test -- --testPathPattern=skills
node dist/index.js web:dashboard --port 3000
# 手动验证：访问 http://localhost:3000/skills
```

## 回滚

新增路由和表，不修改现有 Dashboard 逻辑，安全回滚。

---

## 执行日志

**领取时间**: 2026-04-18
**负责人**: Master (直接实现)
**状态**: done

### 实现细节

1. `node/src/core/sqlite-client.ts`：
   - `initializeTables()` 追加 `agent_skills` 表（`PRIMARY KEY (agent_id, skill_id)`）
   - 新增 `setAgentSkills(agentId, skillIds)` — 事务内全量替换（DELETE + INSERT OR IGNORE）
   - 新增 `getAgentSkills(agentId)` — 按 skill_id ORDER BY 返回绑定列表
2. `node/src/api/routes/skills.ts`（新建）：
   - `SkillsRouter`：`GET /` 列表、`GET /:id` 详情
   - `AgentSkillsRouter`：`GET /` + `PUT /` 绑定管理
3. `node/src/api/openclaw-gateway.ts`：
   - import `SkillsRouter, AgentSkillsRouter`
   - 挂载 `/api/v1/skills` + `/api/v1/agents/:id/skills`
4. `node/tests/core/agent-skills.test.ts` — 5 个测试：写入、读取、全量替换、空agent、重复skillId

### 测试结果

```
PASS tests/core/agent-skills.test.ts
Tests: 5 passed, 5 total
```

### Build 结果

`npm run build` 通过
