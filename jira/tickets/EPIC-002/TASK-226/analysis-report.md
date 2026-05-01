# 任务分析报告：TASK-226

**Slaver**: slaver-002
**分析时间**: 2026-04-27
**预计工时**: 6h
**ticket**: TASK-226 — Rule of 500 + ~100 行 PR 上限 → 写入 RULES + CI

---

## 1. 需求理解

借鉴 addyosmani/agent-skills 的两条高 ROI 习惯，将其制度化进 EKET：

- **Rule of 500**：单次重构净变更 > 500 行禁止逐行手改，必须使用 codemod / AST 工具。
- **PR Sizing**：单个 PR 净变更 ≤ ~100 行；超出需 Master 显式审批（`--allow-large-pr` 或 PR body 中 `Approved-Large-PR-By: <master-id>`）。

落地三件事：
1. 在 `template/docs/MASTER-RULES.md` 与 `template/docs/SLAVER-RULES.md` 各加 2 条新红线（措辞需对齐现有 "Rule N：xxx" / "**红线**" 风格）。
2. 交付 `scripts/check-pr-size.sh`：对 PR 全量 diff 计算"净变更行数"并按阈值返回 fail / warn / silent。
3. 在 GitHub Actions 中接入该脚本，仿 `pr-body-check.yml` 的写法，作为 PR check 之一。

专家组 U-2 决议固定净变更定义：**净变更 = 全量 diff − generated 文件 − migration / lockfile − 纯注释行 − 空白行**。

合规性约束（来自 ticket AC-6）：本 ticket 自身 PR 必须 ≤ 200 行（meta 自洽）。

---

## 2. 技术方案

### 2.1 RULES 红线文案草案

#### MASTER-RULES.md（追加到 §6 Master Hard Rules，作为 Rule 8 / 9，保持原有 "Rule N：xxx" 编号风格）

```markdown
### Rule 8：Rule of 500 — 大重构必须工具化

单次重构 **净变更 > 500 行**（去 generated / migration / lock / 注释 / 空白）时：
- **禁止**逐行手改，必须使用 codemod / AST 工具（`jscodeshift`, `ts-morph`, `comby`, `ruff` rewrite 等）
- PR description 必须注明所用工具及命令复现步骤
- 例外：`Approved-Large-PR-By: <master-id>` 显式审批后允许人工，但必须在 PR description 解释为何不能 codemod

> CI 校验：`scripts/check-pr-size.sh` 在净变更 > 500 行且无审批时直接 fail。

### Rule 9：PR Sizing — 单 PR ~100 行上限

单个 PR **净变更 ≤ ~100 行**（同样剔除 generated / migration / lock / 注释 / 空白）：
- ≤ 100 行：silent pass
- 100 ~ 500 行：warn（pass，但 Reviewer 提示"考虑拆分"）
- \> 500 行：fail（除非 PR description 含 `Approved-Large-PR-By: <master-id>`）
- 超限 PR 必须先 Master 在 review_request 上显式批准 + 在 PR body 写入 trailer

> 豁免标志：`Approved-Large-PR-By: <master-id>`（解析方式见 `scripts/check-pr-size.sh`）。
```

#### SLAVER-RULES.md（追加到 §6 Slaver Hard Rules，作为 Rule 4 / 5，与现有 3 条平铺）

```markdown
### Rule 4：Rule of 500 — 净变更 > 500 行禁止逐行手改

执行重构 / 大批量替换时，提交前先在本地跑：
```
bash scripts/check-pr-size.sh --base=origin/<target>
```
若净变更 > 500 行：
- **禁止**继续逐行 Edit；必须切换 codemod / AST 工具完成
- 否则上报 BLOCKED 给 Master 申请 `Approved-Large-PR-By` 豁免，写明无法 codemod 的根因

### Rule 5：PR Sizing — 单 PR 控制 ~100 行净变更

提交 PR 前必须自检 `bash scripts/check-pr-size.sh`：
- 100 ~ 500 行：在 PR description 解释拆分困难
- \> 500 行：必须先获得 Master 审批 trailer `Approved-Large-PR-By: <master-id>`
- **禁止**为绕过阈值人为拆 commit 但合并到一个 PR；CI 算的是 PR 级 diff 总和
```

