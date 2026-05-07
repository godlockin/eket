# 任务分析报告：TASK-224

**Slaver**: slaver-001
**分析时间**: 2026-04-27
**预计工时**: 8h（与 ticket 估算一致）
**状态**: analysis_review

---

## 1. 范围确认（Scope Correction）

TASK-224 ticket 标题写"5 个 default 专家"，**实际 ground truth 为 7 个**：

| 文件 | 存在 |
|------|------|
| architect.md | ✅ |
| backend.md | ✅ |
| frontend.md | ✅ |
| fullstack.md | ✅ |
| product.md | ✅ |
| tester.md | ✅ |
| ux.md | ✅ |

> **脚注**：建议 Master 将 ticket 元数据中 "5 个 default 专家" 改为 "7 个 default 专家"，AC-1 措辞随之更新。本报告后续统一以 7 计。

---

## 2. 现有 7 个 default 专家 Verification 节审计

审计命令：

```bash
for f in .claude/skills/eket/experts/default/*.md; do
  ver_boxes=$(awk '/^## Verification/{f=1} f && /^\- \[ \]/{c++} /^## / && f && !/^## Verification/{f=0} END{print c+0}' "$f")
  ver_bash=$(awk  '/^## Verification/{f=1} f && /^```bash/{c++} /^## / && f && !/^## Verification/{f=0} END{print c+0}' "$f")
  frontmatter=$(grep -cE "^(description|rationalizations_count):" "$f")
  echo "$(basename $f): ver_checkboxes=$ver_boxes  ver_bash=$ver_bash  frontmatter_fields=$frontmatter"
done
```

结果：

| 文件 | `## Verification` 存在 | `- [ ]` 复选框数 | `\`\`\`bash` 块数 | frontmatter 字段数 |
|------|----------------------|-----------------|-------------------|-------------------|
| architect.md | ✅ | **0** | 1 | 2 |
| backend.md   | ✅ | **0** | 1 | 2 |
| frontend.md  | ✅ | **0** | 1 | 2 |
| fullstack.md | ✅ | **0** | 1 | 2 |
| product.md   | ✅ | **0** | 1 | 2 |
| tester.md    | ✅ | **0** | 1 | 2 |
| ux.md        | ✅ | **0** | 1 | 2 |

**⚠️ AC-1 全部失败**：7 个文件的 `## Verification` 节**均无** `- [ ]` 复选框（当前内容为纯 bash 代码块 + 注释，无 checkbox 格式条目）。AC-3（≥1 bash 块）已满足。Frontmatter `description` + `rationalizations_count` 齐全（TASK-223 hotfix 已补）。

**处置决定（遵守约束）**：本报告**不修改**任何专家 .md 文件。AC-1 失败情况上报 Master，由 Master 决定：
- 选项 A：在 TASK-224 范围内补 checkbox（需扩充 AC 或新增子任务）
- 选项 B：单独开 hotfix commit（如 TASK-223 hotfix 模式）
- 选项 C：脚本先接受"0 checkbox + 1 bash 块"作为宽松过渡期阈值，后续收严

---

## 3. 脚本设计

### 3.1 入口与模式

```
scripts/check-skill-anatomy.sh [--minimal] [--verbose] <file>...
```

- **默认模式**（无 `--minimal`）：完整 7-section 检查（default 专家用）
- **`--minimal` 模式**：仅检查后 3 节（Common Rationalizations / Red Flags / Verification）（optional 专家用）

### 3.2 状态机设计（完整模式）

检测 7 个标题按严格顺序出现：

```
EXPECTED_ORDER = [
  "## Overview",
  "## When to Use",
  "## When NOT to Use",
  "## Process",
  "## Common Rationalizations",
  "## Red Flags",
  "## Verification"
]
```

用 `awk` 维护 `state` 计数器，逐行扫描：
- 遇到 `^## ` 行：若内容等于 `EXPECTED_ORDER[state]`，则 `state++`；否则 FAIL（顺序错误 / 多余章节）
- 扫描结束后 `state != 7` → FAIL（章节缺失）

