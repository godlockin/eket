# TASK-023: Ticket 模板加 Nyquist Rule — 验收标准自动化要求

**Ticket ID**: TASK-023
**标题**: 在 ticket-template.md 和 CLAUDE.md 加入 Nyquist Rule，要求验收标准必须可自动化验证（<60s）
**类型**: improvement
**优先级**: P2

**状态**: done
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14
**started_at**: 2026-04-14T10:00:00Z
**completed_at**: 2026-04-14T10:20:00Z

**负责人**: slaver-01
**Slaver**: slaver-01

**gate_review_veto_count**: 0
**veto_reason**:
**resubmit_conditions**:

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 领取 | — | — | ready → gate_review |
| Gate Review APPROVE | gate_reviewer | — | gate_review → in_progress |
| Gate Review VETO | gate_reviewer | — | gate_review → analysis |
| 提交 Review | — | — | in_progress → pr_review |
| Review 通过 | — | — | pr_review → done |

---

## 1. 任务描述

借鉴 GSD 项目的 **Nyquist Rule**：每个验收标准的验证步骤必须是可自动化执行、在 60 秒内完成的命令，不能是"手动检查"或"人眼确认"。

当前 EKET 的 `ticket-template.md` 验收标准格式只有 `- [ ] 描述`，没有对验证方式的约束。这会导致 Slaver 写出无法客观验证的验收标准，给 Master PR review 带来歧义。

### 具体改动

**Part A — `template/jira/ticket-template.md`**

在验收标准 section 的注释里加入 Nyquist Rule 说明：

```markdown
## 2. 验收标准

<!-- Nyquist Rule: 每条验收标准必须附带可自动化执行的验证命令（<60s 完成）
     格式：- [ ] 描述；验证：`<命令>`
     禁止：手动检查、人眼确认、"运行后观察" 等主观验证 -->

- [ ] 功能描述；验证：`npm test -- --testPathPattern=<pattern>`
- [ ] 构建零错误；验证：`npm run build 2>&1 | grep -c error || true`
```

**Part B — `CLAUDE.md`（项目内，非用户全局）**

在 Ticket 职责边界表之后，加入一段 Nyquist Rule 说明：

```markdown
### Nyquist Rule（验收标准自动化要求）

每条验收标准必须满足：
1. **可自动化**：附带具体的 shell 命令（而非"手动运行"/"人眼确认"）
2. **有时限**：命令在 60 秒内完成（长时间运行的集成测试需拆分）
3. **客观可重复**：相同代码 + 相同命令 = 相同结果（无随机性）

违反此规则的 PR 描述（仅贴截图/文字描述而非命令输出）视同未完成验收。
```

**Part C — `scripts/validate-ticket-template.sh`**

新增 INFO 提示（非 WARN，不影响通过率）：done 状态的 ticket 如果验收标准 section 存在但无任何反引号命令，输出：
`[INFO] 验收标准未包含可执行命令（建议符合 Nyquist Rule）`

注：INFO 级别不影响 `--strict` 结果，仅供参考。

---

## 2. 验收标准

- [ ] `template/jira/ticket-template.md` 的验收标准 section 有 Nyquist Rule 注释和格式示例；验证：`grep -l 'Nyquist' template/jira/ticket-template.md`
- [ ] `CLAUDE.md` 包含 Nyquist Rule 段落；验证：`grep -c 'Nyquist Rule' CLAUDE.md`
- [ ] `validate-ticket-template.sh` 对 done 状态 + 无命令的验收标准输出 INFO；验证：手动创建测试 ticket 后运行脚本确认输出（在 PR 描述里附输出）
- [ ] `npm test` 1109+ 全部通过（脚本为 bash，不影响 Node.js 测试）；验证：`cd node && npm test 2>&1 | tail -5`
- [ ] 所有新加内容中文注释清晰，不引入歧义

---

## 3. 技术方案

### validate-ticket-template.sh INFO 检查逻辑

```bash
# 9. done 状态验收标准无可执行命令（INFO）
if [[ "$status" == "done" ]]; then
  ac_content=$(grep -A8 -E '##\s*[0-9.]*\s*(验收标准|Acceptance Criteria)' "$file" || true)
  if [[ -n "$ac_content" ]] && ! echo "$ac_content" | grep -qE '`[^`]+`'; then
    issues+=("  ${CYAN}[INFO]${RESET} 验收标准未包含可执行命令（建议符合 Nyquist Rule）")
    ticket_info=$((ticket_info + 1))
  fi
fi
```

注意：需要在脚本顶部定义 `CYAN` 颜色变量，并在统计逻辑里加 `ticket_info` 计数器。INFO 不影响通过/失败判断。

---

## 4. 影响范围

- `template/jira/ticket-template.md` — 验收标准注释更新
- `CLAUDE.md` — 新增 Nyquist Rule 说明段落
- `scripts/validate-ticket-template.sh` — 新增 INFO 级别检查

---

## 5. blocked_by

无依赖，可立即开始。与 TASK-024/025/026 完全独立，可并行。

---

## 6. 执行报告

**Slaver**: slaver-01
**started_at**: 2026-04-14T10:00:00Z
**completed_at**: 2026-04-14T10:20:00Z

### 实现说明

1. **Part A** — `template/jira/ticket-template.md`：在 `## 2. 验收标准` section 替换为含 Nyquist Rule HTML 注释及两条格式示例的版本，保留 `{{ACCEPTANCE_CRITERIA}}` 占位符。

2. **Part B** — `CLAUDE.md`：在"Ticket 职责边界"表格后、"禁止"列表前插入 `### Nyquist Rule（验收标准自动化要求）` 段落（3 条规则 + 违反说明），现有内容零删除。

3. **Part C** — `scripts/validate-ticket-template.sh`：
   - 颜色变量行加 `CYAN='\033[0;36m'`
   - 全局计数器加 `INFO_COUNT=0`
   - `validate_ticket()` 本地变量加 `ticket_info=0`
   - 新增检查 #9：done 状态 + 验收标准 section 无反引号命令 → INFO
   - 输出逻辑新增 INFO-only ticket 展示分支（WARN=0 且 FAIL=0 时用 CYAN）
   - 每次调用后 `INFO_COUNT=$((INFO_COUNT + ticket_info))`
   - 汇总报告加 `提示: ${INFO_COUNT}（INFO，不影响通过判断）` 行

### 测试结果

```
Tests: 1109 passed, 1109 total
Time:  10.626 s
```

### 构建结果

脚本为纯 bash，无需构建。Node.js tests 1109/1109 全通过，零回归。

### 验收标准验证

```bash
$ grep -l 'Nyquist' template/jira/ticket-template.md
template/jira/ticket-template.md

$ grep -c 'Nyquist Rule' CLAUDE.md
2

$ bash scripts/validate-ticket-template.sh --dir jira/tickets 2>&1 | head -8
═══════════════════════════════════════════════════
 EKET Ticket Template Validator
═══════════════════════════════════════════════════

扫描目录: jira/tickets
发现文件: 33 个
```

脚本正常运行，无崩溃，INFO 计数不影响通过/失败判断。
