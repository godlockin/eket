# 跨项目研究方法论

**合并自**: `cross-project-research.md` · `round-22-archon-lessons.md` · `round-25-26-research-lessons.md`
**最后更新**: 2026-04-26
**覆盖 Round**: 20~26（Archon、DeepTutor、oh-my-claudecode、deer-flow、MiroFish、context-mode、MemOS 等）

---

## 1. 研究流程规范

### 1.1 研究前：先定问题，再开 Agent

**规则**：开始研究前，写明"研究问题"——我想从这个项目学什么？
- ✅ 研究结束条件：找到 ≥1 个可落地借鉴点，或确认"无可借鉴"
- ❌ 没有目标的浏览 = 研究瘫痪前兆

**规则**：研究前先验证 URL 有效：
```bash
gh search repos "<project-name>" --limit=5   # 不要直接 WebFetch 未验证 URL
```
（教训：`nicholasgasior/oh-my-claudecode` 返回 404，正确路径是 `Yeachan-Heo/oh-my-claudecode`）

### 1.2 研究中：范围控制

**规则**：单项目 1 个 Explore agent 足够，不需要满配专家团。
- 多项目并行：每项目 1 agent（不是每项目 5 agent）
- 每个项目借鉴上限：**2-3 个具体落地点**
- 超出的记入 `research/borrowed-wisdom.md` 备查，但不立即建卡

**规则**：连续读 3 个外部文件无产出 = 研究瘫痪，立即切换实现模式。

**规则**：定位偏差大的项目（如科研工具 vs 工程框架），只取最小化借鉴点，不强行映射全部特性。

### 1.3 研究后：立即写文件

**规则**：研究 agent 完成后**立即写文件**，不等"一起整理"。
- 研究报告路径：`confluence/memory/research/round-XX-<project>.md`
- 未写文件的研究结论在 session compact 后会**全部丢失**（Round 25 教训：35 个 agent 并行，compact 后只剩 4 个 Block 的建卡）

---

## 2. 借鉴价值过滤标准

5 维评分（来自 `research/borrowed-wisdom.md`）：

| 维度 | 高分条件 |
|------|---------|
| 问题匹配度 | 当前已有痛点或 near-miss |
| 可移植性 | 无需新基础设施 |
| 可验证性 | 有对应 test/grep 命令 |
| 范围可控 | ≤3 个文件改动 |
| 可撤销性 | 纯新增，不改已有逻辑 |

**决策**：4/5 高分 → 直接建卡；3/5 → spike ticket；< 3 → 记录 borrowed-wisdom.md 不建卡

**重叠处理**：与已有实现重叠度 > 60% 的借鉴点，标注"已实现"跳过，不重复建卡。

---

## 3. research/ 文件标准模板

```markdown
## 来源
项目 URL + 作者 + Stars（记录时）

## 解决的问题
一句话说清楚这个项目的核心问题

## 核心模式
（代码片段 / 架构图 / 伪代码）

## EKET 适配方案
如何在 EKET 中落地，需要改哪些文件

## 实现状态
- [ ] 未开始 / [ticket-id] / ✅ 已完成于 PR #XXX
```

---

## 4. 本轮各项目借鉴要点速查

### Round 22 — Archon

| 模块 | 关键结论 |
|------|---------|
| YAML DAG 引擎 | 拓扑排序按层分组 + `Promise.allSettled` 最简实现；`ctx` 在层间传递 |
| Agent 模型路由 | 按 ticket 标签路由：分类用 haiku、实现用 opus（节省 30-50% 成本） |
| SSE 事件体系 | `__dashboard__` 全局频道；`res.on('close', unsubscribe)` 防泄漏 |
| FTS5 upsert | 必须先 DELETE 再 INSERT（FTS5 不支持 ON CONFLICT） |
| trigger_rule | 向后兼容：缺省值 = 原有行为，老 ticket 无需修改 |

### Round 25~26 — 多项目

| 项目 | 借鉴点 | 状态 |
|------|--------|------|
| context-mode | ToC Snapshot 哲学：目录不内容；Recency Decay | ✅ TASK-211 |
| MemOS | L0-L4 记忆分层；MerkleDAG 增量索引；GC 流程 | ✅ TASK-212 |
| claude-context | AST-aware chunking；Execution Proof Anchor | ✅ TASK-213 |
| GenericAgent | "No Execution No Memory"公理；proof 字段强制 | ✅ TASK-209/210 |
| deer-flow | SlaveResult schema（与 TASK-105 worktree 重叠，仅取 schema） | ✅ TASK-121 |
| MiroFish | 知识图谱→自动 DAG 依赖推断（仅此一点，其余定位不符） | ✅ TASK-122 |

---

## 5. 已识别的 EKET 核心护城河

经多轮对比研究，以下能力在参考的所有外部项目中均未见同等实现：

1. **Gate Review + Anti-Hallucination**：验收前 RAG 交叉验证
2. **三级降级容灾**：零基础设施可运行（Shell → Node.js → Redis+SQLite）
3. **Ticket 状态机 + 分支保护**：工程纪律完整体系
4. **规则 → 代码强制化**：规则遗忘防治的 Hook 层（Layer 3b）
