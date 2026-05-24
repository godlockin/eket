# Master-Slaver 协调模式

> **迁移提示**：架构设计部分已迁移至 `docs/architecture/coordination.md`，本文档保留实现细节和实战经验。

**场景**：AI 多智能体框架中，需要协调多个执行 Agent 并行工作时  
**方案**：  
1. Master 负责需求分析、任务拆解、Slaver 初始化 — 禁止亲手写代码  
2. Slaver 领取单一 ticket，独立完成分析→实现→测试→PR 全流程  
3. 通信通过 `jira/tickets/` 文件异步交换，避免 session 耦合  
4. Master 在 ticket 元数据填依赖关系，Slaver 不得横向协调  
5. PR review 必须由 Master（或其他 Slaver）进行，禁止自我闭环  

**效果**：  
- 并行度提升 3-5x（Round 2/3 实测）  
- 角色边界清晰，减少越权导致的 conflict  
- ticket 文件即通信协议，状态机可追溯  

**反例**：  
- Master 直接写代码 → 角色混乱，review 失效  
- Slaver 横向 patch 其他 Slaver 的代码 → 引入未审查变更  

**来源**：TASK-001（框架设计）、lessons/multi-agent-collab-lessons.md §1/§4
