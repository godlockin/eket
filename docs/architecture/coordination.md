# Master-Slaver 协调模式（Master-Slaver Coordination Pattern）

## 概述

多智能体协作架构，通过明确的角色分离和异步通信机制，实现 AI Agent 并行工作的高效协调。

## 架构角色

### Master 角色
- **职责**：需求分析、任务拆解、Slaver 初始化、PR 审核、架构决策
- **限制**：禁止直接编写业务代码（避免角色混淆和审查失效）
- **产出**：Ticket 定义、依赖关系、架构决策文档

### Slaver 角色
- **职责**：领取单一 ticket，独立完成分析→设计→实现→测试→PR 全流程
- **限制**：禁止横向协调（不得直接修改其他 Slaver 的代码）
- **产出**：代码实现、测试用例、PR、复盘文档

## 通信机制

### 异步文件协议
- **通信通道**：Ticket 文件（`jira/tickets/*.md`）作为唯一通信载体
- **设计决策**：避免 session 耦合，状态可追溯
- **依赖管理**：Master 在 ticket 元数据中声明依赖关系

### 状态机流转
```
待领取 → 进行中 → 待审核 → 已合并 → 已关闭
   ↓                  ↓
需修改 ←───────────── 审核驳回
```

## 设计决策

### 角色边界清晰
- Master 不写代码 → 保持客观审查立场
- Slaver 不横向协调 → 避免未审查变更进入代码库
- PR 必须由非作者审核 → 强制 code review 流程

### 并行度优化
- Slaver 之间无共享状态（除 ticket 文件）
- 依赖关系通过 ticket 元数据显式声明
- 实测数据：并行度提升 3-5x（Round 2/3）

### 可追溯性
- Ticket 文件即完整通信历史
- 状态变更通过文件 diff 可审计
- 依赖关系在元数据中结构化存储

## 对外接口

### Master API
```bash
# 初始化 Slaver（创建独立 session）
eket slaver:init --ticket-id=<id> --role=slaver

# 审核 PR
eket pr:review --ticket-id=<id> --decision=<approve|reject>
```

### Slaver API
```bash
# 领取任务
eket task:claim [ticket-id]

# 提交完成
eket task:complete --ticket-id=<id> --pr-url=<url>
```

## 反模式

| 反模式 | 后果 | 解决方案 |
|--------|------|----------|
| Master 直接写代码 | 角色混乱，review 失效 | 严格执行角色边界，所有代码由 Slaver 完成 |
| Slaver 横向修改 | 引入未审查变更 | 通过 Master 协调，禁止直接跨 ticket 修改 |
| 缺少 PR review | 质量无保障 | 强制 PR 流程，Master 或其他 Slaver 审核 |

## 适用场景

- 需要多个 AI Agent 并行工作的框架
- 需要严格角色分工的协作系统
- 需要可追溯状态管理的任务系统
- 需要确保代码质量的审查流程

---

> **实现细节**：查看 `confluence/memory/patterns/master-slaver-coordination.md`
