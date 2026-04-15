# TASK-036: Layer 3b — PR Review 规则校验脚本

**Ticket ID**: TASK-036
**Epic**: RULE-RETENTION
**标题**: 实现 `scripts/validate-ticket-pr.sh` 及 workflow-engine 真实接入
**类型**: feature
**优先级**: P1
**重要性**: high

**状态**: ready
**创建时间**: 2026-04-15
**创建者**: Master
**负责人**: 待领取

**依赖关系**:
- blocks: [TASK-037]
- blocked_by: [TASK-035]

**标签**: `hook`, `shell`, `validation`

---

## 1. 需求概述

### 1.1 功能描述

作为 EKET 框架运维者，我需要一个可执行的 shell 脚本，在 ticket 进入 `pr_review` 状态时自动校验以下规则，以便机器层面拦截不合规 PR，无需 Master 手动检查。

### 1.2 验收标准

- [ ] `scripts/validate-ticket-pr.sh <ticket-id>` 对合规 ticket 返回 exit 0
- [ ] 对缺失 PR 字段的 ticket 返回 exit 1 + `MISSING_PR_URL` 错误
- [ ] 对测试输出为占位符的 ticket 返回 exit 1 + `TEST_OUTPUT_IS_PLACEHOLDER` 错误
- [ ] `workflow-engine.ts` 接入真实脚本（替换 stub）
- [ ] 违规时自动写入 `inbox/human_feedback/violation-{ticketId}-{ts}.md`
- [ ] 验收命令：
  ```bash
  bash scripts/validate-ticket-pr.sh jira/tickets/TASK-035.md; echo "exit: $?"
  grep -l 'validate-ticket-pr' node/src/core/workflow-engine.ts
  cd node && npm test 2>&1 | tail -3
  ```

---

## 2. 技术设计

### 2.1 影响文件

- `scripts/validate-ticket-pr.sh` — 新建校验脚本
- `node/src/core/workflow-engine.ts` — 替换 stub 为真实 execFile 调用
- `test-fixtures/valid-ticket.md` — 新建合规 ticket fixture
- `test-fixtures/invalid-ticket-no-pr.md` — 新建不合规 fixture

### 2.2 校验规则（4条）

1. **TICKET_FILE_NOT_FOUND**：ticket 文件存在
2. **MISSING_PR_URL**：PR 字段非空（`^PR:` 或 `pr_link:` 行）
3. **MISSING_TEST_OUTPUT**：存在 `## Test Output` 或类似字段
4. **TEST_OUTPUT_IS_PLACEHOLDER**：测试输出不含"截图/手动/todo/tbd"

### 2.3 违规上报格式

```markdown
# Hook 违规报告 — {ticketId}

**时间**: {ISO8601}
**触发事件**: status → pr_review
**违规项**:
- {error1}
- {error2}

请修复后重新推进状态。
```

### 2.4 TypeScript 调用（替换 stub）

```typescript
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

async function runPrePrReviewHook(ticketId: string): Promise<Result<void>> {
  try {
    const { stdout } = await execFileAsync(
      'bash',
      ['scripts/validate-ticket-pr.sh', ticketId],
      { timeout: 60_000 }
    );
    logger.info({ msg: 'Hook passed', ticketId, output: stdout });
    return { success: true, data: undefined };
  } catch (e: unknown) {
    const error = e as { stdout?: string };
    await writeViolationReport(ticketId, error.stdout ?? 'Unknown hook failure');
    return {
      success: false,
      error: { code: EketErrorCode.HOOK_BLOCKED, message: error.stdout ?? 'Hook failed' }
    };
  }
}
```

---

## 4. 执行记录

### 4.1 领取信息
- **领取者**: 待填写
- **领取时间**: 待填写
- **预计工时**: 4h

### 4.2 状态流转

| 时间 | 状态变更 | 操作者 | 备注 |
|------|----------|--------|------|
| 2026-04-15 | backlog → ready | Master | 初始创建，blocked_by TASK-035 |
