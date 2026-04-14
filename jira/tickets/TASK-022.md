# TASK-022: validate-ticket-template.sh 覆盖新字段 + master:heartbeat 加 rejectedCount

**Ticket ID**: TASK-022
**标题**: 校验脚本适配新字段；master:heartbeat 新增 Slaver 过载检测（rejectedCount / busy ratio）
**类型**: improvement
**优先级**: P2

**状态**: ready
**创建时间**: 2026-04-14
**最后更新**: 2026-04-14

**负责人**: 待领取
**Slaver**: 待领取

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

**依赖**：TASK-021 完成后 ticket 模板会新增 `started_at`/`completed_at` 字段；
本 ticket 在其基础上做收尾工作，让校验脚本感知这些字段，并在 heartbeat report 加上过载维度。

### Part A — validate-ticket-template.sh 适配

当前脚本的 WARN 检查列表里，对 `gate_review_veto_count` 做了缺失警告。
新增两个检查：

1. **WARN**：`in_progress` 状态的 ticket 缺少 `started_at` 字段
   - 原因：Slaver 应在领取任务进入 in_progress 时写入，缺失说明 Slaver 没按规范操作
   - 提示文本：`[WARN] in_progress 状态缺少 started_at 字段（Slaver 应在领取时填写）`

2. **WARN**：`done` 状态的 ticket 缺少 `completed_at` 字段
   - 原因：任务完成时 Slaver 应写入，缺失影响 master:heartbeat 均值统计
   - 提示文本：`[WARN] done 状态缺少 completed_at 字段（影响 master:heartbeat 执行时长统计）`

注意：`--strict` 模式下这两个 WARN 也会变成 FAIL（已有机制，无需额外处理）。

### Part B — master:heartbeat 过载检测

Harness 借鉴：`task_rejected_total` 暴露过载信号。

在 `master-heartbeat.ts` 的 `generateReport()` 里，基于 TASK-020 新增的 `capacity` 字段：

1. 新增 `slaverStatus.overloaded`：`capacity.current >= capacity.maxConcurrent` 的 Slaver 列表
2. 新增 `slaverStatus.busyRatio`：`busy` 状态 Slaver 数 / 总活跃 Slaver 数（0.0 ~ 1.0）
3. 健康评级：`busyRatio >= 0.8`（80% Slaver 满载）→ YELLOW；`busyRatio === 1.0` 且有等待任务 → RED

**`SlaverStatusReport` 扩展**（HeartbeatReport.slaverStatus）：
```typescript
slaverStatus: {
  active: SlaverHeartbeat[];
  stale: StaleSlaverInfo[];
  waitingOnMaster: TicketInfo[];
  overloaded: SlaverHeartbeat[];   // 新增
  busyRatio: number;               // 新增
}
```

**不做**：
- 不实现真正的"任务拒绝"机制（那需要 Redis 消息队列配合，超出本 ticket 范围）
- 不修改 heartbeat 发送逻辑

---

## 2. 验收标准

- [ ] `scripts/validate-ticket-template.sh`：`in_progress` 缺 `started_at` → WARN；`done` 缺 `completed_at` → WARN
- [ ] 校验脚本测试：手动创建含/不含这两个字段的 ticket 文件，验证输出正确（在 PR 描述里附上命令输出）
- [ ] `HeartbeatReport.slaverStatus` 包含 `overloaded` 和 `busyRatio`
- [ ] `busyRatio` 计算：无活跃 Slaver 时返回 `0`（不除以零）
- [ ] 健康逻辑：`busyRatio >= 0.8` → YELLOW（有明确注释说明阈值来源）
- [ ] `npm run build` 零 TS 错误
- [ ] `npm test` 1105+ 全部通过
- [ ] 新增测试：
  - 3 个 Slaver，2 个 busy → `busyRatio ≈ 0.667`，health 为 GREEN
  - 5 个 Slaver，4 个 busy → `busyRatio = 0.8`，health YELLOW
  - 无活跃 Slaver → `busyRatio = 0`，不 crash

---

## 3. 技术方案

### validate-ticket-template.sh 新增检查

在 `validate_ticket()` 函数内，在现有 WARN 检查块追加：

```bash
# 7. in_progress 状态缺 started_at（WARN）
if [[ "$status" == "in_progress" ]]; then
  if ! file_has '\*\*started_at\*\*:' "$file" || \
     echo "$content" | grep -qE '\*\*started_at\*\*:\s*(<!--|$)'; then
    issues+=("  ${YELLOW}[WARN]${RESET} in_progress 状态缺少 started_at 字段（Slaver 应在领取时填写）")
    ticket_warn=$((ticket_warn + 1))
  fi
fi

# 8. done 状态缺 completed_at（WARN）
if [[ "$status" == "done" ]]; then
  if ! file_has '\*\*completed_at\*\*:' "$file" || \
     echo "$content" | grep -qE '\*\*completed_at\*\*:\s*(<!--|$)'; then
    issues+=("  ${YELLOW}[WARN]${RESET} done 状态缺少 completed_at 字段（影响 master:heartbeat 执行时长统计）")
    ticket_warn=$((ticket_warn + 1))
  fi
fi
```

### busyRatio 计算（master-heartbeat.ts）

```typescript
const activeSlavers = ...; // 从 redis 或文件读取
const busyCount = activeSlavers.filter(s => s.status === 'busy').length;
const busyRatio = activeSlavers.length > 0 ? busyCount / activeSlavers.length : 0;
const overloaded = activeSlavers.filter(s =>
  s.capacity.current >= s.capacity.maxConcurrent
);
```

---

## 4. 影响范围

- `scripts/validate-ticket-template.sh` — 新增两条 WARN 检查
- `node/src/commands/master-heartbeat.ts` — `slaverStatus` 扩展，health 逻辑更新
- `node/tests/commands/master-heartbeat.test.ts` — 新增测试

---

## 5. blocked_by

- TASK-020（`SlaverHeartbeat` 扩展 capacity 字段，Part B 依赖）
- TASK-021（Ticket 模板加 started_at/completed_at，Part A 依赖字段存在）

**开始顺序**：等 TASK-020 和 TASK-021 完成后再开始。
