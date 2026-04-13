# Gate Review Protocol

**版本**: 1.0.0
**更新时间**: 2026-04-13
**维护者**: EKET Framework Team

---

## 概述

Gate Review 是借鉴三省六部制中**门下省封驳制度**的执行前关卡机制。

- **触发时机**：Ticket 从 `ready` 推进时自动触发
- **核心价值**：在任务执行前（而非执行后）拦截不可执行的任务，避免高返工成本
- **有别于 phase_reviewer**：phase_reviewer 是事后回溯，gate_reviewer 是预判阻断

---

## 状态流转图

```
                    ┌──────────────────────────────────────────┐
                    ↓                                          │
backlog → analysis → ready → gate_review → in_progress → ... → done
                               │                ↓ VETO
                               │           analysis（打回）
                               │
                               └─ [override:true] → in_progress（跳过）
```

---

## 角色与职责

### gate_reviewer（执行前关卡）

- **角色文件**：`template/agents/reviewer/gate_reviewer/agent.yml`
- **触发方式**：自动（Ticket 进入 `gate_review` 状态时）
- **权限**：
  - ✅ APPROVE：将 ticket 推进至 `in_progress`
  - ✅ VETO：将 ticket 打回 `analysis`
  - ❌ 无法修改 ticket 内容（只能审查，不能改写）
  - ❌ 无法审查独立审计员的报告

### independent_auditor（独立审计员）

- **角色文件**：`template/agents/independent/independent_auditor/agent.yml`
- **触发方式**：阶段完成率 >= 90% 时自动触发，或 human 直接调用
- **权限**：
  - ✅ 直接写入 `inbox/human_feedback/`（绕过 Master）
  - ✅ 追加写入 `confluence/audit/independent-audit-log.jsonl`
  - ✅ 审查 gate_reviewer 的否决质量
  - ❌ Master 不可修改审计日志
  - ❌ Master 不可强制终止审计进程

---

## Gate Review 流程详解

### Step 1: 触发

```
Master/自动系统 将 ticket 状态从 ready → gate_review
gate_reviewer 进程被自动唤醒，接收 ticket 全量数据
```

### Step 2: 核查清单（gate_reviewer 执行）

```
必查项（任一不满足 → 强制 VETO）：
☐ 验收标准不含 TBD / 待定 / 暂不明确
☐ 技术方案存在（不只有功能描述）
☐ blocked_by 依赖全部为 done 状态
☐ 预估工时已填写（> 0）
☐ 每条验收标准都能写出验证命令

选查项（需综合判断）：
☐ 验收标准数量 ≤ 8 条（范围蔓延检查）
☐ 预估工时 ≤ 2 天（超出建议拆分）
☐ 无未评估的生产 schema 变更
☐ 无未评估的新第三方依赖
```

### Step 3: 死锁计数检查

```python
veto_count = ticket.metadata.gate_review_veto_count or 0
if veto_count >= 2:
    # 第 3 次强制降级通过
    result = "APPROVE（降级通过）"
    add_warning_to_ticket("已达最大否决次数 2 次，强制降级通过")
    notify_master("GATE-REVIEW-DEADLOCK: ticket {id} 强制降级通过")
else:
    result = evaluate_ticket()  # 正常审查
```

### Step 4: 输出审查报告

写入 `jira/tickets/{ticket-id}/gate-review.md`（格式见 gate_reviewer/agent.yml）

### Step 5: 状态更新

```
APPROVE → ticket.status = in_progress
VETO    → ticket.status = analysis
           ticket.metadata.gate_review_veto_count += 1
           ticket.metadata.veto_reason = "..."
           ticket.metadata.resubmit_conditions = [...]
```

---

## 死锁防止机制

### 场景描述

Gate reviewer 与 Master/Slaver 的否决循环可能导致 ticket 永久卡死：

```
ready → gate_review → VETO → analysis → ready → gate_review → VETO → ...
```

### 防止措施

| 机制 | 描述 |
|------|------|
| **最大否决次数** | 同一 ticket 最多否决 2 次，第 3 次强制通过 |
| **降级通过警告** | 强制通过时在 ticket 和审计日志中写入警告 |
| **超时自动通过** | gate_reviewer 30 分钟无响应，自动 APPROVE |
| **human override** | human 标注 `override: true` 强制跳过 gate_review |
| **Master 通知** | 任何强制通过都通知 Master，确保知情 |

### 降级通过记录格式

```markdown
⚠️ GATE-REVIEW-DEGRADED
Ticket: {ticket-id}
原因: 已达最大否决次数（2 次），强制降级通过
时间: YYYY-MM-DD HH:MM
前两次否决原因摘要:
  - 第 1 次: {veto_reason_1}
  - 第 2 次: {veto_reason_2}
执行风险提示: 以上问题可能在执行中出现，请 Slaver 执行时格外注意
```

---

## Independent Auditor 触发协议

### 触发条件

```
阶段完成率 >= 90%
（完成 ticket 数 / 本阶段总 ticket 数 >= 0.90）
```

### 报告链路

```
independent_auditor
    └── 写入 confluence/audit/independent-audit-log.jsonl（append-only）
    └── 写入 inbox/human_feedback/audit-phase-{id}-{timestamp}.md
              ↑
         直接到达 human（绕过 Master）
```

### 防篡改机制

每条审计日志包含：

```json
{
  "id": "AUDIT-PHASE-X-1234567890",
  "timestamp": "2026-04-13T10:00:00Z",
  "phase_id": "X",
  "finding_level": "HIGH",
  "description": "...",
  "evidence": ["ticket-id", "file-path"],
  "prev_hash": "sha256-of-previous-entry"
}
```

`prev_hash` 形成链式结构，任何中间条目被修改都会导致后续 hash 验证失败。

### Master 的限制

| 操作 | Master 是否允许 |
|------|----------------|
| 读取审计报告 | ✅ 允许 |
| 修改审计报告 | ❌ 禁止 |
| 删除审计报告 | ❌ 禁止 |
| 提前终止审计进程 | ❌ 禁止（会被记录为 CRITICAL 发现） |
| 对审计结论提出异议 | ✅ 允许（写入 `inbox/human_feedback/` 供 human 裁决） |

---

## Gate Review 质量监控

independent_auditor 在阶段复盘时评估 gate_reviewer 质量：

| 指标 | 健康范围 | 告警条件 |
|------|---------|---------|
| 否决率 | 10% ~ 40% | < 10%（把关不力）或 > 50%（过度严格） |
| 降级通过率 | < 10% | > 20%（死锁频繁，需检讨验收标准设计） |
| 否决理由重复率 | < 30% | > 50%（上游需求质量系统性问题） |
| 审查超时率 | < 5% | > 10%（审查员可用性问题） |

---

## 与其他协议的关系

| 协议 | 文件 | 关系 |
|------|------|------|
| Ticket 职责边界 | `template/docs/TICKET-RESPONSIBILITIES.md` | Gate review 记录由 gate_reviewer 填写 |
| Master 心跳检查 | `template/docs/MASTER-HEARTBEAT-CHECKLIST.md` | 心跳检查包含 gate_review 状态监控 |
| Slaver 心跳检查 | `template/docs/SLAVER-HEARTBEAT-CHECKLIST.md` | Slaver 需响应 VETO 打回并修复 |
| 防幻觉红线 | CLAUDE.md | Gate review 不替代 CI 绿灯要求 |

---

**维护者**: EKET Framework Team
