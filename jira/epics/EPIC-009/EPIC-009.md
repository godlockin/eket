# EPIC-009: EKET 高级智能、自愈与语义门禁升级

**优先级**: P1  
**状态**: `planning`  
**创建时间**: 2026-05-24 00:40  
**负责人**: Master (Tech Lead / Product Manager)  
agent_type: master  
estimate_hours: 12  
acceptance_criteria: AC-1 to AC-5  
rollback_plan: Reset code branch  
observability: logs  

---

## Epic 概述

**目标**: 升级 EKET 智能体协作体系，构建具备“状态自愈、语义防作弊、AST图谱检索、弹性调度与可视化观测”的下一代工业级多智能体协同网络。

**核心价值**:
- **状态一致性保障**：消除由于物理断网/降级导致的多级状态机（Redis ➔ SQLite ➔ 文件）状态漂移，提供完整的日志回放对齐。
- **交付防腐与质检**：引入 AI 语义级校验，防止 Slaver 用空洞的“AI垃圾报告”欺骗结构门禁，保障核心开发计划质量。
- **超强上手体验**：基于 AST 的代码图谱 RAG 检索，帮助中途加入的 Agent 秒级梳理跨文件调用链依赖。
- **算力成本优化**：动态角色按需 Spawn 与预算控制，杜绝无效 Token 浪费。
- **可视化观测**：实时渲染 SDLC 事件与 Agent 心跳流，使人类 PM 具备完整的上帝视角。

---

## Milestone 划分

### M1: 状态自愈与语义交付校验（Week 1）
**交付物**: 降级数据自动对齐回放，AI 自动质检 Slaver 方案

- [TASK-Y01](../../tickets/TASK-Y01.md): WAL/Raft 消息重放与多级状态对齐 (6h, P0, backend)
- [TASK-Y02](../../tickets/TASK-Y02.md): AI 语义级计划质检门禁实现 (6h, P0, backend)

---

### M2: 图谱检索与算力控制（Week 2）
**交付物**: AST 级代码图谱 FTS5 检索，动态 Agent 按需调度

- [TASK-Y03](../../tickets/TASK-Y03.md): AST 语法树级代码图谱检索索引 (8h, P0, backend)
- [TASK-Y04](../../tickets/TASK-Y04.md): 动态多角色算力调度器与预算控制 (8h, P1, devops)

---

### M3: 运行时可视化（Week 3）
**交付物**: 交互式 Web 看板，实时心跳与时序可视化

- [TASK-Y05](../../tickets/TASK-Y05.md): 实时 Web 运行时仪表盘与拓扑可视化 (8h, P2, frontend)

---

## 技术架构设计

```
                    ┌────────────────────────────────────────┐
                    │     Orchestrator 动态调度与预算控制     │
                    └───────────────────┬────────────────────┘
                                        │ (Spawn specialized agents)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Slaver 开发流水线                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. Claim ➔ 2. Write Analysis ➔ 3. Pre-commit Gate ➔ 4. TDD ➔ 5. PR         │
│                        │               │                                    │
│                        ▼               ▼                                    │
│             [AST Code-Graph RAG]  [AI 语义质检员]                           │
│             (秒级定位调用关系依赖) (阻止垃圾计划骗门禁)                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (State degradation)
┌─────────────────────────────────────────────────────────────────────────────┐
│                      状态降级与自愈 (Self-Healing)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Redis Pub/Sub] ──(disconnect)──➔ [SQLite WAL] ────➔ [File Queue (.msg)]   │
│         ▲                                                  │                │
│         └───────────(Raft-like Log Replay & Reconcile)─────┘                │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ (Live updates)
                    ┌────────────────────────────────────────┐
                    │      Real-time Web Dashboard (vis.js)  │
                    └────────────────────────────────────────┘
```

---

## 验收标准（Epic 级别）

- [ ] **AC-1**: Redis/SQLite 重新连线后，系统在 10 秒内自动回放并对齐所有断网期间的本地文件消息。
- [ ] **AC-2**: 当 `analysis-report.md` 包含空洞、无意义的重复提示词内容时，AI 语义质检门禁（Git pre-commit）判定为不合格并拦截提交。
- [ ] **AC-3**: Agent 能够通过 `knowledge:search` 检索到精准的跨文件函数/类依赖链关系（例如“修改 A 会影响 B 模块的 C 方法”）。
- [ ] **AC-4**: 调度系统能够根据 Ticket 的 Category 标签动态 Spawn 出匹配的 `frontend_dev` / `backend_dev` 节点，并在预算超标时自动熔断。
- [ ] **AC-5**: Web Dashboard 能够以交互式图谱实时渲染 Agent 拓扑与 SDLC 时间线。

---

## 风险跟踪

| 风险 ID | 描述 | 缓解措施 | 状态 |
|---------|------|---------|------|
| R-1 | AST 扫描对于大型项目耗时过高 | 实施基于 SHA256 的增量代码树解析 | 🟢 计划中 |
| R-2 | AI 语义质检门禁网络请求延迟大 | 在本地部署极速的轻量化校验节点并增加本地缓存 | 🟡 待优化 |
| R-3 | 多级状态重放发生冲突（如多节点同时回放） | 引入单实例 Master 排它分布式锁控制重放流程 | 🟢 计划中 |

---

## 相关链接

- [confluence/memory/codebase-map.md](../../../../confluence/memory/codebase-map.md)
- [scripts/init-three-repos.sh](../../../../scripts/init-three-repos.sh)
- [node/src/commands/graph-query.ts](../../../../node/src/commands/graph-query.ts)

---

**状态历史**:
- 2026-05-24 00:40 — 创建 EPIC-009 规划，拆解为 5 个核心技术 tickets 并在 Jira 中备案。
