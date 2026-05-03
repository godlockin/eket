---
title: 知识飞轮模式
review_status: accepted
review_ticket: manual
reviewed_at: 2026-05-03T00:00:00Z
proof:
  task_id: TASK-codebase-map + TASK-memory-curator
  exit_code: 0
  timestamp: 2026-05-03T00:00:00Z
  tool_name: cargo build --release
---

# 知识飞轮模式（Knowledge Flywheel）

**场景**：多 Agent 协作框架中，经验教训沉淀后无法被下一个 Agent 自动利用，形成"写了没人读"的死库。

**方案**：在任务生命周期的两个节点打通读写闭环：

```
task:claim
  → 自动检索相关 pitfalls/patterns（文件系统匹配 + FTS）
  → 有命中则输出到 claim 结果，Slaver 领完任务即可看到
  ↓
task:complete
  → Memory 质量门（结构校验 + Curator 内容评审）
  → 通过才入库，REVISE/REJECT 阻断并给出具体修改意见
  → 每 N 次 complete 触发 knowledge:index 重建（默认 N=5）
```

**关键设计决策**：

1. **两套搜索并存**：文件系统扫描（文件名+文件头400字节）作为零依赖 fallback，SQLite FTS 作为精准进阶。claim 时优先文件系统，knowledge:search 走 FTS。
2. **Curator 评审三维度**：有效性（有无 Execution Proof）、价值密度（是否可泛化）、复利潜力（能帮多少未来 Slaver）。综合分 <5 直接 REJECT，5-6 要求 REVISE，≥7 ACCEPT。
3. **幂等**：文件 frontmatter `review_status: accepted` 是唯一通行证，重复 task:complete 自动跳过已通过文件。
4. **冷启动**：`init-existing.sh` 接手老项目时立即 `knowledge:index`，不等 5 次 complete。

**复利潜力**：每个高质量 pitfall/pattern 都会在未来 task:claim 时被自动推送，永久生效。知识库越大，飞轮越快。

**来源**：TASK-codebase-map, TASK-memory-on-claim, TASK-memory-curator