### 2.2 `scripts/check-pr-size.sh` 伪代码

```bash
#!/usr/bin/env bash
# check-pr-size.sh — 净变更行数检查（Rule of 500 + ~100 行 PR）
#
# 用法:
#   bash scripts/check-pr-size.sh                          # 默认 BASE=origin/main, HEAD=HEAD
#   bash scripts/check-pr-size.sh --base=origin/testing
#   bash scripts/check-pr-size.sh --allow-large-pr         # 强制 pass（CI 不可用，仅本地）
#   bash scripts/check-pr-size.sh --pr-body-file=BODY.md   # CI 模式：解析 PR body 找 trailer
#
# 退出码:
#   0   silent pass / warn pass
#   1   fail (净变更 > 500 行 且 无审批)
#   2   参数错误
#
# Threshold:
#   WARN_THRESHOLD=100
#   FAIL_THRESHOLD=500
set -u

# === 1. 解析参数 ===
BASE="origin/main"
PR_BODY=""
ALLOW_LARGE=0
for arg in "$@"; do
  case "$arg" in
    --base=*)         BASE="${arg#--base=}" ;;
    --pr-body-file=*) PR_BODY="$(cat "${arg#--pr-body-file=}")" ;;
    --allow-large-pr) ALLOW_LARGE=1 ;;
    *) echo "unknown arg $arg"; exit 2 ;;
  esac
done

# === 2. 解析 PR body 中的 Master 审批 trailer ===
APPROVED=0
if [[ -n "$PR_BODY" ]] && \
   echo "$PR_BODY" | grep -qE '^Approved-Large-PR-By:[[:space:]]*[a-z0-9_-]+'; then
  APPROVED=1
fi

# === 3. 收集变更文件清单（剔除排除清单）===
EXCLUDE_PATTERNS=(
  '*.lock' 'package-lock.json' 'yarn.lock' 'pnpm-lock.yaml' 'Cargo.lock' 'poetry.lock'
  '*/migrations/*' '*/migration/*'
  '*.generated.*' '*.gen.go' '*_pb.go' '*_pb2.py' '*.pb.go'
  'dist/*' 'build/*' 'node_modules/*' 'target/*'
  '*.svg' '*.png' '*.jpg' '*.gif' '*.ico'  # 二进制图片
  '*.min.js' '*.min.css'
)

# 把排除清单组装成 git pathspec exclude
PATHSPEC=( ":(exclude,glob).git/*" )
for p in "${EXCLUDE_PATTERNS[@]}"; do
  PATHSPEC+=( ":(exclude,glob)$p" )
done

# === 4. 计算净变更行数 ===
# 思路：git diff --numstat 拿 added+removed，再用 awk 过滤 generated 提示
#   - 仅统计 added 行（净增加），不计 removed（避免重命名+大段删改导致虚高）
#   - 但是为了体现"重构"语义，本脚本采用 added+removed（与 addyosmani 原文一致）
#   - 注释 / 空白 通过逐文件 diff -U0 + awk 过滤后再算

NET_LINES=0
WARN_LINES=0  # 含注释/空白的"原始" added+removed，仅作 debug

while IFS=$'\t' read -r added removed file; do
  [[ "$added" == "-" || "$removed" == "-" ]] && continue   # binary file 跳过
  # generated 标记文件检测（兜底：文件首部含 "Code generated" / "DO NOT EDIT"）
  if git show "$BASE:$file" 2>/dev/null | head -5 | grep -qiE 'code generated|do not edit|@generated'; then
    continue
  fi

  # 逐文件取 unified=0 diff，过滤纯注释 + 空行
  while IFS= read -r line; do
    case "$line" in
      '+'*|'-'*)
        # 跳过 diff header (+++ / ---)
        case "$line" in '+++ '*|'--- '*) continue ;; esac

        # 取 + 或 - 后的实际内容
        content="${line:1}"
        # 去前后空白
        trimmed="$(echo "$content" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
        # 跳过空白行
        [[ -z "$trimmed" ]] && continue
        # 跳过纯注释行（按文件后缀粗粒度判断）
        case "$file" in
          *.js|*.ts|*.tsx|*.jsx|*.go|*.rs|*.java|*.c|*.cpp|*.h)
            [[ "$trimmed" =~ ^// ]] && continue
            [[ "$trimmed" =~ ^/\* || "$trimmed" =~ ^\* || "$trimmed" =~ \*/$ ]] && continue
            ;;
          *.py|*.sh|*.yml|*.yaml|*.toml)
            [[ "$trimmed" =~ ^# ]] && continue
            ;;
          *.md)
            : # markdown 不算注释，全计
            ;;
        esac
        NET_LINES=$((NET_LINES+1))
        ;;
    esac
  done < <(git diff -U0 "$BASE"...HEAD -- "$file")
done < <(git diff --numstat "$BASE"...HEAD -- "${PATHSPEC[@]}")

# === 5. 判定 ===
echo "净变更行数（去 generated/migration/lock/注释/空白）: $NET_LINES"

if (( NET_LINES > 500 )); then
  if (( APPROVED == 1 || ALLOW_LARGE == 1 )); then
    echo "⚠ > 500 行，但有审批 (Approved-Large-PR-By 或 --allow-large-pr) — pass with warning"
    exit 0
  fi
  echo "✗ FAIL: 净变更 $NET_LINES > 500，且无 Master 审批 trailer"
  echo "  豁免：在 PR body 添加 'Approved-Large-PR-By: <master-id>'"
  exit 1
fi

if (( NET_LINES > 100 )); then
  echo "⚠ WARN: 净变更 $NET_LINES > 100 — 建议拆分"
  exit 0
fi

echo "✓ PASS: 净变更 $NET_LINES ≤ 100"
exit 0
```

