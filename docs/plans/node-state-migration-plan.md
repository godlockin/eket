# Node State Migration Plan — `core/state/writer.ts` 收口

**状态**: Draft v1.0 · Phase 0 / Task 0.4 执行方案
**日期**: 2026-04-17
**上游**: [`docs/audit/fs-write-points.md`](../audit/fs-write-points.md) · [`node/src/OWNERSHIP.md`](../../node/src/OWNERSHIP.md) · [`node/src/core/state/README.md`](../../node/src/core/state/README.md)
**范围**: 仅 `node/src/` 非测试非 state/skills 路径下的 `fs.{write,append}File{,Sync}` 直写

---

## 1. Summary

重新扫描（不信任 audit 文档的聚合数字）：

| 维度 | 数量 |
|------|------|
| 总直写点（fs.{write,append}File{,Sync}） | **42** |
| `fs-extra.outputFile` / `fs-extra.writeFile` | **0**（仅 writer.ts 注释提及） |
| 涉及文件 | **18** |
| 可直接迁移（writer.ts 已有 API） | **6** |
| 需新增 writer API 才能迁移（blocked） | **30** |
| 脚手架豁免（`.gitkeep` / 项目 `.gitignore`） | **6**（按 OWNERSHIP.md `// allow:` 例外处理） |

### 分类统计

