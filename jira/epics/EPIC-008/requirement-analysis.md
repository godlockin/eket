# Requirement Analysis: EPIC-008 — EKET 团队容错机制增强

## 1. 原始诉求（原文引用）

> eket 团队做事的时候要有经常更新ticket/文档的机制，如果遇到出错、熔断等问题重启，还可以从ticket/文档中快速恢复之前任务的能力

---

## 2. 受益人 × 场景矩阵

| Persona | 触发场景 | 当前痛点（证据） | 期望结果 |
|---------|---------|-----------------|---------|
| **Master** | Slaver 超时 600s stall | TASK-635: Slaver-004 超时后需重新派遣，无法知道完成度 | 读 ticket 目录 < 5min 了解进度，决定重派 vs 继续 |
| **Master** | PR review 前查进度 | TASK-636: Slaver-003 声称完成但代码未入 git，需读 41831 tokens transcript 才知真相 | 实时看到 Slaver 执行阶段（分析/编码/测试），无需读 transcript |
| **新接手 Slaver** | 继承未完成任务 | 当前需手动分析 git log + transcript JSONL 才能判断从何处继续 | 读 `jira/tickets/<id>/` 目录自动恢复上下文（设计决策 + 已完成文件 + 下一步） |
| **DevOps/SRE** | 批量任务崩溃恢复 | 多个 Slaver 同时超时时，无快速判断哪些需重做、哪些可恢复 | 扫描 `jira/tickets/` 批量识别进度状态 |

---

## 3. 验收标准（Given-When-Then）

**AC-1: Slaver 超时后状态可见**
- **Given**: Slaver-005 在 TASK-640 执行中超时（600s 无响应）
- **When**: Master 运行 `eket task:status TASK-640`
- **Then**: 输出显示最后完成阶段（如 "analysis_complete, implementation_50%_[file1.rs, file2.rs]"），timestamp

**AC-2: 新 Slaver 快速恢复任务**
- **Given**: TASK-641 进度停在 implementation 阶段，Slaver-006 需接手
- **When**: 新 Slaver 运行 `eket task:claim TASK-641 --resume`
- **Then**: 自动显示：已完成文件列表 + 剩余 AC + 设计决策摘要（来自 `analysis-report.md`），无需读 transcript

**AC-3: Master 无需读 transcript 查进度**
- **Given**: Master 想知道 5 个进行中 task 的进度
- **When**: Master 运行 `eket task:list --status in_progress`
- **Then**: 每个 task 显示当前阶段 + 完成百分比 + 最后更新时间，数据来自 progress log 而非 transcript

**AC-4: 增量 checkpoint 可验证**
- **Given**: Slaver 在 TASK-642 实现了 3 个模块函数
- **When**: Slaver 每完成 1 个函数后执行检查点记录
- **Then**: `jira/tickets/TASK-642/progress.md` 实时更新已完成函数列表，带 git commit hash（若已提交）

---

## 4. 非目标（Out of Scope）

- ❌ **实时 Web Dashboard**（EPIC-005 范围）— 本轮仅命令行可见
- ❌ **Slaver 自动容错重试**（需 orchestrator）— 仍需 Master 手动重派
- ❌ **完整状态机持久化**（过度设计）— 仅记录关键里程碑，不记录每次 tool call
- ❌ **多 Slaver 并发写保护**（phase 2）— 当前假设同一 task 同时只有一个 Slaver
- ❌ **历史版本回放**（audit log 功能）— 仅保留最新进度，不做 event sourcing

---

## 5. 未知与假设

