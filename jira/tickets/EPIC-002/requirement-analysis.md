# Requirement Analysis: EPIC-002

**Epic**: 借鉴 addyosmani/agent-skills 的 5 大方法论，升级 EKET 专家/技能/规则文档体系
**创建时间**: 2026-04-27
**Master**: master-001
**expert_panel**: required
**专家组记录**: [docs/reviews/2026-04-27-epic-002-skill-anatomy.md](../../../docs/reviews/2026-04-27-epic-002-skill-anatomy.md)

---

## 1. 原始诉求（原文引用）

> 这5个都要，分析、拆卡、然后启动slaver团队开工

5 个借鉴点（来自 addyosmani/agent-skills 研究结论）：

1. **Anti-Rationalization Tables**：每个角色/技能附"借口 → 反驳"二列表，主动反制 LLM 自我合理化
2. **Unified SKILL Anatomy**：统一 7 节式（Frontmatter / Overview / When to Use / When NOT to Use / Process / Common Rationalizations / Red Flags / Verification）
3. **Verification Checklist**：每个技能交付时强制硬性闸门
4. **Rule of 500**：>500 行重构必须用 codemod / AST 工具，禁止逐行手改
5. **Change sizing norm**：单个 PR 控制在 ~100 行变更

## 2. 受益人 × 场景矩阵

| Persona | 触发场景 | 当前痛点（证据） | 期望结果 |
|---------|---------|-----------------|---------|
| Master Agent | 收到新需求拆任务 | 技能/专家文档结构散乱，无统一锚点；review 找不到合理化反例 | 7 节式定位每个章节，借口表自动反制 |
| Slaver Agent | 领卡执行 | 没有 verification checklist，自报"完成"无硬证据；大重构想偷懒一行行改 | Verification 闸门 + Rule of 500 codemod 强制 |
| Reviewer (Master) | 审 PR | PR 经常 800+ 行难审；rationalization 借口频繁出现 | ~100 行/PR 上限 + 借口表精准击中 |
| 外部贡献者 | 写新技能 | 无统一模板，复制旧文件容易缺章节 | 7 节锚点 + check 脚本机械校验 |
| 用户 (项目所有者) | 复盘项目质量 | 无法快速检索"为何此次未走 codemod" | 借口表 + verification 留痕，可审计 |

## 3. 验收标准（Given-When-Then）

- **AC-1**: Given 5 个 default 专家 (`~/.claude/skills/eket/experts/default/`), When 重构完成, Then 每个 MD 包含 frontmatter + Overview + When to Use + When NOT to Use + Process + Common Rationalizations + Red Flags + Verification 共 7 节，且 `grep -c '^## '` ≥ 7
- **AC-2**: Given 60 个 optional 专家 (`~/.claude/skills/eket/experts/optional/`), When 模板对齐完成, Then 每个 MD 至少包含 Common Rationalizations 表（≥3 行）+ Red Flags 列表（≥3 行）+ Verification checklist（≥3 行）
- **AC-3**: Given `template/docs/MASTER-RULES.md` 与 `template/docs/SLAVER-RULES.md`, When 添加 Rule of 500 + ~100 行 PR 上限两条新红线, Then `git diff` 可见两条 `**红线**` 项 + pre-commit hook 在 PR 行数 > 100 时输出警告（非阻塞，可 `--allow-large-pr` 跳过）
- **AC-4**: Given 任意一个 default 专家被调用, When LLM 给出"借口"（如"测试可以等下次"）, Then Anti-Rationalization 表中能匹配到该借口并展示反驳
- **AC-5**: Given `bash scripts/check-skill-anatomy.sh`（新脚本）, When 在 CI 中执行, Then 5 个 default 专家全部 pass，60 个 optional 专家 ≥90% pass，否则 exit 1
- **AC-6**: Given 单个 ticket PR, When CI lint 阶段执行 `scripts/check-pr-size.sh`, Then 净变更 > 500 行直接 fail；100 ~ 500 行 warn 但 pass

