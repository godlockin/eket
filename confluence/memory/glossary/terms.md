# EKET 核心术语表

**最后更新**：2026-04-19（TASK-095）

---

## Master

**定义**：EKET 框架中的项目经理角色，由 AI Agent 担任。  
**职责**：需求分析、任务拆解、Slaver 初始化、PR 审核、合并代码。  
**红线**：禁止亲手写任何代码（业务/配置/测试均不行）；禁止无 CI 绿灯合并。  
**文件位置**：`.eket/IDENTITY.md` 标明当前 session 角色。

---

## Slaver

**定义**：EKET 框架中的执行工程师角色，由 AI Agent 担任。  
**职责**：领取 ticket、分析设计、编码实现、测试、提交 PR、完成后知识沉淀。  
**红线**：禁止修改验收标准；禁止审查自己的 PR；连续读取 5+ 文件无写操作视为分析瘫痪。  
**数量**：一个 session 对应一个 Slaver，同时可运行多个 Slaver 并行执行不同 ticket。

---

## 三级降级（Three-Level Degradation）

**定义**：EKET 运行时的三个能力层级，按环境依赖从低到高：  
1. **Level 1 — Shell**：纯 bash，零依赖  
2. **Level 2 — Node.js**：TypeScript CLI + HTTP Dashboard  
3. **Level 3 — Redis+SQLite**：分布式队列 + 持久化  

**规则**：高级功能不可用时自动降级到低级，不中断服务。  
**参见**：`confluence/memory/patterns/three-level-degradation.md`

---

## Inbox

**定义**：Master 接收外部指令的消息目录，位于 `inbox/`。  
**优先级分级**：  
- `[P0-旨意]`：立即停止所有工作，优先响应  
- `[P1-谕令]`：完成当前 ticket 后立即处理  
- `[P2-闲聊]`：正常响应，不打断执行流程  

**回复位置**：`inbox/human_feedback/`（P0 必须回复"已收到"）。

---

## Ticket

**定义**：EKET 任务管理的基本单元，存储于 `jira/tickets/TASK-XXX.md`。  
**状态机**：`ready` → `in-progress` → `in-review` → `done`（或 `blocked`）。  
**职责分界**：  
- Master 填写：元数据、需求、验收标准、依赖、技术方案初稿  
- Slaver 填写：领取信息、分析报告、实现细节、测试结果、PR 链接、知识沉淀  

**文件格式**：见 `template/` 目录下的 ticket 模板。