### 2.3 GitHub Actions step YAML 草案

新建 `.github/workflows/pr-size-check.yml`（仿 `pr-body-check.yml`）：

```yaml
name: pr-size-check

on:
  pull_request:
    types: [opened, edited, synchronize, reopened]

permissions:
  pull-requests: read
  contents: read

jobs:
  check-pr-size:
    runs-on: ubuntu-latest
    # rollback_plan: 上线 1 周用 continue-on-error 观察
    continue-on-error: true
    steps:
      - name: Checkout (with full history)
        uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 必须，否则拿不到 origin/<base>

      - name: Write PR body to file
        env:
          PR_BODY: ${{ github.event.pull_request.body }}
        run: printf '%s' "$PR_BODY" > /tmp/pr_body.md

      - name: Check PR size
        run: |
          BASE_REF="${{ github.event.pull_request.base.ref }}"
          git fetch origin "$BASE_REF"
          bash scripts/check-pr-size.sh \
            --base="origin/$BASE_REF" \
            --pr-body-file=/tmp/pr_body.md
```

### 2.4 `--allow-large-pr` + `Approved-Large-PR-By:` 解析方案

| 通道 | 作用 | 解析方式 |
|------|------|---------|
| `--allow-large-pr` 命令行 flag | 本地开发者自检时绕过 fail（不影响 CI） | bash 参数解析 |
| `Approved-Large-PR-By: <master-id>` PR body trailer | CI 中 Master 审批后豁免 | `--pr-body-file` 注入 + `grep -qE '^Approved-Large-PR-By:'` |
| `large-pr-approved` GitHub label（备选） | 不改 PR body 的轻量豁免 | 后续迭代再加，本期不实现 |

