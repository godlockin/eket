# TASK-229: 调研 miao 与 main 50 commit 历史欠债 + 制定回灌方案

## 元数据
- **状态**: todo
- **类型**: investigation
- **优先级**: P1
- **agent_type**: architect
- **estimate_hours**: 4
- **parent_epic**: EPIC-003（待规划）
- **创建时间**: 2026-04-29
- **依赖**: PR #145, PR #146（分支顺序统一前置）
- **assigned_experts**: tech-architect

## 背景

EPIC-002 收尾推 main → miao（PR #143）时发现 miao 比 main 超前 **50 commits**。按正确分支顺序 `feature/* → testing → main → miao`，miao 应该是 main 的下游镜像，但实际仓库里 miao 反而是 upstream（含 RUST-GAP / TASK-115~221 等大量未到 main 的内容）。

历史成因推测：之前几轮某些 slaver 把分支顺序写成 `testing → miao → main`（PR #145 已修），导致一段时间内开发流程跑错，feature 直接落到 miao，没回灌 main。

## 50 commit 题材分布（初查）

- **Rust 重构**：RUST-GAP sprint 17 ticket / Phase 1-5 完整迁移 / TASK-123~138 / TASK-151~152
- **大量 feature**：TASK-115~122（SQLite trace / Skill Stacking / multi-agent review / Compression / Loop nodes 等）
- **TASK-197~213 实现**（context-mode / MemOS / claude-context 借鉴）
- **TASK-214~221 红队修复**
- **docs 大整理 + skill system split + Confluence 重组**

**结论**：50 commit 含**实质生产价值**，必须回灌 main，绝不能 reset 丢弃。

## 详细描述

本 ticket 是 **investigation only**，不动代码。产出：

1. **完整 commit 清单**（按主题分组：Rust / TASK 编号段 / docs / refactor）
2. **风险评估**：
   - 这 50 commit 落到 main 后是否会和 main 上独立演化的内容冲突
   - main 当前 HEAD 是 testing→main 升级（PR #142 + EPIC-002）；miao 起点更早，是否存在不可调和的分歧
   - 业务影响：哪些 commit 已经在生产环境（按 miao 视角）跑了多久，回灌到 main 是否引入回归
3. **回灌方案选择**：
   - **A**：merge miao → main（直接 PR，让 main 一次性追上 miao 的 50 commit），优点保留完整 history，缺点单 PR 体量巨大
   - **B**：rebase miao 上的 50 commit 到 main，逐主题拆 5-10 个 PR（Rust / 各 TASK 段 / docs / refactor 各一组），优点可审 size，缺点工作量大 + 顺序 + 冲突复杂
   - **C**：cherry-pick 选择性，只拿 main 缺的关键内容，旧的 noisy commit 跳过 — 风险最高
4. **推荐方案 + 实施计划**（含 ticket 拆分建议）

## 验收标准

- [ ] AC-1: 产出 `confluence/memory/main-miao-debt-investigation.md`，含 50 commit 完整清单 + 题材分组
- [ ] AC-2: 含三方案（A/B/C）的对比表 + Master 推荐
- [ ] AC-3: 含后续 ticket 拆分建议（如选 B，列出 5-10 个 follow-up ticket 的范围与依赖）
- [ ] AC-4: 含风险等级与缓解措施（特别是冲突 + 业务回归）

## 不在本 ticket 范围

- ❌ 不动任何代码 / 不开任何回灌 PR
- ❌ 不做实际 merge / cherry-pick / rebase
- ❌ 决策由 Master 在调研报告基础上做，本 ticket 只产出选项

## test_strategy

- 仅文档产出，无测试
- Master review 调研报告后决定是否进入回灌阶段（新建 EPIC-003 或类似）

---

**类型**: Investigation
**技能要求**: git history 分析 / 仓库考古
**依赖**: PR #145, PR #146
**assigned_experts**: tech-architect

<!-- machine-readable fields -->
agent_type: architect
estimate_hours: 4
