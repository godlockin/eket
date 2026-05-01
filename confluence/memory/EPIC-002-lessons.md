# EPIC-002 综合经验教训

**来源**: EPIC-002 closure-review + pr-closure-lessons + TASK-222~227 debrief
**周期**: 2026-04-21 ~ 2026-04-29
**主题**: addyosmani agent-skills 方法论引入（7 default + 53 optional 专家）

---

## 1. EPIC 概览

EPIC-002 将 addyosmani/agent-skills 的 skill 设计方法论吸收到 EKET：统一 7-section anatomy（Identity / Activation / Anti-Rationalization / Capabilities / Workflow / Verification / Self-Improvement），配套校验脚本、CI、模板、INDEX 与跨仓 codemod。

- **7 ticket**：TASK-222~228（228 为追加）
- **13 PR**：#134（弃）, #135~#142, #143(draft), #145~#147
- **AC 核销**：23 AC 中 22 ✅ / 1 ⏳（AC-5 灰度验证）

---

## 2. PR 收尾 5 条核心教训

### 2.1 rebase onto 错 base 是 EPIC 级灾难的头号入口

PR #134 push 后 GitHub diff 显示 84838 行（实际 ~5500 行）。根因：rebase 继承了之前操作的 base 而非 `origin/testing`。

**预防**：
- 必须显式写 base：`git rebase origin/testing`
- rebase 后 `git log --oneline origin/testing..HEAD | wc -l` 验证 commit 数
- push 前 `git diff --shortstat origin/testing...HEAD` 与分析报告对账

### 2.2 预存在 CI fail 会引爆"连环骨牌"

testing 分支 4 个历史 CI fail 全部 block EPIC PR，需开 4 个独立清场 PR (#135~#138)。

**预防**：EPIC push 前先 `gh pr checks` 当前 testing HEAD，有 fail 先清场。

### 2.3 文件名 grep 边界陷阱（多 ticket 聚合命名）

紧凑形式 `222-223-224` 让 grep `TASK-223` 无法命中。

**规则**：多 ticket 聚合文件每个 id 必须完整带 `TASK-` 前缀。

### 2.4 PR 范围异常的早期信号要在 push 前抓

push 前必跑 3 数字心算：commits / files / lines，偏离 >10% 立刻 stop。

### 2.5 solo-dev label + close-reopen workaround

GitHub Actions rerun 走缓存的 event payload，后加 label 不生效。Workaround：`gh pr close` + `gh pr reopen`。

**规则**：PR 创建时一次性带齐所有 label。

---

## 3. 技术实现经验

### 3.1 `set -u` + 空数组陷阱

bash `set -u` 下 `${arr[@]}` 当数组为空时触发 unbound variable。修复：`${arr[@]+"${arr[@]}"}`。

### 3.2 AC 跨 ticket 联动回填的 sequencing

拆 ticket 时若 AC 依赖跨仓 merge，明确标注「AC-x 在 EPIC push 步骤验收」。

### 3.3 草稿文件 git ?? 状态识别

分析阶段涉及"是否新建"，必须 `git status --short <path>` + `ls -la <path>` 双重确认。

---

## 4. 工程纪律验证

- **Anti-rationalization 红线两次正面成立**：slaver 选择"上报"而非"顺手宣告"
- **Commit message 严禁 trailer**：全程 13+ commit 0 trailer
- **≤500 行健康区间始终守住**：Rule4/5 是"事后形式化"已存在的工程节奏

---

## 5. 关键决策点

1. PR #134 弃用 → 6 PR 串收尾（84838→5493 行）
2. subrepo 与主仓分别 commit（解耦避免行数爆炸）
3. TASK-228 立 follow-up（主仓 optional gap）而非塞回 TASK-227
4. main↔miao 50 commit 历史欠债 → 立 TASK-229 调研，不盲合

---

## 6. EPIC 收尾 push 前 Checklist

- [ ] rebase onto 显式 base + reflog 确认
- [ ] 3 数字心算：commits / files / lines 对账
- [ ] testing 健康检查：预存在 fail 先清场
- [ ] PR label 一次到位
- [ ] 多 ticket 文件命名规范：完整 `TASK-` 前缀

---

## 7. 遗留事项

| # | 事项 | 跟踪 |
|---|------|------|
| L1 | TASK-223 AC-5 灰度验证 | 灰度上线后回填 |
| L2 | main↔miao 50 commit 历史欠债 | EPIC-003 / TASK-229 |

---

**参见**：
- [codebase-maintenance.md](codebase-maintenance.md) — 代码库与文档维护方法论
- [lessons/multi-agent-collab-lessons.md](lessons/multi-agent-collab-lessons.md) — 多智能体协作经验
