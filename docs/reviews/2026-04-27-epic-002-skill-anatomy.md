# 专家组评审：EPIC-002 — Skill Anatomy & Anti-Rationalization Adoption

**日期**: 2026-04-27
**主题**: 借鉴 addyosmani/agent-skills 的 5 大方法论（Anti-Rationalization 表 / 7 节式 Anatomy / Verification Checklist / Rule of 500 / ~100 行 PR）
**Master**: master-001
**关联**: [jira/tickets/EPIC-002/requirement-analysis.md](../../jira/tickets/EPIC-002/requirement-analysis.md)

---

## 召唤理由

按 [EXPERT-PANEL-PLAYBOOK §0](../../template/docs/EXPERT-PANEL-PLAYBOOK.md#0-何时召唤专家组) 表，"重构/迁移"场景需 4 名专家：架构 / 并发 / 回滚策略 / QA。本 EPIC 涉及 5 default + 60 optional 专家文档 + 2 份 RULES + 1 份 SKILL 根模板的批量重构，符合该场景。

## 发言规则（已遵循）

1. ✅ 每位专家先独立给出分析
2. ✅ 发言结构：观察 → 担忧 → 建议
3. ✅ 分歧留在文档中
4. ✅ Master 汇总末尾给出最终决策

---

## 1. 架构师（Architect）

### 观察
60 个 optional 专家分散在 11 个分类目录；5 个 default 是高频路径。两层结构（必读 vs 可选）已存在，复用即可。`scripts/check-requirement-analysis.sh` 已是 lint 模式的成熟样板，新 anatomy 校验脚本可对齐风格。

### 担忧
- 7 节式锚点写死后，未来加第 8 节会引发全量回归
- Anti-Rationalization 表如果用 Markdown 表，无法被 LLM 运行时检索（仅人读）

### 建议
- ✅ **采纳**：7 节作为"最小集"，允许末尾扩展（`## 8.+ Custom`），lint 只校验前 7 节存在
- ✅ **采纳**：Anti-Rationalization 表用 Markdown 表 + 在 frontmatter 加 `rationalizations_count: N` 字段，方便后续运行时索引
- ❓ **保留**：先静态文档（U-1 共识），运行时注入留下个 EPIC

---

## 2. 并发专家（Concurrency）

### 观察
60 个 optional 专家在 `eket-experts-extended` 子仓，本仓改动需要跨仓 PR 协调；并发改 multiple ticket 时 git 冲突在 INDEX.md 类聚合文件最集中。

### 担忧
- 多个 Slaver 同时改 optional 专家批次，INDEX.md 必冲突
- pre-commit 同时跑 anatomy check + requirement-analysis check，串行慢

### 建议
- ✅ **采纳**：按目录分批（每批 = 一个分类目录），同一时间只一个 Slaver 持有目录锁；INDEX.md 留给最后一张 ticket 统一更新
- ✅ **采纳**：anatomy check 仅检查 staged 文件（`--staged` 模式）+ 全量留给 CI
- ⚠️ **强制**：禁止 Slaver 横向协助（CLAUDE.md 已有此红线，再次提醒）

---

## 3. 回滚策略专家（Rollback）

### 观察
专家 MD 是纯文档，回滚理论上 = `git revert`；但 anti-rationalization 表如果上线后被运行时引用，回滚时引用方会断链。

### 担忧
- 若 PR 合并后立即被另一 ticket 引用某新章节，revert 会破坏下游
- Rule of 500 一旦写进 RULES，紧急 hotfix 被卡

### 建议
- ✅ **采纳**：每张 ticket 必须填 `rollback_plan` 字段（已是 INVEST 必填项）
- ✅ **采纳**：Rule of 500 加豁免开关 `--allow-large-pr` + Master 显式审批留痕（U-3 解除方式）
- ✅ **采纳**：default 专家改造采用"灰度切换"——先建 `default-v2/` 影子目录，跑 24h 后 swap，旧版保留 7 天（风险表已列）

---

## 4. QA（验收）

### 观察
AC-5 提到的 `check-skill-anatomy.sh` 是关键——没有机械 lint，60 个专家的人工 review 不可能保质。AC-1 用 `grep -c '^## '` ≥ 7 不够严，标题文字必须正确。

### 担忧
- `grep -c '^## '` 通过但顺序错乱仍算 pass，需校验顺序
- AC-2 的 "≥3 行借口表 / Red Flags / Verification" 阈值未经数据验证，可能太低或太高
- Verification checklist 写"运行 npm test"在没装 node 的专家文档里执行不了

### 建议
- ✅ **采纳**：anatomy check 用正则匹配确切章节标题 + 顺序断言（state machine）
- ✅ **采纳**：选 3 个 default 专家试点（TASK-222 pilot），实测后调阈值
- ✅ **采纳**：Verification checklist 分两类——"Process verification"（描述性）+ "Command verification"（可执行），后者可选
- ⚠️ **新增**：AC-1 修正为 "包含完整 7 个标题文字 + 按顺序" 而非仅计数

---

## 分歧记录（不私下消除）

| 分歧点 | 架构 | 并发 | 回滚 | QA | 决策 |
|--------|------|------|------|----|----|
| Rule of 500 适用范围（含/不含 generated） | 不含 | 不含 | 不含 | 含（更严） | **决议**：不含 generated / migration / lock 文件（U-2 解除） |
| optional 专家是否强制 7 节 | 不强制 | 不强制 | 强制 | 强制 | **决议**：optional 仅强制 3 节（Rationalization / Red Flags / Verification），保持 default vs optional 区隔 |
| pre-commit 还是仅 CI | 仅 CI | 仅 CI | 仅 CI | pre-commit | **决议**：本 EPIC 仅 CI（U-4 解除）；pre-commit 留下个 EPIC |

---

## Master 最终决策

1. ✅ 采纳全部"采纳"项
2. ✅ AC-1 升级为顺序断言（QA 建议）→ 已在 ticket TASK-225 的 verification 列出
3. ✅ Rule of 500 净变更定义写入 TASK-226 的 acceptance_criteria
4. ✅ Default 专家 v2 影子目录策略写入 TASK-223 rollback_plan
5. ✅ INDEX.md 聚合更新单独切一张 ticket = TASK-227

---

## 留痕

- 召唤前已读 EXPERT-PANEL-PLAYBOOK.md §0 / §1.3 / §4
- 4 名专家各自至少提 1 个 challenging question（架构 2 / 并发 2 / 回滚 2 / QA 3）
- 分歧未私下消除，3 项分歧均按 PLAYBOOK §4.3 决策矩阵裁决