`<master-id>` 格式约束：`master-[0-9a-z_-]+`（与 `.eket/IDENTITY.md` 命名一致）。CI 中可加二次校验：trailer 出现 ≠ 出现在引用块内（避免 reviewer 复述 trailer 误触发）。

---

## 3. 影响面分析

| 影响模块 | 影响程度 | 说明 |
|---------|---------|------|
| `template/docs/MASTER-RULES.md` | 中 | 追加 Rule 8 / Rule 9（约 30 行 markdown） |
| `template/docs/SLAVER-RULES.md` | 中 | 追加 §6 Rule 4 / Rule 5（约 25 行 markdown） |
| `scripts/check-pr-size.sh` | 高（新增） | 单文件 ~120 行 bash，CI + 本地双用 |
| `.github/workflows/pr-size-check.yml` | 中（新增） | 单 job，~30 行 YAML |
| `tests/fixtures/pr-size/` | 中（新增） | 4 份 fixture diff（80 / 200 / 600 / 600+approval），<200 行总计 |
| 现有 `pr-body-check.yml` | 无 | 不耦合，pr-size 是平行 job |
| Slaver 工作流 | 高 | 所有 Slaver 提 PR 前必须本地预跑（或接受 CI 反馈） |

预计总 PR 净变更 ≈ 30 (MASTER) + 25 (SLAVER) + 120 (script) + 30 (yaml) + ~30 (fixtures, 大部分 generated 不算) ≈ **180~220 行**，与 ticket AC-6 的 ≤ 200 行限制贴边，需要分拆或借用首期"特批 200" 约定（与专家组分歧记录中"EPIC 内特批 ~300 行"对齐）。

---

## 4. 任务拆解（4 子任务）

| 子任务 | 内容 | 预估工时 | 优先级 |
|--------|------|---------|-------|
| ST-1：RULES 红线文案 | 在 MASTER-RULES.md / SLAVER-RULES.md 添加 4 条红线，对齐现有编号风格 | 1h | P0 |
| ST-2：`scripts/check-pr-size.sh` | 实现伪代码 + 自带 `--self-test` 跑 fixture | 2.5h | P0 |
| ST-3：`.github/workflows/pr-size-check.yml` | 新增 workflow，开 `continue-on-error: true` 观察期 | 1h | P0 |
| ST-4：测试 fixture | `tests/fixtures/pr-size/{80,200,600,600-approved}.diff` + 调用 `check-pr-size.sh` 的 unit test 包装 | 1.5h | P1 |

提交顺序建议：ST-1 + ST-4 + ST-2 一起（核心交付） → ST-3（workflow 接入，先 continue-on-error）。如总行数超 200，拆为两个 PR（PR-A: RULES + fixtures，PR-B: 脚本 + workflow）。

---

## 5. 风险

