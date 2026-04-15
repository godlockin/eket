# /heartbeat:slaver — Slaver 自动心跳自检

**用途**: Slaver 实例周期性自我反思，确认任务状态、依赖关系和分支健康度  
**推荐用法**: `/loop 10m /heartbeat:slaver`（每 10 分钟自动执行一次心跳自检）

---

执行 Slaver 心跳自检，检查以下 3 项：

## 检查 1：当前任务确认

确认领取的任务 ID 和当前执行状态，避免任务漂移或状态不一致：

!`find jira/tickets -name "*.md" | xargs grep -l "$(cat .eket/state/current_task 2>/dev/null || echo 'NO_TASK')" 2>/dev/null | head -1`

检查当前任务的状态字段：

!`grep -l "\*\*状态\*\*: in_progress" jira/tickets/*.md 2>/dev/null | head -5`

**自检要点**：
- [ ] 当前 ticket ID 是什么？状态是否正确为 `in_progress`？
- [ ] `started_at` 时间是否记录？
- [ ] 是否有其他 Slaver 同时领取了相同 ticket？（防重复领取）

---

## 检查 2：依赖关系检查

检查当前 ticket 的 `blocked_by` 依赖是否已全部 `done`，判断是否可以继续执行：

读取当前任务的依赖字段：

!`git -C . log --oneline -5 2>/dev/null`

检查依赖任务状态（将 `blocked_by` 中的 ticket ID 替换后执行）：

!`grep -r "blocked_by" jira/tickets/*.md 2>/dev/null | grep -v "^#" | head -10`

**依赖处理规则**：
| 情况 | 判定 | 行动 |
|------|------|------|
| 依赖任务未完成 | 阻塞 | 更新状态 `blocked` → 写入 `inbox/dependency-clarification.md` |
| 依赖外部资源缺失 | 阻塞 | 写入 `inbox/dependency-clarification.md` → 等待 Master |
| 技术难点 > 30 分钟 | 阻塞 | 写入 `inbox/blocker_reports/` → 请求 Master 仲裁 |
| 一切正常 | 无阻塞 | 继续执行 |

---

## 检查 3：分支状态检查

确认当前 feature 分支的代码状态，防止意外丢失未提交变更：

!`git status --short`

查看与 miao 分支的提交差异（确认有哪些提交待 PR）：

!`git log --oneline origin/miao..HEAD 2>/dev/null | wc -l`

**分支状态判定**：
| 状态 | 说明 | 行动 |
|------|------|------|
| 有未提交文件 | 正常开发中 | 继续，确保定期提交 |
| 无未提交且有待 PR 提交 | 功能完成待 Review | 检查是否需要提交 PR |
| 无未提交且无 PR 提交 | 分支为空 | 确认是否误操作 |
| 有冲突文件 | 需要解决冲突 | **立即处理**，不得搁置 |

---

## 心跳完成动作

心跳自检完成后，按以下规则决定后续行动：

1. **如当前任务无阻塞** → 继续执行，更新 ticket 的 `last_updated` 字段
2. **如发现依赖阻塞** → 写入阻塞报告，检查是否有其他 `ready` 任务可并行领取
3. **如分支有冲突** → 立即解决，然后重新执行心跳确认
4. **如当前任务完成** → 执行 PR 自检，提交 PR 并通知 Master

**心跳完成后，更新任务最后更新时间（防 Master 超时告警）**：

更新 ticket 文件的时间记录，让 Master 心跳检查知道 Slaver 仍然活跃。

---

> 💡 **提示**：配合 `/loop 10m /heartbeat:slaver` 实现自动心跳，避免 Master 误判 Slaver 超时。  
> 📄 完整说明：[`template/docs/LOOP-HEARTBEAT.md`](../../docs/LOOP-HEARTBEAT.md)  
> 📄 检查清单：[`template/docs/SLAVER-HEARTBEAT-CHECKLIST.md`](../../docs/SLAVER-HEARTBEAT-CHECKLIST.md)
