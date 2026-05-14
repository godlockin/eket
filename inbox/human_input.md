# 需求：增强 EKET 团队容错机制

**提交时间**: 2026-05-14 12:30  
**优先级**: P1  
**提交人**: 用户

---

## 原始诉求

> eket 团队做事的时候要有经常更新ticket/文档的机制，如果遇到出错、熔断等问题重启，还可以从ticket/文档中快速恢复之前任务的能力

---

## 背景/痛点

**当前问题**:
1. **Slaver 超时/崩溃后状态丢失** — TASK-635 Slaver-004 stall 600s，恢复需重新派遣
2. **PR 提交前工作不可见** — TASK-636 Slaver-003 声称完成，但代码从未入 git
3. **断点恢复困难** — Master 需手动分析 git log + agent transcript 才能判断 Slaver 进度

**证据**:
- TASK-636: Slaver-003 声称实现完成，但 `rust/crates/context-mon/` 从未入 git
- TASK-635: Slaver-004 超时后需重新派遣（虽然测试文件幸存）
- 当前依赖: 读取 `.output` JSONL transcript (41831 tokens) 才能了解 Slaver 工作

---

## 期望目标

**核心能力**: Slaver/Master 异常中断后，能从 ticket/文档 **快速恢复到 80% 工作进度**（< 5 分钟理解上下文）

**可观测性目标**:
- 实时看到 Slaver 执行进度（不用等完成才看 PR）
- 知道 Slaver 卡在哪一步（分析/编码/测试/文档）
- 能从文档直接判断是否需要重做 vs 继续

---

## 初步想法（可否定）

**候选方案** (非最终):
1. **增量 checkpoint** — Slaver 每完成一个子任务立即提交到 git 临时分支
2. **进度日志流式更新** — 实时写入 `jira/tickets/<id>/progress.log`
3. **分阶段 PR** — 分析完成后先提交 analysis PR，通过后再开发
4. **Agent transcript 精简版** — 每 10 分钟提取关键决策到 `<id>/decisions.md`

---

## 验收标准（待细化）

**AC-1**: Slaver 超时后，从 ticket 目录能判断完成了哪些阶段（分析/设计/实现/测试）  
**AC-2**: 新 Slaver 接手任务时，读 `<id>/` 目录 < 5 分钟能继续工作  
**AC-3**: Master 查看进度时，无需读 agent transcript JSONL  

---

## 非目标（本轮不做）

- 实时 Web Dashboard（EPIC-005 范围）
- Slaver 自动容错重试（需 orchestrator，超出范围）
- 完整状态机持久化（过度设计）

---

## 待专家组讨论

1. **粒度问题**: checkpoint 应该多频繁？每个函数 vs 每个文件 vs 每个 AC？
2. **格式选择**: Markdown progress log vs JSON state vs git commits？
3. **职责划分**: 谁负责更新进度？Slaver 自己 vs Master 轮询 vs Hook 自动？
4. **回滚策略**: 如果 Slaver 写错进度怎么办？

---

**状态**: `analysis_complete` ✅  
**完成时间**: 2026-05-14 16:10  
**下一步**: Slaver 领取 Milestone 1 tickets (TASK-X01/X02/X03)

---

## 专家组评审产出

已创建以下文档：
1. **需求分析**: `jira/epics/EPIC-008/requirement-analysis.md`
   - 5-Why 根因分析：初版设计假设 Slaver 不中断
   - 4 个验收标准（Slaver 超时恢复 / Master 实时查进度 / 新 Slaver 快速恢复）
   - 6 个风险缓解措施

2. **技术评审**: `jira/epics/EPIC-008/expert-review-architecture.md`
   - 4 位专家独立评审（架构/DevOps/QA/后端）
   - 最终方案：阶段式 Checkpoint + Git 分支 + ProgressTracker 装饰器模式
   - 决策矩阵：方案 A 得分 9/10

3. **EPIC 卡片**: `jira/epics/EPIC-008/EPIC-008.md`
   - 3 个 Milestone（核心机制 / Git 集成 / 测试文档）
   - 风险跟踪表
   - 非功能需求（恢复速度 < 5min, 进度延迟 < 30s）

4. **Milestone 1 Tickets** (已拆解为 3 个 ≤ 2 天工时 ticket):
   - **TASK-X01**: ProgressTracker 核心类实现（6h）
   - **TASK-X02**: Slaver 集成 checkpoint 调用（8h）
   - **TASK-X03**: `eket task:verify` 验证命令（6h）

**总工时**: Milestone 1 共 20 小时（~2.5 工作日，可并行 → 1.5 天完成）