## 4. 非目标（Out of Scope）

- ❌ 重写已有 EKET 业务代码（仅文档/规则/技能 MD）
- ❌ 重写 Rust core 或 Node CLI 命令
- ❌ 改动 `eket-experts-extended` 仓库的 skills/*.json（任务卡 schema 留给后续 EPIC）
- ❌ 引入新的 LLM provider 或 prompt template runtime
- ❌ 修改 jira / confluence 三仓分离架构
- ❌ 自动化把 anti-rationalization 表注入运行时 system prompt（先静态文档，运行时注入留给后续 EPIC）

## 5. 未知与假设

| ID | 类型 | 内容 | 阻塞级别 | 解除方式 |
|----|------|------|---------|---------|
| U-1 | 未知 | 60 个 optional 专家中部分由社区贡献，作者偏好可能拒绝 7 节模板 | P1 | 在 eket-experts-extended 开 issue 征求意见，必要时只对齐 3 节最小子集 |
| U-2 | 未知 | Rule of 500 的"500 行"是净变更还是含空白 / 注释 / 生成代码？ | P0 | 专家组决议：净变更（去注释 / 空行 / generated 文件） |
| U-3 | 未知 | ~100 行 PR 上限是否会拖慢紧急 hotfix？ | P1 | 提供 `--allow-large-pr` 标志 + Master 审批后跳过 |
| U-4 | 未知 | check-skill-anatomy.sh 是否应在 pre-commit 还是仅 CI？ | P2 | 先 CI，pre-commit 可选；本 EPIC 只交付 CI |
| A-1 | 假设 | addyosmani 项目以 MIT/Apache 许可发布，文案可改写借鉴 | P0 | 已确认仓库为 MIT，借鉴方法论非直抄 |
| A-2 | 假设 | 5 个 default 专家文档体量 ≤ 800 行/份 | P1 | 实际平均 ~300 行，余量充足 |
| A-3 | 假设 | Slaver 单人可在 8h 内完成单个 default 专家 7 节重构 | P1 | 试点 TASK-222 验证后再放给批量 |

## 6. 风险与缓解

| 风险 | 可能性 H/M/L | 影响 H/M/L | 缓解策略 |
|------|--------------|-----------|---------|
| 60 个 optional 专家批量改触发 PR 过大 (>500 行) | H | M | 按 5 ~ 10 个/批拆 PR；用 codemod 自动注入 3 节模板（Rule of 500 自洽） |
| Rule of 500 + ~100 行 PR 互相打架（合规改 60 个专家就破规） | M | M | EPIC 内特批一次性放宽至 ~300 行/PR；新规上线后回归常规 |
| Anti-Rationalization 表过度本地化导致 LLM 反向利用（用借口表里没列的措辞绕过） | M | H | 借口表标注"非穷举"；保留 Master Reviewer 兜底 |
| Verification checklist 写死命令，操作系统差异（macOS vs Linux）失败 | M | M | 用 bash 兼容写法 + CI 在两平台都跑 |
| 重构期间专家文档不可用造成执行链路中断 | L | H | 改 default 专家时一次只动一个，灰度切换；保留 v1 备份 7 天 |
| 上游 addyosmani 项目改方法论我们已分叉 | L | L | 半年盘一次差异，必要时跟随 |

---

## 完成度自检（Master 在召集专家组前自填）

- [x] §1 原始诉求 — 已附原文 + 5 点拆解
- [x] §2 受益人 5 行 — Master / Slaver / Reviewer / Contributor / 用户
- [x] §3 AC 全部 GWT 句式 — 6 条
- [x] §4 非目标 — 6 项明确排除
- [x] §5 未知/假设 — U-1..U-4 + A-1..A-3 共 7 行
- [x] §6 风险/缓解 — 6 风险全部带缓解策略
