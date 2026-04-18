# FS 写入点审计（Phase 0 / Task 0.1 附属）

**日期**: 2026-04-17
**方法**: `grep -rnE` 扫描 `node/src/**/*.ts` 和 `scripts/**/*.sh`

---

## 摘要

| 引擎 | 写入点数 | 散布文件数 |
|------|---------|-----------|
| Node | 58 处 | 20 |
| Shell | 51 处 | 12 |

**结论**: Node 和 Shell 各自直写共享 FS 目录，**无共享 writer 层**。漂移已存在，持续恶化。

---

## Node 写入热点（Top 10）

| 文件 | 次数 | 写入目录 |
|------|------|---------|
| `commands/ticket-index.ts` | 7 | `jira/` |
| `core/master-election.ts` | 5 | `.eket/state/` |
| `core/agent-mailbox.ts` | 5 | `shared/mailbox/` |
| `commands/start-instance.ts` | 6 | `.eket/state/`, `.gitkeep` |
| `commands/init-wizard.ts` | 4 | `.eket/config/`, `.gitignore` |
| `core/alerting.ts` | 2 | `shared/alerts/` |
| `commands/gate-review.ts` | 3 | `jira/`, logs |
| `core/file-queue-manager.ts` | 2 | `shared/message_queue/` |
| `core/optimized-file-queue.ts` | 2 | `shared/message_queue/` |
| `commands/claim-helpers.ts` | 2 | `.eket/state/profiles/`, `shared/message_queue/` |

## Shell 写入热点（Top 10）

| 文件 | 次数 | 写入目录 |
|------|------|---------|
| `scripts/init-project.sh` | 12 | `.eket/state/`, `jira/state/`, `confluence/`, `code_repo/` |
| `scripts/init-review-subagents.sh` | 8 | review subagent 目录 |
| `scripts/eket-start.sh` | 7 | `.eket/state/`, `inbox/`, 三仓库 README |
| `scripts/init.sh` | 5 | `.eket/state/`, `jira/` |
| `scripts/manage.sh` | 2 | `shared/message_queue/` |
| `scripts/init-three-repos.sh` | 4 | 三仓库 README/state |
| `template/scripts/openclaw-exec.sh` | 2 | `jira/epics/`, `jira/tickets/` |
| `scripts/task-time-tracker.sh` | 1 | `.eket/state/active-tasks.log` |
| `scripts/slaver-heartbeat.sh` | 1 | logs |
| `scripts/cleanup-project.sh` | 1 | `inbox/human_input.md` |

---

## 重叠目录（Node 与 Shell 都写）

| 目录 | Node 写入点 | Shell 写入点 | 风险 |
|------|------------|-------------|------|
| `jira/tickets/*.md` | 3 | 1 | 🔴 高 — 格式最容易漂移 |
| `.eket/state/*.yml` | 9 | 15 | 🔴 高 — 心跳/注册格式 |
| `shared/message_queue/*.json` | 4 | 2 | 🟡 中 — JSON 两边基本一致 |
| `inbox/human_input.md` | 0 | 2 | 🟢 低 — 只 Shell 写 |
| `.eket/state/profiles/` | 1 | 1 | 🟡 中 — 用户画像格式 |

---

## 关键漂移风险点（Phase 0 优先修复）

### 1. Ticket 元数据写入（最严重）

**Shell**（`template/scripts/openclaw-exec.sh`）:
```bash
cat > "${PROJECT_ROOT}/jira/tickets/${prefix,,}/${ticket_id}.md" << EOF
# ${ticket_id}: ${title}

**Status**: backlog
...
EOF
```

**Node**（`commands/claim.ts`, `commands/gate-review.ts`）:
```typescript
fs.writeFileSync(ticketFile, content);  // 用字符串拼接或 sed-like 替换
```

两边对 ticket Markdown 元数据的读写格式**没有统一**。
→ Phase 0 / Task 0.3 + 0.4 必须收口。

### 2. 心跳文件格式

**Shell**（`scripts/slaver-heartbeat.sh`）和 **Node**（`commands/slaver-poll.ts`, `master-poll.ts`）均写：
```
.eket/state/{role}_{instance_id}_heartbeat.yml
```

已为此建 `protocol/schemas/heartbeat.schema.json`（本轮产出）。
→ Phase 0 / Task 0.3 + 0.4 按此 schema 收口。

### 3. 实例配置

**Shell**（`scripts/eket-start.sh` 166 行 + `init-project.sh` 669/816 行）和 **Node**（`commands/start-instance.ts`）均写：
```
.eket/state/instance_config.yml
```

格式约定在多个脚本里各自硬编码。
→ 抽到 `protocol/schemas/` + 双方统一读写。

### 4. 消息队列文件

**Shell**（`scripts/manage.sh`）和 **Node**（`core/file-queue-manager.ts`, `core/agent-mailbox.ts`）均写 JSON。
格式略有差异（字段大小写、可选字段）。
→ 按 `protocol/schemas/message.schema.json` 统一。

---

## 行动

对应 Phase 0 任务：
- **Task 0.3** `lib/state/writer.sh` 吃掉 Shell 51 处写入
- **Task 0.4** `node/src/core/state/writer.ts` 吃掉 Node 58 处写入
- **Task 0.5** 等价性测试确认两边结果一致
- **Task 0.6** 删重复（`optimized-file-queue` vs `file-queue-manager`）

---

## 审计完整性

本报告由 `grep -rnE "writeFile\|writeJSON\|fs\.writeFileSync"` + `grep -rnE "cat >|echo >|printf >"` 生成，可能遗漏：
- 通过变量间接构造命令的写入（`eval` / 动态拼接）
- 第三方库内部写入
- Worker 线程中的写入

**建议**: Task 0.3/0.4 完成后，用 ESLint 自定义规则 + 预提交 hook 做**静态强制**，避免再依赖 grep。