| 风险 | 可能性 | 影响 | 缓解 |
|------|-------|------|------|
| **bash 跨平台**：macOS BSD `sed` / `awk` 与 GNU 行为差异（`sed -E`、`awk` 字段），Slaver 在 macOS 本地跑可能与 CI（Ubuntu）输出不一致 | M | M | 仅用 POSIX 子集 + bash 内置（`[[`、`echo`、参数展开），避免 `sed -i`，CI 跑 ubuntu-latest 为权威；本地差异在脚本头加 `# tested: bash 3.2+ / 5.x` |
| **generated 文件识别歧义**：U-2 决议未列具体清单；项目里 `dist/` `target/` `*_pb.go` `package-lock.json` 都得算，但社区贡献的 skill MD 是否算 generated（脚手架生成）有争议 | H | M | 1) 排除清单固化在脚本中（白名单 + 文件头标记 `@generated` / `Code generated` / `DO NOT EDIT`）；2) PR description 可显式添加 `Generated-Files: <glob>` 二级豁免 |
| **误报**：纯重命名 / 大段格式化导致 added+removed 虚高，但实质代码无变化 | M | H | 第一周 `continue-on-error: true` 观察；提供 `--dry-run` 输出供 Slaver 申诉；后续可改用 `git diff --numstat` 加 `--ignore-all-space` 修订 |
| **注释行识别太粗**：脚本只按后缀粗判，跨行 `/* ... */` 块注释、Python docstring（`"""`）会被算成普通行 | M | M | 文档明示"近似口径，如有质疑提交 `Comments-Only: <files>` 在 PR body 自证"；下次迭代再上 AST |
| **`Approved-Large-PR-By` trailer 滥用**：Slaver 在 PR body 自填 master-id 绕过 | M | H | 后续 CI 阶段加二次校验：从 `outbox/review_requests/<ticket>/approval.md` 反查 master 签名；本期仅做格式校验 + Master review checklist 增加该项 |
| **Rule of 500 与首期 EPIC-002 自身冲突**：60 个 optional 专家批量改极易破规 | H | M | EPIC-002 内特批 1 次放宽至 ~300 行/PR（专家组已决议），脚本一上线即在 PR body 注入 `Approved-Large-PR-By: master-001` |
| **`fetch-depth: 0` 在大仓库慢** | L | L | 接受首次 ~30s 成本；后续可缓存 |

---

# Step 5 输出

## A. 报告路径

```
jira/tickets/EPIC-002/TASK-226/analysis-report.md
```

## B. 净变更定义（U-2 决议的可执行规则清单）

净变更 = 全量 PR diff 的 `added + removed` 行数，逐项扣除以下：

1. **Lockfile**：`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` / `Cargo.lock` / `poetry.lock` / 任何 `*.lock`
2. **Migration**：路径含 `migrations/` 或 `migration/`（DB schema 自动生成 / 不手改）
3. **Generated 标记文件**：
   - 路径 glob：`dist/*` `build/*` `target/*` `node_modules/*`
   - 文件名：`*.generated.*` `*.gen.go` `*_pb.go` `*_pb2.py` `*.pb.go` `*.min.js` `*.min.css`
   - 文件头 5 行内含 `Code generated` / `DO NOT EDIT` / `@generated`（来自 `BASE` 版本）
4. **二进制 / 媒体**：`*.svg` `*.png` `*.jpg` `*.gif` `*.ico`（git diff 表现为 `-`/`-`，自然跳过）
5. **空白行**：trim 后为空字符串的 `+` / `-` 行
6. **纯注释行**（按文件后缀粗判）：
   - JS/TS/Go/Rust/Java/C 系：以 `//` 开头，或行首是 `/*` `*` 或行尾 `*/`
   - Python/Shell/YAML/TOML：以 `#` 开头
   - Markdown 不扣（文档变更等同代码计数）

未被上述任一条命中的 `+` / `-` 行 = 1 行净变更。

## C. 应该追问 Master 的 1 个问题

> **`Approved-Large-PR-By: <master-id>` 的"权威来源"在哪里？**
>
> 当前方案让 Slaver 自己在 PR body 写一行 trailer 就能绕过 fail——这给 anti-rationalization 留了大门（Slaver 可在压力下"假传圣旨"自填 master-id）。要不要在本 EPIC 内同步加一条配套约束：CI 必须从 `outbox/review_requests/<ticket-id>/approval-large-pr.md` 中反查 master 的签名文件存在 + Trailer 的 master-id 必须与该文件中的发起人一致，否则即使 trailer 存在也判 fail？
>
> 决策影响：若 yes，TASK-226 工时从 6h 升到 ~9h，且需新增"Master 签发审批文件"流程，可能要切到 TASK-227 或新拆 TASK-228；若 no，本期信任 Master review 兜底，但需在 MASTER-RULES Rule 8/9 显式注明"Master 在 PR review 时必须二次校验该 trailer"。
