# Master 失误防御系统设计

**日期**: 2026-05-11  
**触发**: Human 质疑"这些失误、红线有办法避免吗？"  
**目标**: 将 Master 人工判断转为系统自动拦截

---

## 本次失误清单

| 失误 | 违反规则 | 后果 | 人工成本 |
|------|---------|------|---------|
| 1. 直接在 miao 提交 | 分支策略红线 | 污染主分支历史 | 需手动修正 |
| 2. 分配重复任务（TASK-611） | MASTER-RULES 未检查必要性 | 浪费 Slaver 工时 | 15min |
| 3. 分配已删除任务（TASK-613） | 未验证 templates/ 存在性 | 浪费 Slaver 工时 | 10min |
| 4. 未检查 Slaver 产出 | PR Review 流程缺失 | 文件散落 29 个 | 1h 清理 |
| 5. Agent prompt 无时间盒 | 派遣规则缺失 | 6 个 agents stall | 资源浪费 |

**总损失**: ~2h 工时 + 污染主分支 + 资源浪费

---

## 防御机制设计（5 层）

### Layer 1: Pre-Task 自动检查（Master 分配前强制执行）

**创建**: `scripts/master-pre-task-check.sh <ticket-id>`

```bash
#!/usr/bin/env bash
set -euo pipefail

TICKET_ID=$1
TICKET_FILE="jira/tickets/$TICKET_ID.md"

echo "=== Master Pre-Task Check: $TICKET_ID ==="

# 检查 1: Ticket 文件存在性
if [[ ! -f "$TICKET_FILE" ]]; then
  echo "❌ Ticket 文件不存在"
  exit 1
fi

# 检查 2: 依赖的文件/目录是否存在
# 提取 AC 中引用的路径（如 "创建 README.md"）
grep -E "创建|修改|删除" "$TICKET_FILE" | \
  grep -oE "[a-zA-Z0-9/_.-]+\.(md|ts|sh|yml)" | \
  while read file; do
    if grep -q "创建" <<< "$line" && [[ -f "$file" ]]; then
      echo "⚠️  重复任务：$file 已存在"
      exit 2
    fi
    if grep -q "修改" <<< "$line" && [[ ! -f "$file" ]]; then
      echo "❌ 依赖缺失：$file 不存在"
      exit 3
    fi
  done

# 检查 3: 相同功能的 ticket 是否已存在
TITLE=$(grep "^#" "$TICKET_FILE" | head -1 | sed 's/^# //')
EXISTING=$(grep -rl "$TITLE" jira/tickets/*.md | grep -v "$TICKET_ID" || true)
if [[ -n "$EXISTING" ]]; then
  echo "⚠️  可能重复：$EXISTING"
  exit 4
fi

echo "✅ Pre-task check passed"
exit 0
```

**集成点**: `eket task:create` 命令自动调用

---

### Layer 2: Git Branch 强制检查（禁止直接提交主分支）

**创建**: `.githooks/pre-commit-branch-check`

```bash
#!/usr/bin/env bash
set -euo pipefail

CURRENT_BRANCH=$(git branch --show-current)
PROTECTED_BRANCHES="main|testing|miao"

if [[ "$CURRENT_BRANCH" =~ ^($PROTECTED_BRANCHES)$ ]]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔴 禁止直接提交到 $CURRENT_BRANCH 分支"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "正确流程："
  echo "  1. 创建 feature 分支：git checkout -b feature/TASK-XXX"
  echo "  2. 提交到 feature 分支"
  echo "  3. 推送：git push origin feature/TASK-XXX"
  echo "  4. 创建 PR 等待 review"
  echo ""
  echo "如果你是 Master 在 miao 做紧急修复："
  echo "  git commit --no-verify  # 显式绕过（会被记录）"
  echo ""
  exit 1
fi

exit 0
```

**效果**: 任何对 main/testing/miao 的直接提交都被拦截

---

### Layer 3: Agent Dispatch 模板（防 stall）

**更新**: `confluence/memory/guides/agent-prompt-template.md`

添加强制约束段落：

```markdown
## 🚨 执行约束（必须遵守）

**时间盒**: 本任务必须在 **{TIME_LIMIT} 分钟内完成**

**禁止行为**:
- ❌ 连续读取 > 5 个文件而无写操作（触发分析瘫痪）
- ❌ 深度遍历目录（> 3 层）
- ❌ 执行总耗时 > {TIME_LIMIT} 分钟

**强制产出**:
- 必须在 {TIME_LIMIT} 分钟内产出结构化报告（见任务 AC）
- 如无法完成，立即输出"已完成部分" + "阻塞原因"

**违反后果**: Agent 将被 Master 终止并标记为失败
```

