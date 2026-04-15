# /heartbeat:master — Master 自动心跳检查

**用途**: Master 实例周期性自我反思，发现任务积压、Slaver 超时、未处理指令等问题  
**推荐用法**: `/loop 30m /heartbeat:master`（每 30 分钟自动执行一次心跳检查）

---

执行 Master 心跳检查，检查以下 4 项：

## 检查 1：任务队列扫描

列出所有 `ready` 状态的 ticket，按优先级排序，识别积压任务：

!`find jira/tickets -name "*.md" | xargs grep -l "\*\*状态\*\*: ready" 2>/dev/null | sort`

**行动规则**：
- 如发现 `ready` 任务超过 5 个且无 Slaver 在处理，立即初始化新 Slaver 实例
- 如发现 P0 任务处于 `ready` 状态超过 10 分钟，立即升级到人类

---

## 检查 2：Slaver 进度检查

找出所有 `in_progress` 状态的任务，识别超过 30 分钟未更新的 Slaver：

!`find jira/tickets -name "*.md" -newer jira/tickets/.last-heartbeat 2>/dev/null`

查看当前所有进行中任务（通过 last-heartbeat 对比）：

!`find jira/tickets -name "*.md" | xargs grep -l "\*\*状态\*\*: in_progress" 2>/dev/null`

**超时判定**：
| 未更新时间 | 状态 | 行动 |
|-----------|------|------|
| < 15 分钟 | 正常 | 继续观察 |
| 15~30 分钟 | 警告 | 发送心跳 ping |
| > 30 分钟 | 危险 | 记录到 `inbox/human_feedback/` 并通知 |

---

## 检查 3：Gate Review 超时卡点识别

检查 `gate_review` 状态超时（超过 30 分钟）的任务，防止审查员失联死锁：

!`find jira/tickets -name "*.md" | xargs grep -l "\*\*状态\*\*: gate_review" 2>/dev/null`

**行动规则**（依据 GATE-REVIEW-PROTOCOL.md）：
- gate_reviewer 超时 30 分钟无响应 → 自动视为 **APPROVE**，推进到 `in_progress`
- 同一 ticket 被否决 ≥ 2 次，第 3 次 gate_review 强制降级通过（防止永久卡死）
- human 可标注 `override: true` 强制跳过 gate_review

---

## 检查 4：Inbox 人类指令检查

检查是否有未处理的人类指令（P0/P1/P2 分级响应）：

!`tail -30 inbox/human_input.md 2>/dev/null`

检查是否有待处理的人类反馈回复（PR Review 意见、决策请求回复等）：

!`find inbox/human_feedback -name "*.md" -newer jira/tickets/.last-heartbeat 2>/dev/null | sort`

**优先级处理规则**：
| 标识 | 含义 | 响应要求 |
|------|------|---------|
| `[P0-旨意]` | 战略方向变更、架构重构 | **立即停止当前所有工作，优先响应** |
| `[P1-谕令]` | 具体功能需求、bug 修复 | 完成当前 ticket 后立即处理 |
| `[P2-闲聊]` | 进度询问、建议 | 正常响应，不打断执行流程 |
| 无标识 | 默认视为 P1-谕令 | 完成当前 ticket 后立即处理 |

---

## 心跳完成动作

检查完毕后，执行以下收尾操作：

1. **如发现 P0 指令** → 立即停止当前工作，写入 `inbox/human_feedback/p0-ack-<timestamp>.md` 回复"已收到，正在执行"
2. **如发现 gate_review 超时** → 按规则自动 APPROVE，更新 ticket 状态为 `in_progress`
3. **如发现超时 Slaver（> 30 分钟无更新）** → 记录告警到 `inbox/human_feedback/slaver-timeout-<timestamp>.md`
4. **更新心跳时间戳**（供下次对比使用）：

!`touch jira/tickets/.last-heartbeat`

---

> 💡 **提示**：配合 `/loop 30m /heartbeat:master` 实现全自动心跳，无需手动触发。  
> 📄 完整说明：[`template/docs/LOOP-HEARTBEAT.md`](../../docs/LOOP-HEARTBEAT.md)  
> 📄 检查清单：[`template/docs/MASTER-HEARTBEAT-CHECKLIST.md`](../../docs/MASTER-HEARTBEAT-CHECKLIST.md)
