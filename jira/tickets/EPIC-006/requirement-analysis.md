# Requirement Analysis: EPIC-006

**Epic**: Context Overflow 400 错误防御系统  
**创建时间**: 2026-05-08  
**Master**: master-001  
**expert_panel**: required  
**专家组记录**: [docs/reviews/2026-05-08-context-overflow-expert-panel.md](../../docs/reviews/2026-05-08-context-overflow-expert-panel.md)

---

## 1. 原始诉求（原文引用）

> rust 端也没有，是eket master/slaver 开工的时候就会遇到这个问题

**上下文补充**:
Master/Slaver 执行任务时（通过 `claude` CLI 调用 Claude Code），长时间对话导致 context 累积超限（200k tokens），触发 API 400 错误，导致任务中断无法继续。

**诉求拆解**:
1. **防御**: 建立机制防止 context overflow 导致 400 错误
2. **恢复**: 400 错误发生时自动恢复，不中断任务
3. **监控**: 可观测 session context 健康度，提前预警
4. **优化**: 从源头减少 context 膨胀（智能 Read + tool output 过滤）

---

## 2. 受益人 × 场景矩阵

| Persona | 触发场景 | 当前痛点（证据） | 期望结果 |
|---------|---------|-----------------|---------|
| **Slaver** | 深度分析任务（连续 Read 5+ 大文件） | context 快速累积 → 第 20 轮对话 400 错误 → 任务失败 | 自动压缩 context，无感继续执行 |
| **Master** | PR 审核（git diff + 多文件 Read + 历史对话） | 审核进行到一半 400 错误 → 丢失分析思路 | 自动恢复 + 保留关键分析 |
| **项目所有者** | 查看执行日志，发现任务失败原因 | 日志仅显示"Task failed"，无具体原因 | 错误日志记录 400 + context 状态快照 |
| **DevOps** | 评估系统健康度 | 无 context overflow 指标，无法量化问题严重性 | Dashboard 展示 400 错误率 + recovery 成功率 |
| **后续维护者** | 调试 context overflow 问题 | 无历史数据，不知道哪些 task 类型容易超限 | Session 快照可复现，metrics 可追溯趋势 |

---

## 3. 验收标准（Given-When-Then）

- **AC-1**: Given Slaver 领取复杂分析任务, When 连续 50 轮对话（含 10 次 Read 大文件）, Then 无 400 错误，或触发后自动恢复继续执行
- **AC-2**: Given context 估算超过 150k tokens, When 下次 tool call 前, Then 自动触发 `/compact`，session 继续可用
- **AC-3**: Given 发生 400 错误, When auto-recovery 执行, Then 错误日志写入 `.eket/logs/context-overflow.log`（含 sessionId, timestamp, estimated_tokens, task_id）
- **AC-4**: Given 发生 400 错误, When 错误触发, Then session 状态快照保存到 `.eket/debug/session-<id>-overflow.json`（含 message history, tool call sequence）
- **AC-5**: Given Slaver Read 100KB 大文件, When smart-reader 启用, Then 实际传给 Claude Code < 15KB（摘要或分段）
- **AC-6**: Given Grep 返回 500 条结果, When tool-output-filter 启用, Then 仅传 50 条 + "... 450 more" 提示
- **AC-7**: Given 任意 session 运行中, When 执行 `eket system:dashboard`, Then 展示 context health 面板（session token 使用率、400 错误率、recovery 成功率）
- **AC-8**: Given 单个 task 触发 3 次 400 错误, When alert-manager 检测, Then 写入 `inbox/human_feedback/[ALERT] context-overflow-TASK-XXX.md`

---

## 4. 非目标（Out of Scope）

- ❌ 修改 Claude Code CLI 源码（不可控，仅能适配）
- ❌ 替换 Claude Code 为其他 LLM（架构级变更，另开 EPIC）
- ❌ 实现 Task-Scoped Sessions（成本 > 收益，prompt caching 损失大）
- ❌ 优化 Claude API 本身的 context limit（200k 是 API 限制，无法改变）
- ❌ 解决其他类型的 API 错误（429 rate limit / 500 server error — 另开 ticket）
- ❌ 修改 Slaver 工作模式为"不深度分析"（降低能力不是解决方案）

---

## 5. 未知与假设

| ID | 类型 | 内容 | 阻塞级别 | 解除方式 |
|----|------|------|---------|---------|
| U-1 | 未知 | Claude Code 的 `/compact` 命令在 session 400 后是否仍可用 | P0 | TASK-601 实测验证 |
| U-2 | 未知 | Smart summarization 的成本是否可接受（每次 Read 大文件调用 Haiku） | P1 | TASK-604 benchmark 对比 |
| U-3 | 未知 | Token 估算公式（chars/3.5）对中文内容的准确度 | P1 | TASK-602 实测校准 |
| U-4 | 未知 | 单个 task 的典型 context 膨胀曲线（工时 vs tokens） | P2 | TASK-606 数据收集分析 |
| A-1 | 假设 | 大部分 task 可在 150k tokens 内完成 | P0 | 通过 Phase 1 验证 |
| A-2 | 假设 | `/compact` 可减少 50-70% context | P0 | TASK-601 验证 compact 效果 |
| A-3 | 假设 | Smart reading 不影响分析质量 | P1 | TASK-604 对比全文 vs 摘要的分析结果 |
| A-4 | 假设 | 400 错误恢复后可无缝继续执行 | P0 | TASK-601 验证 retry 逻辑 |

---

## 6. 风险与缓解

| 风险 | 可能性 H/M/L | 影响 H/M/L | 缓解策略 |
|------|--------------|-----------|---------|
| `/compact` 失败导致 auto-recovery 无效 | M | H | 降级方案：kill session + 重启新 session（TASK-601 实现） |
| Token 估算偏差 ±30%，仍触发 400 | M | M | 保守估算（3.5 chars/token）+ 留 20k buffer（150k 触发而非 180k） |
| Smart summarization 丢失关键代码细节 | L | H | 提供 "Read full content" fallback，Slaver 可主动请求全文 |
| Tool output filter 过滤掉关键结果 | L | M | 优先级排序（精确匹配优先）+ 提示"use --limit 查看更多" |
| 频繁 compact 导致分析思路中断 | M | M | Compact 后保留最近 10 轮对话 + 生成摘要（非全清空） |
| Phase 1 修复后仍有 10% task 触发 400 | M | L | Phase 2 smart reading 降低到 <2%，Phase 3 alert 兜底 |
| Session 快照文件过大（>100MB） | L | L | 仅保存最近 20 条 messages + tool call metadata（非完整 output） |

---

## 完成度自检（Master 在召集专家组前自填）

- [x] §1 原始诉求 — 已附原文 + 拆解
- [x] §2 受益人 5 行 — Slaver / Master / 项目所有者 / DevOps / 后续维护者
- [x] §3 AC 全部 GWT 句式 — 8 条
- [x] §4 非目标 — 6 条
- [x] §5 未知/假设 — 4 未知 + 4 假设
- [x] §6 风险 — 7 项 + 缓解

---

**状态**: ✅ 需求分析完成  
**下一步**: 创建 EPIC-006 目录 + 拆解 7 个 TASK