**`--minimal` 模式**：EXPECTED_ORDER 取后 3 项，`state` 初始 = 0，期望结束 state = 3。前 4 节不校验顺序（仅跳过）。

### 3.3 Frontmatter 校验（来自 TASK-223 hotfix 经验）

在 YAML 前置块（`---` 到 `---` 之间）内检测：

```bash
grep -cE "^(description|rationalizations_count):" "$file"
# 期望 = 2（两字段均存在）
```

**注意**：optional 专家（`--minimal` 模式）当前模板**无** `rationalizations_count` 字段（aiml.md 审计确认）。因此 frontmatter 严格校验仅在完整模式下强制；`--minimal` 模式下，frontmatter 校验**跳过**或作 WARNING（见 §8 开放问题）。

### 3.4 Verification 节内容校验

在 `## Verification` 节范围内（下一个 `^## ` 之前）：

- **AC-1**：`- [ ]` 复选框行数 ≥ 3
- **AC-3**：` ```bash ` 代码块数 ≥ 1

### 3.5 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 所有文件全部通过 |
| 1 | 至少一个文件 anatomy 违规（顺序/缺节/checkbox/bash 块） |
| 2 | 脚本自身错误（无参数 / 文件不存在 / 读取失败） |

### 3.6 `--verbose` 输出

每条规则失败时打印：

```
[FAIL] architect.md: Verification section has 0 checkboxes (expected ≥3)
[FAIL] bad-order.md: Section "## Red Flags" found at position 5, expected "## Process"
[PASS] backend.md
```

无 `--verbose` 时仅打印 PASS/FAIL 统计行。

---

## 4. Fixture 计划

目录：`tests/fixtures/anatomy/`

| 文件 | 用途 |
|------|------|
| `good-full.md` | 完整 7 节顺序正确 + ≥3 checkbox + ≥1 bash + frontmatter 齐 → exit 0 |
| `good-minimal.md` | 仅后 3 节（`--minimal`）顺序正确 + ≥3 checkbox + ≥1 bash → exit 0 |
| `bad-order.md` | 7 节存在但顺序错乱 → exit 1 |
| `bad-missing-section.md` | 缺少 `## Process` 节 → exit 1 |
| `bad-no-checkbox.md` | Verification 节有 bash 块但无 checkbox → exit 1（AC-1 失败） |
| `bad-no-frontmatter.md` | 缺少 `description:` 或 `rationalizations_count:` → exit 1 |

最小 fixture 集 = **6 个文件**，覆盖 3 个规则轴（anatomy 顺序 / Verification 内容 / frontmatter）。

可选扩展（不阻塞 PR）：
- `bad-no-bash.md`：有 checkbox 但无 bash 块（AC-3 失败）
- `good-minimal-with-frontmatter.md`：optional 专家含 frontmatter 时宽松通过

---

## 5. CI 矩阵

**决策：新建独立 workflow `anatomy-check.yml`**，不扩展 `pr-size-check.yml`。理由：
- 关注点隔离（解剖检查 vs PR 大小检查）
- 未来可独立调整触发条件（如仅在 `.claude/skills/**` 变更时触发）

```yaml
# 草图（不含代码，仅设计意图）
name: anatomy-check
on: [push, pull_request]
jobs:
  check:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - checkout
      - run: bash scripts/check-skill-anatomy.sh .claude/skills/eket/experts/default/*.md
      - run: bash scripts/check-skill-anatomy.sh --minimal <subrepo-path>/experts/**/*.md
        # 是否包含子仓见 §8 开放问题
```

**`continue-on-error: true` 观察期**：与 ticket rollback_plan 一致，首周宽松。

---

## 6. PR 分拆方案

预估总行数：
- `scripts/check-skill-anatomy.sh`：~80-120 行（比 TASK-226 脚本略复杂，多 `--minimal` + frontmatter 逻辑）
- `tests/fixtures/anatomy/`（6 文件）：~120 行（每文件 ~20 行平均）
- `.github/workflows/anatomy-check.yml`：~30 行
- 总计：~230-270 行

