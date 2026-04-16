# TASK-029: Artifact Schema 标准化 — MetaGPT 借鉴

**Ticket ID**: TASK-029
**标题**: 借鉴 MetaGPT 结构化输出：为 Slaver 执行报告定义 Artifact Schema
**类型**: improvement
**优先级**: P2

**状态**: ready
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14
**started_at**:
**completed_at**:

**负责人**:
**Slaver**:

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-14 | backlog → ready |

---

## 1. 任务描述

借鉴 MetaGPT 的 **ActionOutput / Message Schema** 设计：为 Slaver 在 Ticket 中填写的执行报告（分析报告、PR 描述）定义统一的结构化模板，让 Master 和自动化脚本能可靠提取关键信息。

**问题**：当前 Slaver 执行报告格式自由，导致：
- Master 无法自动提取"测试结果"、"PR 链接"等关键字段
- `master:heartbeat` 统计数据不准确（测试通过数依赖正则猜测）
- Code Review 没有统一格式，漏项概率高

### 具体改动

**Part A — `template/docs/TICKET-RESPONSIBILITIES.md`**

在「Slaver 填写」章节，新增 **执行报告 Schema**：

```markdown
## Slaver 执行报告 Schema（Artifact Schema v1）

Slaver 在 Ticket 的「执行记录」部分填写时，必须包含以下结构化字段：

### 分析报告（analysis → ready 前必填）

```yaml
analysis_report:
  summary: "一句话描述方案"
  approach: "技术方案关键点（1-3 点）"
  risks: "已识别风险（无则填 none）"
  estimated_hours: N  # 预估工时（小时）
  blocked_by: "依赖的 ticket ID 或 none"
```

### 实现报告（in_progress → test 前必填）

```yaml
implementation_report:
  files_changed:
    - "path/to/file1.ts (新增/修改/删除)"
    - "path/to/file2.ts (新增/修改/删除)"
  test_result: "X/Y tests passing"  # 必须是真实命令输出
  pr_link: "https://github.com/..."
  notes: "实现过程中的重要决策（可选）"
```
```

**Part B — `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`**

在「PR 提交前检查」章节末尾新增一条：

```markdown
- [ ] **Artifact Schema 已填写**：Ticket 的执行记录包含 `implementation_report` 结构化字段（test_result 必须是真实命令输出，非描述）
```

**Part C — `scripts/validate-ticket-template.sh`**

新增检查：对 `in_progress` 或 `pr_review` 状态的 ticket，检查是否包含 `implementation_report:` 或 `test_result:` 字段。

```bash
# 在 validate_ticket() 中，in_progress / pr_review 状态检查后添加：
if [[ "$status" == "pr_review" || "$status" == "test" ]]; then
  if ! file_has 'implementation_report:|test_result:' "$file"; then
    issues+=("  ${YELLOW}[WARN]${RESET} pr_review/test 状态缺少 implementation_report（Artifact Schema v1）")
    ticket_warn=$((ticket_warn + 1))
  fi
fi
```

---

## 2. 验收标准

- [ ] `TICKET-RESPONSIBILITIES.md` 包含 `analysis_report:` 和 `implementation_report:` 两个 YAML schema；验证：`grep -c 'analysis_report:\|implementation_report:' template/docs/TICKET-RESPONSIBILITIES.md`
- [ ] `SLAVER-HEARTBEAT-CHECKLIST.md` 包含 Artifact Schema 检查项；验证：`grep -l 'Artifact Schema' template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`
- [ ] `validate-ticket-template.sh` 对 pr_review/test 状态 ticket 输出 WARN（无 implementation_report 字段时）；验证：创建一个 `status: pr_review` 的空 ticket，运行脚本，检查 WARN 输出
- [ ] `npm test` 1112+ 全部通过（脚本更改不影响测试）；验证：`cd node && npm test 2>&1 | tail -3`

---

## 3. 技术方案

纯文档 + bash 脚本改动，无 TypeScript 变更。

- `TICKET-RESPONSIBILITIES.md`：在现有「Slaver 填写」章节之后新增「执行报告 Schema」小节
- `SLAVER-HEARTBEAT-CHECKLIST.md`：在「PR 提交前检查」末尾追加一个 checkbox
- `validate-ticket-template.sh`：在 `validate_ticket()` 函数的 in_progress/done 检查块附近，添加 pr_review/test 状态的 schema 检查

---

## 4. 影响范围

- `template/docs/TICKET-RESPONSIBILITIES.md` — 新增执行报告 Schema 规范
- `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md` — 新增 Artifact Schema 检查项
- `scripts/validate-ticket-template.sh` — 新增 pr_review/test 状态 WARN 检查

---

## 5. blocked_by

无依赖。与 TASK-027/028/030 可并行。