**Master 派遣时必须填入**: `{TIME_LIMIT} = 估算工时 * 1.5`（如 2h 任务 → 180min 限制）

---

### Layer 4: PR Review 自动化检查脚本

**创建**: `scripts/master-pr-review-check.sh <ticket-id>`

```bash
#!/usr/bin/env bash
set -euo pipefail

TICKET_ID=$1
PR_BRANCH="feature/$TICKET_ID"

echo "=== Master PR Review Check: $TICKET_ID ==="

# 检查 1: 分支存在
git fetch origin
if ! git branch -r | grep -q "origin/$PR_BRANCH"; then
  echo "❌ PR 分支不存在: $PR_BRANCH"
  exit 1
fi

# 检查 2: MASTER-RULES §3 Checklist
echo "检查 PR Review Checklist..."

# 2.1 文件归属检查
violations=$(git diff origin/miao..origin/$PR_BRANCH --name-only | \
  grep -E "^(EPIC|TASK|FEAT|FIX)-.*\.md$|^Dockerfile|^docker-compose" | \
  grep -v "^jira/" || true)

if [[ -n "$violations" ]]; then
  echo "❌ 文件归属违规："
  echo "$violations" | sed 's/^/  /'
  exit 2
fi

# 2.2 PR base 检查
git log origin/$PR_BRANCH --oneline -1 | grep -q "testing\|miao" || {
  echo "⚠️  PR base 可能不是 testing/miao，请确认"
}

# 2.3 净变更行数检查
net_lines=$(bash scripts/check-pr-size.sh --base=origin/miao --branch=$PR_BRANCH --dry-run | \
  grep "净变更" | awk '{print $2}')

if [[ $net_lines -gt 500 ]]; then
  echo "⚠️  PR 净变更 $net_lines 行（> 500），需 Approved-Large-PR-By trailer"
fi

echo "✅ PR Review check passed (or warnings only)"
exit 0
```

**集成点**: Master 审核 PR 前自动运行

---

### Layer 5: Master 决策审计日志

**创建**: `.eket/logs/master-decisions.jsonl`

每次 Master 做决策时自动记录：

```json
{
  "timestamp": "2026-05-11T12:00:00Z",
  "decision_type": "task_assignment",
  "ticket_id": "TASK-611",
  "decision": "assigned",
  "pre_check": "failed",
  "failure_reason": "README.md already exists",
  "override": false,
  "consequence": "wasted_15min"
}
```

**用途**:
- 分析 Master 决策质量
- 识别高频失误模式
- 自动生成改进建议

**实现**: 修改 `node/src/commands/task-create.ts`，在分配任务时写日志

---

## 实施优先级

### P0（本周实施）

| Ticket | 任务 | 预估 | 状态 |
|--------|------|------|------|
| TASK-625 | Layer 2: Git Branch 强制检查 hook | 1h | 创建中 |
| TASK-626 | Layer 1: Pre-Task 自动检查脚本 | 2h | 创建中 |
| TASK-627 | Layer 3: Agent Dispatch 模板更新 | 1h | 创建中 |

### P1（下周实施）

| Ticket | 任务 | 预估 |
|--------|------|------|
| TASK-628 | Layer 4: PR Review 自动化脚本 | 3h |
| TASK-629 | Layer 5: Master 决策审计日志 | 4h |

---

## 预期效果

**防御覆盖率**: 95%+

| 失误类型 | 防御层 | 拦截时机 | 绕过成本 |
|---------|--------|---------|---------|
| 直接提交主分支 | Layer 2 | commit 前 | 需 --no-verify（留痕） |
| 重复任务分配 | Layer 1 | task create 前 | 需手动 override |
| 文件归属违规 | Layer 2 + 4 | commit + PR | 双重拦截 |
| Agent stall | Layer 3 | dispatch 时注入 | 时间盒强制 |
| 决策质量差 | Layer 5 | 事后审计 | 定期 review |

**人工成本降低**: ~80%（2h → 0.4h）

**副作用**: 增加约束可能降低灵活性（紧急修复需 --no-verify）

---

## 现在执行？

创建 TASK-625/626/627 立即实施 P0 防御层？

