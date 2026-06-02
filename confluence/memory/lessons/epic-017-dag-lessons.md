# EPIC-017 DAG 编排系统 - 经验教训

## 概述

EPIC-017 实现了三层降级的 DAG 任务编排系统（Rust → Node.js → Shell），共 28 个 ticket，历时约 2 周。

## 做得好的地方

### 1. 三层降级架构
- **设计**：Rust(L1 首选) → Node.js(L2 降级) → Shell(L0 兜底)
- **收益**：高性能场景用 Rust，快速迭代用 Node.js，紧急修复用 Shell
- **经验**：Shell 版本必须保留作为 L0 fallback（用户明确要求）

### 2. 借鉴业界实践
- **Kahn 算法**：拓扑排序（来自图论经典）
- **WAL Checkpoint**：崩溃恢复（借鉴 MapReduce）
- **DashMap**：锁竞争优化（Jeff Dean 建议）
- **线性链融合**：调度优化（借鉴 Flume）
- **优先级调度**：关键路径 +20，deadline +30（借鉴 Borg）

### 3. 安全防护
- HMAC-SHA256 任务分配认证
- 20+ 敏感信息脱敏模式
- Shell 注入防护（foreach items 验证）
- JSON Schema 验证（maxItems:1000, maxLength:10000）

### 4. 测试覆盖
- 89.91% 命令层测试覆盖率
- 41 个新测试（epic-run, epic-analyze, dag-visualizer 等）
- 崩溃恢复场景测试

## 需要改进的地方

### 1. Shell Injection 漏洞（Linus P0）
- **问题**：executor.rs 直接执行用户脚本，无过滤
- **教训**：安全第一，执行外部输入必须先验证
- **修复**：TASK-655 添加脚本白名单/黑名单

### 2. WAL 实现不完整（Jeff Dean P0）
- **问题**：没有 `PRAGMA synchronous = FULL`，非 exactly-once
- **教训**：分布式系统的容错必须明确语义（at-least-once vs exactly-once）
- **修复**：TASK-656 添加 sync pragma + 文档化幂等要求

### 3. 性能未验证（Jeff Dean P0）
- **问题**：测试只用 2-10 节点，无 1K+ 规模验证
- **教训**：声称支持 10K 节点就必须有基准测试证明
- **修复**：TASK-658 添加 1K/5K/10K 基准测试

### 4. 正则重复编译（Linus P1）
- **问题**：每次调用都编译 6 个正则
- **教训**：热路径上的昂贵操作必须预计算/缓存
- **修复**：TASK-657 用 lazy_static 预编译

### 5. 内存效率
- **问题**：DagNode 多次克隆，4x 内存开销
- **教训**：1000 节点上限意味着必须考虑内存效率
- **建议**：用 `Arc<DagNode>` 或索引引用

## 架构决策记录

### ADR-001: 为什么保留 Shell 版本
- **决策**：Shell 版本保留为 L0 兜底
- **理由**：用户明确要求；紧急场景无需编译
- **代价**：维护三套实现

### ADR-002: 为什么用 DashMap 而非 Sharded Locks
- **决策**：DashMap (方案 B)
- **理由**：最简单且性能足够（Jeff Dean 建议）
- **代价**：引入新依赖

### ADR-003: 为什么 Fusion 只做线性链
- **决策**：只融合单入单出节点序列
- **理由**：复杂融合（operator fusion）收益不高，实现复杂
- **代价**：非线性结构无法优化

## 关键指标

| 指标 | 值 |
|------|-----|
| Ticket 总数 | 28 (24 done + 4 review fix) |
| 代码行数 | ~14K LOC (新增) |
| 测试数量 | 41 新测试 |
| 测试覆盖率 | 89.91% (命令层) |
| Phase 数量 | 4 个 Phase |
| 专家评审 | 2 次 AB 专家组 |

## 待办事项

1. TASK-655: Shell Injection 防护 (P0)
2. TASK-656: SQLite Sync Pragma (P0)
3. TASK-657: 正则预编译 (P1)
4. TASK-658: 1K 节点基准测试 (P0)

## 参考资料

- [MapReduce: Simplified Data Processing on Large Clusters](https://research.google/pubs/pub62/)
- [Borg, Omega, and Kubernetes](https://queue.acm.org/detail.cfm?id=2898444)
- [FlumeJava: Easy, Efficient Data-Parallel Pipelines](https://research.google/pubs/pub35650/)

---

*更新时间: 2026-06-02*