| ID | 类型 | 内容 | 阻塞级别 | 解除方式 |
|----|------|------|---------|---------|
| **U-1** | 未知 | Git checkpoint 频率对 history 膨胀影响（每函数 vs 每 AC） | P1 | 实验：100 个 checkpoint 的 git 仓库 size 增长率 |
| **U-2** | 未知 | Slaver 写 progress.md 失败（文件锁/权限）的容错处理 | P0 | 设计 fallback 机制（内存缓存 → 退出时一次性写） |
| **U-3** | 未知 | Master 如何感知 Slaver 进度更新（轮询 vs 消息队列 vs git hook） | P1 | 技术选型：对比 3 方案延迟 + 实现成本 |
| **A-1** | 假设 | 进度文件 < 10KB，不影响 git clone 性能 | P2 | 每个 task 目录总大小监控，超 50KB 告警 |
| **A-2** | 假设 | Slaver 诚实写进度，不伪造（"完成 100%" 但代码未写） | P0 | 验证机制：progress 必须关联 git commit hash 或文件存在性检查 |
| **A-3** | 假设 | 同一 task 不会有 2 个 Slaver 同时执行（无并发冲突） | P1 | 当前 framework 保证；phase 2 若支持多 Slaver 需加锁 |

---

## 6. 风险与缓解

| 风险 | 可能性 | 影响 | 缓解策略 |
|------|--------|------|---------|
| **Slaver 伪造进度** | M | H | ① 进度必须关联 verifiable artifact（commit hash / 文件路径）<br>② `eket task:verify <id>` 命令交叉验证进度与 git 状态 |
| **进度文件冲突**（多 Slaver 写同一 task） | L | M | ① 当前 framework 保证单 Slaver<br>② 文件加时间戳 + Slaver ID 前缀（`progress-slaver-005-20260514.md`） |
| **Git history 膨胀**（每 5 分钟 commit） | M | M | ① 使用 `git commit --amend` 持续更新同一 checkpoint commit<br>② 或独立 progress 分支（最终 PR 时不合并 progress commits） |
| **Progress 文件损坏**（Slaver 崩溃写一半） | M | L | ① 使用原子写（先写 `.tmp` 再 `mv`）<br>② 损坏时回退到上一个有效 checkpoint |
| **性能开销**（频繁文件写影响 Slaver 速度） | M | L | ① 异步写（每 30s flush 一次内存缓存）<br>② 仅关键里程碑同步写（analysis done / AC-1 done） |
| **Master 误判进度**（progress 更新延迟） | M | M | ① progress 文件带 `last_update_timestamp`<br>② 超 10min 未更新自动标记为 `suspected_stall` |

---

## 7. 5-Why 根因分析

**现象**: Slaver 超时后恢复困难

1. **Why 需要恢复？** → Slaver 超时 / 崩溃 / 被杀
2. **Why 会超时？** → 任务耗时不确定 / 网络延迟 / 外部依赖失败（Claude API rate limit）
3. **Why 恢复困难？** → 工作进度未持久化到 git / ticket 文件
4. **Why 未持久化？** → Slaver 当前设计是"完成后一次性提交 PR"，中间状态仅在内存 / .output transcript
5. **Why 设计成一次性提交？** → **根因**：初版 framework 假设 Slaver 不会中断，优化了"最终交付"流程，忽略了"中途崩溃"场景

**解决方向**：将"最终交付一次性提交"改为"增量 checkpoint + 最终整合提交"混合模式。

---

## 8. 闸门检查结果

| 检查项 | 结果 | 说明 |
|--------|------|------|
| **Who** 受益人 | ✅ | Master / 新接手 Slaver / DevOps（见 §2） |
| **What** 交付物 | ✅ | Progress log 文件 + `eket task:status` 命令 + Slaver 自动恢复逻辑 |
| **Why** 痛点 | ✅ | 有具体证据（TASK-635/636）+ 定量数据（41831 tokens transcript） |
| **When** 成功判据 | ✅ | AC-1~4 均可用一条命令或文件检查验证 |
| **Why-5** 根因 | ✅ | 见 §7，已追溯到设计假设层面 |

**闸门通过** ✅ — 可进入 Phase 2 技术方案设计

---

**版本**: 1.0  
**作者**: Master  
**创建时间**: 2026-05-14 14:00  
**状态**: `analysis_complete`