| 分类 | 计数 | writer.ts 现有 API | 备注 |
|------|------|-------------------|------|
| `[heartbeat]` | 2 | ✅ `updateHeartbeat` | [slaver-poll.ts:500](../../node/src/commands/slaver-poll.ts#L500), [master-poll.ts:378](../../node/src/commands/master-poll.ts#L378) |
| `[ticket-write]` | 3 | ✅ `writeTicket` / `transitionTicket` | claim/gate-review；**claim.ts 现有代码写错字段名**（`**状态**` 而非 `**Status**`） |
| `[ticket-index]` | 7 | ❌ 需新增 `writeTicketIndex` | `ticket-index.ts` 全部 6 条 by-*.md + 1 条 ticket-registry.yml |
| `[message]` | 4 | ❌ 需新增 `enqueueMessage` | claim-helpers / submit-pr / file-queue-manager / optimized-file-queue |
| `[queue-internal]` | 2 | ❌ 需新增 `writeQueueIndex` | `processed.json` 去重索引（两套队列实现各一处） |
| `[audit/log]` | 1 | ⚠️ 部分 — `audit()` 存在但签名不匹配 | [gate-review.ts:460](../../node/src/commands/gate-review.ts#L460) 写哈希链 jsonl |
| `[election]` | 4 | ❌ 需新增 `writeElectionLock/Declaration/Marker` | master-election.ts 477/512/590/643 |
| `[master-marker]` | 1 | ❌ 需新增 `writeMasterMarker` | [start-instance.ts:231](../../node/src/commands/start-instance.ts#L231)（与 election.ts:590 同语义） |
| `[master-context]` | 1 | ❌ 需新增 `writeMasterContext` | [master-context.ts:687](../../node/src/core/master-context.ts#L687) |
| `[project-status]` | 1 | ❌ 需新增 `writeProjectStatus` | [master-poll.ts:357](../../node/src/commands/master-poll.ts#L357) |
| `[profile]` | 2 | ❌ 需新增 `writeAgentProfile` | [set-role.ts:84](../../node/src/commands/set-role.ts#L84), [claim-helpers.ts:166](../../node/src/commands/claim-helpers.ts#L166) |
| `[instance-config]` | 3 | ❌ 需新增 `writeInstanceConfig` | set-role.ts:97, start-instance.ts:359/602 |
| `[project-config]` | 1 | ❌ 需新增 `writeProjectConfig` | [init-wizard.ts:439](../../node/src/commands/init-wizard.ts#L439)（.eket/config/config.yml） |
| `[node-register]` | 1 | ❌ 需新增 `registerNode` | [slaver-register.ts:136](../../node/src/commands/slaver-register.ts#L136) |
| `[human-feedback]` | 1 | ❌ 需新增 `writeHumanFeedback` | [agent-pool.ts:568](../../node/src/core/agent-pool.ts#L568) handoff 通知 |
| `[alert]` | 2 | ❌ 需新增 `writeAlert`（或 `[node-only]` 降级不走 writer） | alerting.ts 414/450 — 写 `<alertsDir>/*.json` |
| `[review-request]` | 0 | — | 本轮扫描未发现对 `outbox/review_requests/` 直写（task 模板提及但未落地） |
| `[scaffold-exempt]` | 6 | — | 按 OWNERSHIP 例外条款保留：.gitkeep × 4（start-instance.ts 264/281/297, init-wizard.ts 467），.gitignore × 2（init-wizard.ts 299/302） |

与 audit 文档 58 处的差异：audit 文档把 `scripts/**/*.sh` 合并统计，且当前节点树中部分旧文件已裁撤；本计划以当次 `grep` 为准。

---

## 2. Top-10 Priority Migration Table

排序依据：`frequency_in_hot_path × write_surface_criticality`。前两名为每轮轮询必触发；3-4 名为状态机收口关键；其余按阻塞影响降序。

| # | 位置 | 分类 | Writer API | 阻塞？ | 工作量 |
|---|------|------|-----------|--------|--------|
| 1 | [slaver-poll.ts:500](../../node/src/commands/slaver-poll.ts#L500) | heartbeat | `updateHeartbeat` | 否 | S |
| 2 | [master-poll.ts:378](../../node/src/commands/master-poll.ts#L378) | heartbeat | `updateHeartbeat` | 否 | S |
| 3 | [claim.ts:106](../../node/src/commands/claim.ts#L106) | ticket-write | `transitionTicket` | 否（且**修复现有字段名 bug**） | S |
| 4 | [gate-review.ts:425](../../node/src/commands/gate-review.ts#L425) | ticket-write | `writeTicket` × N + 需 `appendTicketBlock` 扩展 | 部分 | M |
| 5 | [claim-helpers.ts:196](../../node/src/commands/claim-helpers.ts#L196) | message | `enqueueMessage` | 是 | M |
| 6 | [submit-pr.ts:554](../../node/src/commands/submit-pr.ts#L554) | message | `enqueueMessage` | 是 | M |
| 7 | [ticket-index.ts:185/213/252/286/309/319/356](../../node/src/commands/ticket-index.ts#L185) | ticket-index | `writeTicketIndex` + `writeTicketRegistry` | 是 | M |
| 8 | [master-poll.ts:357](../../node/src/commands/master-poll.ts#L357) | project-status | `writeProjectStatus` | 是 | S |
| 9 | [master-election.ts:477/512/643](../../node/src/core/master-election.ts#L477) | election | `writeElectionLock` + `writeElectionDeclaration` | 是 | L |
| 10 | [gate-review.ts:460](../../node/src/commands/gate-review.ts#L460) | audit/log | 扩展 `audit()` 支持哈希链 jsonl | 部分 | M |

---

## 3. Top-10 Concrete Diffs

### #1 · `slaver-poll.ts:500` — 心跳

```diff
-import fs from 'node:fs';
+import { updateHeartbeat } from '../core/state/index.js';
@@
-function updateHeartbeat(instanceId: string, status: SlaverStatus): void {
-  const stateDir = '.eket/state';
-  fs.mkdirSync(stateDir, { recursive: true });
-  const now = new Date().toISOString();
-  const heartbeatContent = `# Slaver 心跳
-instance_id: ${instanceId}
-... (7 行)
-`;
-  fs.writeFileSync(path.join(stateDir, `slaver_${instanceId}_heartbeat.yml`), heartbeatContent, 'utf-8');
-}
+async function writeSlaverHeartbeat(instanceId: string, status: SlaverStatus): Promise<void> {
+  await updateHeartbeat({
+    role: 'slaver',
+    instanceId,
+    status: status.status,
+    currentTask: status.currentTicket ?? null,
+  });
+}
```
**注意**：writer.ts 当前心跳格式只输出 6 个字段（instance_id/role/status/current_task/timestamp/host/pid），**丢失** `specialty / pending_pr_feedback / new_messages / ready_tasks`。需在 `HeartbeatOpts` 新增可选扩展字段或接受 `extra: Record<string,string>`（见 §4）。

### #2 · `master-poll.ts:378` — 心跳

```diff
-import fs from 'node:fs';
+import { updateHeartbeat } from '../core/state/index.js';
@@
-  fs.writeFileSync(path.join(stateDir, `master_${instanceId}_heartbeat.yml`), heartbeatContent, 'utf-8');
+  await updateHeartbeat({
+    role: 'master',
+    instanceId,
+    status: status.status,
+    currentTask: null,
+  });
```
同样缺字段：`pending_prs / pending_arbitrations / pending_human_decisions` — 依赖 §4 的 `extra` 扩展。

### #3 · `claim.ts:106` — ticket 状态（**附带 bug 修复**）

```diff
-for (const dir of dirs) {
-  const ticketFile = path.join(jiraPath, dir, `${ticketId}.md`);
-  if (fs.existsSync(ticketFile)) {
-    let content = fs.readFileSync(ticketFile, 'utf-8');
-    content = content.replace(/\*\*状态\*\*:\s*\w+/i, `**状态**: ${status}`);
-    fs.writeFileSync(ticketFile, content);
-    return;
-  }
-}
+// writer.ts 内部已 locateTicketFile + schema 校验 + 锁 + 原子写
+// bug: 原代码写中文 **状态**，与 writer.ts / ticket schema 英文 **Status** 不一致
+await transitionTicket(ticketId, status);
```

### #4 · `gate-review.ts:425` — 审查后多字段写

```diff
-content = content.replace(/(\*\*状态\*\*:\s*)\S+/, `$1${newStatus}`);
-// ... 多处 content.replace / trimEnd 拼接 veto 块 ...
-fs.writeFileSync(ticket.filePath, content);
+// 字段级写入，锁、原子写、审计交给 writer
+await writeTicket(report.ticketId, 'status', newStatus);
+if (report.vetoCount > 0) {
+  await writeTicketField(report.ticketId, 'gate_review_veto_count', String(report.vetoCount));
+}
+if (report.decision === 'VETO' && report.vetoDetails) {
+  await appendTicketBlock(report.ticketId, buildVetoBlock(report));  // §4 新 API
+}
```

### #5 · `claim-helpers.ts:196` — task_claimed 消息

```diff
-const messageFile = path.join(queueDir, `${messageId}.json`);
-const message = { id: messageId, timestamp: new Date().toISOString(), type: 'task_claimed', ... };
-fs.writeFileSync(messageFile, JSON.stringify(message, null, 2));
+await enqueueMessage({
+  channel: 'coordinator',
+  type: 'task_claimed',
+  from: `agent_${role}`,
+  to: 'coordinator',
+  payload: { ticket_id: ticketId, role, status: 'in_progress' },
+});
```

### #6 · `submit-pr.ts:554` — pr_review_request 消息

```diff
-fs.writeFileSync(messageFile, JSON.stringify(message, null, 2));
+await enqueueMessage({
+  channel: 'coordinator',
+  type: 'pr_review_request',
+  from: 'system',
+  to: 'coordinator',
+  payload: {
+    pr_number: prData.number,
+    pr_url: prData.htmlUrl,
+    pr_title: prData.title,
+    status: 'pending_review',
+  },
+});
```

### #7 · `ticket-index.ts` 7 处（by-status/role/priority/sprint/milestone/top-level + registry）

```diff
-const file = path.join(indexDir, 'by-status.md');
-fs.writeFileSync(file, lines.join('\n'));
+await writeTicketIndex('by-status', lines.join('\n'));
@@
-const registryFile = path.join(stateDir, 'ticket-registry.yml');
-fs.writeFileSync(registryFile, lines.join('\n'));
+await writeTicketRegistry(lines.join('\n'));
```
一个函数收敛全部 6 份索引（kind 参数枚举），注册表单列。

### #8 · `master-poll.ts:357` — project-status.yml

```diff
-fs.writeFileSync(path.join(stateDir, 'project-status.yml'), statusContent, 'utf-8');
+await writeProjectStatus(statusContent);     // 内部：加 `project-status` 锁 + 原子写 + audit
```

### #9 · `master-election.ts:477/512/643` — election 文件

```diff
-fs.writeFileSync(lockFile, JSON.stringify(lockInfo, null, 2));
+await writeElectionLock(lockInfo);           // .eket/state/master.lock/info.json
@@
-fs.writeFileSync(declarationFile, JSON.stringify(declaration, null, 2));
+await writeElectionDeclaration(declaration); // .eket/state/master.declaration.json
@@
-// 续租路径 (line 643)
-fs.writeFileSync(lockFile, JSON.stringify(lockInfo, null, 2));
+await writeElectionLock(lockInfo);
```
`master-election.ts:590`（confluence/MASTER_MARKER）与 `start-instance.ts:231` 语义一致 → 合并到 `writeMasterMarker()`。

### #10 · `gate-review.ts:460` — 哈希链审计日志

```diff
-fs.appendFileSync(logFile, finalLine + '\n');
+// writer.ts `audit()` 当前只写单行 action|id|node|extra
+// 扩展签名：audit({ channel: 'gate-review', record, hashChain: true })
+await audit({
+  channel: 'gate-review',
+  action: `gate_review_${report.decision.toLowerCase()}`,
+  subject: report.ticketId,
+  node: getNodeId(),
+  extra: entry,
+  hashChain: true,  // 触发 prev_hash + hash 字段
+});
```

---

## 4. New writer.ts APIs Required (signatures only)

```typescript
// ───── Ticket 扩展 ─────────────────────────────────────────────
export async function writeTicketField(
  id: string,
  field: string,         // 任意元数据键（非枚举限定）— 用于 gate_review_veto_count 等动态字段
  value: string
): Promise<void>;

export async function appendTicketBlock(
  id: string,
  block: string,         // 追加到文件末尾的 Markdown 块（先幂等删除旧同签名块再 append）
  marker?: string        // HTML 注释匹配签名，用于幂等替换
): Promise<void>;

// ───── Ticket 索引 & 注册表 ─────────────────────────────────────
export type TicketIndexKind =
  | 'top'                 // jira/tickets/index/index.md
  | 'by-status'
  | 'by-role'
  | 'by-priority'
  | 'by-sprint'
  | 'by-milestone';

export async function writeTicketIndex(kind: TicketIndexKind, content: string): Promise<void>;
export async function writeTicketRegistry(content: string): Promise<void>;

// ───── 消息队列 ────────────────────────────────────────────────
export interface EnqueueOpts<P = unknown> {
  channel: string;                                   // coordinator / master / slaver-<id>
  type: string;                                      // task_claimed / pr_review_request / ...
  from: string;
  to: string;
  payload: P;
  id?: string;                                       // 预生成 id；缺省自动分配
  dedupe?: boolean;                                  // 去重 (默认 true)
}
export async function enqueueMessage<P>(opts: EnqueueOpts<P>): Promise<{ id: string; path: string }>;

export async function writeQueueIndex(
  channel: string,
  processed: readonly string[]                       // processed.json 去重索引
): Promise<void>;

// ───── Review Request（当前代码尚未落地，预留占位） ──────────────
export async function submitReviewRequest(
  ticketId: string,
  prMeta: { number: number; url: string; title: string; branch: string }
): Promise<{ path: string }>;

// ───── 心跳扩展字段 ─────────────────────────────────────────────
// 修改 HeartbeatOpts，新增：
//   specialty?: string;
//   extra?: Record<string, string | number | boolean>;   // 按 key 字母序追加 YAML 行
export interface HeartbeatOpts {
  role: 'master' | 'slaver';
  instanceId: string;
  status: string;
  currentTask?: string | null;
  specialty?: string;
  extra?: Record<string, string | number | boolean>;
}

// ───── 节点/实例注册 ───────────────────────────────────────────
export interface RegisterNodeOpts {
  role: 'master' | 'slaver';
  instanceId: string;
  specialty?: string;
  worktreeDir?: string | null;
  skills?: readonly string[];
}
export async function registerNode(opts: RegisterNodeOpts): Promise<{ path: string }>;

// ───── 选举文件 ────────────────────────────────────────────────
export async function writeElectionLock(info: {
  masterId: string;
  acquiredAt: number;
  expiresAt: number;
}): Promise<void>;

export async function writeElectionDeclaration(declaration: {
  masterId: string;
  declaredAt: number;
  expiresAt: number;
}): Promise<void>;

export async function writeMasterMarker(markerContent: string): Promise<void>;

// ───── Master / Project / 配置 ─────────────────────────────────
export async function writeMasterContext(serializedYaml: string): Promise<void>;
export async function writeProjectStatus(yamlContent: string): Promise<void>;
export async function writeProjectConfig(yamlContent: string): Promise<void>;   // .eket/config/config.yml
export async function writeInstanceConfig(yamlContent: string): Promise<void>;  // .eket/state/instance_config.yml
export async function writeAgentProfile(
  roleOrSlot: 'current' | string,                   // 'current' → agent_profile.yml；否则 <role>_profile.json
  content: string
): Promise<void>;

// ───── 人类反馈 / 告警 ─────────────────────────────────────────
export async function writeHumanFeedback(
  filename: string,                                 // 相对 inbox/human_feedback/
  markdown: string
): Promise<{ path: string }>;

export async function writeAlert(
  kind: 'email' | 'saved',
  alertId: string,
  json: unknown
): Promise<void>;

// ───── 审计日志扩展 ───────────────────────────────────────────
// 现有签名 audit(action, id, node, extra) 保留；新增结构化重载：
export async function audit(params: {
  channel?: string;                                 // 默认 shared/audit.log；channel='gate-review' → confluence/audit/gate-review-log.jsonl
  action: string;
  subject: string;
  node: string;
  extra?: Record<string, unknown>;
  hashChain?: boolean;                              // true → 计算 prev_hash/hash 字段
}): Promise<void>;
```

---

## 5. Risks & Out-of-Scope

### 5.1 数据格式兼容风险（必须由 Task 0.5 dual-engine 测试把关）

- **心跳字段漂移**：writer.ts 当前不输出 `specialty / pending_prs / ready_tasks` 等业务字段。若直接迁移，**行为变更**——Master 面板读取方会缺字段。必须先扩展 `HeartbeatOpts.extra`（§4）再迁移 #1/#2。
- **Ticket 字段名双语混用**：claim.ts 写中文 `**状态**`，writer.ts `_replaceTicketField` 大小写不敏感但要求英文标题化（`Status`）。迁移 #3 会**改变实际写入的字段名**——必须同步检查 Shell 写 + 模板里现存 ticket 文件是否全部为英文字段，否则会有一批 ticket `transition_ticket` 抛 `field not found`。
- **Gate-review veto 块**：现有实现有正则替换旧 veto 块的幂等逻辑；`appendTicketBlock` 必须支持 `marker` 参数否则多次否决会叠加。

### 5.2 并发 / 锁粒度

- `ticket-index` 7 份索引从同一份 tickets 数据生成。若迁成 7 次 `writeTicketIndex`，每次单独取锁成本高；建议 writer 内再提供 `batchWriteTicketIndex(kvPairs)` 一次性批写。（未列入 top10 以避免接口膨胀，但实现时可内部并发）
- `master-election` 续租 + 冲突检测路径当前依赖 `fs.writeFileSync` 的同步语义（立即可见）。迁移到 `withLock` async 写入后，必须验证续租时间窗口不受 lock 等待拖长导致 leaseTime 逾期。

### 5.3 Out-of-Scope（本轮不迁）

- **`[scaffold-exempt]` 6 处**：`.gitkeep`（start-instance.ts 264/281/297, init-wizard.ts 467）+ 项目根 `.gitignore`（init-wizard.ts 299/302）。OWNERSHIP.md 明确允许脚手架首次创建豁免，加 `// allow: shared-fs-write reason: scaffold-bootstrap` 即可。
- **`[queue-internal]` processed.json × 2**：`optimized-file-queue.ts:197`、`file-queue-manager.ts:132` 是队列实现自身的去重索引。应在 Task 0.6 合并 `file-queue-manager` / `optimized-file-queue`（OWNERSHIP 已标记 `deprecated` 二选一）之后，由胜出实现统一通过 `writeQueueIndex` 落地。
- **`[alert]` × 2 (alerting.ts)**：`core/alerting.ts` 归类 `[node-only]`，但写入目录是否 `shared/alerts/` 由运行时决定。需先决定 alertsDir 是否纳入共享 FS 再定；本轮仅登记为 blocker。
- **`[review-request]`**：本次 grep 未发现 `outbox/review_requests/*.md` 的 Node 直写点。上游 audit 文档列出的 submit-pr 写入实际落在消息队列（本计划 #6）。预留 `submitReviewRequest` 签名但不在本轮迁移范围。
- **Shell 51 处**：属 Task 0.3 `lib/state/writer.sh`，不在本计划。

### 5.4 推进顺序建议

1. **先做 §4 API 扩展**：`HeartbeatOpts.extra` + `writeTicketField` + `enqueueMessage` + `audit` 结构化重载。
2. **再迁 top-4（S 类）**：#1/#2/#3/#8 → 立即消除漂移最痛的心跳 + ticket 状态 + project-status。
3. **解阻塞**：加 `writeTicketIndex / writeElectionLock / writeMasterMarker` 后收 #7/#9。
4. **message 相关**：等 `enqueueMessage` 与 `file-queue-manager` / `optimized-file-queue` 合并决策（OWNERSHIP Task 0.6）联动推进 #5/#6。
5. **剩余低频点**：profile / instance-config / human-feedback 一批补齐。
6. **ESLint 规则 `eket/no-direct-shared-fs-write`** 收尾，防止倒退。

---

> 本计划每一条声明均引用实际文件行号。未引用的决策建议（如何分配 lock key、是否批写）留给实现时评审。