**决策：单 PR**（≤300 行，符合 TASK-226 PR-B 149+33 单 PR 先例）。

三部分同一 commit：

```
feat(TASK-224): add check-skill-anatomy.sh + fixtures + CI workflow

- scripts/check-skill-anatomy.sh: state-machine 7-section + --minimal + frontmatter validator
- tests/fixtures/anatomy/: 6 fixture files covering all rule axes
- .github/workflows/anatomy-check.yml: ubuntu + macos matrix
```

---

## 7. 风险表

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| `awk` macOS/Linux 可移植性（macOS = BSD awk，Linux = GNU awk） | 中 | 高 | 使用 POSIX awk 子集（避免 gensub/patsplit）；CI matrix 双平台覆盖 |
| Fixture 维护滞后（模板演化后 fixture 不更新） | 中 | 中 | Fixture 文件命名语义化，README 注明更新规则；建议 pre-commit 也检查 fixture |
| Optional 专家已注入 TODO-skeleton（`- [ ] TODO:`）导致 AC-1 误判为通过 | 高 | 中 | `--minimal` 模式的 checkbox 计数仅统计行存在；TODO 内容可用 grep 区分警告（`--strict` 未来选项）；本期作 WARN 不 FAIL |
| `## Verification` 节内嵌多个 `^## ` 子标题时状态机提前终止 | 低 | 高 | 明确规定 `## Verification` 到文件末尾或下一 `^## ` 为节边界；当前 7 文件均单节无嵌套，fixture 中需覆盖此边界 |
| AC-1 当前全部失败，脚本写好后 CI 立刻红灯 | 高 | 高 | 见 §8 开放问题 Q1；建议 Master 在 TASK-224 开发启动前决定 checkbox 补丁策略 |

---

## 8. 开放问题（给 Master）

**Q1（阻塞性）**：7 个 default 专家 Verification 节目前 **0 checkbox**，AC-1（≥3）全部失败。脚本写完后 CI 会立即红灯。请 Master 决策：
- A：在 TASK-224 同一 PR 内补 checkbox（扩展本 ticket 范围，+7 文件改动）
- B：TASK-224 交付脚本+fixtures，同步开 hotfix-TASK-224-checkbox 补 7 文件（类比 TASK-223 hotfix）
- C：脚本首周用 `continue-on-error: true`，另开 follow-up ticket 补 checkbox

推荐 B：职责隔离，脚本 PR 干净；hotfix 小且独立。

**Q2**：`check-skill-anatomy.sh --minimal` 是否应在 CI 中对子仓（`eket-experts-extended`）53 个 optional 专家全量运行？子仓当前在本机未 push，CI 无法直接 checkout。可选方案：
- A：子仓作为 git submodule 引入主仓，CI 统一检查
- B：子仓独立 workflow（独立 CI 配置）
- C：TASK-224 scope 内仅检查主仓 7 default 专家，子仓留 TASK-227 处理

**Q3（附加）**：`--minimal` 模式下 frontmatter 校验是 SKIP 还是 WARNING？Optional 专家（如 aiml.md）无 `rationalizations_count` 字段；若强制校验，53 文件全部 fail。建议 `--minimal` 跳过 frontmatter 校验，但需 Master 确认。

---

## 任务拆解

| 子任务 | 预估 | 优先级 |
|--------|------|--------|
| 编写 `check-skill-anatomy.sh`（完整模式 + `--minimal` + frontmatter + verbose） | 3h | P0 |
| 创建 6 个 fixture 文件 | 1.5h | P0 |
| 编写 `anatomy-check.yml` workflow | 0.5h | P0 |
| 验证双平台（本机 macOS + CI ubuntu 模拟） | 1h | P0 |
| 更新 ticket 状态 + 提交 PR + 知识沉淀 | 1h | P1 |
| **（待 Master 决策）** 补 7 文件 checkbox（如选方案 B） | 1h | P0 阻塞 |

---

**等待 Master 审批**，特别是 Q1 决策后方可开始编码。
