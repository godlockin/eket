# Convention: Shared FS Surface

**规范等级**: MUST
**适用**: 所有 EKET 引擎代码

---

## 为什么

双引擎（Shell / Node）等价性的前提：**同一块共享状态只有一个写入口**。
混入直接 `fs.writeFile` / `echo >` 会绕过 schema 校验、锁、审计，破坏等价性测试。

---

## 受保护目录（Protected Surface）

以下路径下的**写入**必须经由写入器 API：

```
jira/               # 工单 Markdown
inbox/              # 人类输入、反馈
outbox/             # PR 请求、对外产物
shared/             # 消息队列、audit.log、共享缓存
.eket/state/        # 节点身份、心跳、配置
```

相对路径基准：`$EKET_ROOT`（= git root 或 `pwd`）。

### 不在受保护表面内（自由写）

```
node/logs/          # Node 引擎运行日志
node/dist/          # 构建产物
node/coverage/      # 测试覆盖
.eket/cache/        # 引擎本地缓存
.eket/runtime/      # 进程运行时临时文件
/tmp/**             # 系统临时
```

这些目录不参与双引擎等价性，可任意 `writeFile`。

---

## 写入 API 对照表

每一个受保护路径必须通过下表中的 API 写入：

| 受保护路径 | 写入内容 | Shell API | Node API |
|---|---|---|---|
| `jira/tickets/**/*.md` 元数据字段 | ticket 元数据 | `state_write_ticket <id> <field> <value>` | `writeTicket(id, field, value)` |
| `jira/tickets/**/*.md` status 字段 | 状态转移 | `state_transition_ticket <id> <next>` | `transitionTicket(id, next)` |
| `.eket/state/<role>_<id>_heartbeat.yml` | 心跳 | `state_update_heartbeat <role> <id> <status> [task]` | `updateHeartbeat({ role, instanceId, status, currentTask })` |
| `shared/audit.log` | 审计 | `state_audit <op> <target> <actor> <details>` | `audit(op, target, actor, details)` |
| `shared/message_queue/**` | 消息入/出队 | `state_enqueue_message` / `state_dequeue_message` _(TODO Phase 0)_ | 待建 |
| `inbox/human_input.md` 追加 | 人类输入追加 | `state_append_human_input` _(TODO)_ | 待建 |
| `outbox/review_requests/*.md` | PR 提交 | `state_submit_pr` _(TODO)_ | 待建 |
| `.eket/state/instance_config.yml` | 节点身份 | 初始化向导专用（`init-wizard.sh`） | 初始化向导专用 |

> **待建** 项：Phase 0 规划中；未落地前，相关写入若发生在受保护目录，必须挂**显式例外标记**（见下文）。

底层依赖固定：

- 原子性：`lib/state/atomic.sh` / `node/src/core/state/atomic.ts`
- 锁：`lib/state/lock.sh` / `node/src/core/state/lock.ts`
- 校验：`lib/state/schema.sh` / `node/src/core/state/schema.ts`
- 审计：`lib/state/audit.sh` / `node/src/core/state/audit.ts`

---

## 直接写入（禁止模式）

**禁止**在业务代码中出现：

```bash
# ❌
echo "$content" > jira/tickets/FEAT-042.md
sed -i 's/ready/in_progress/' jira/tickets/FEAT-042.md
yq -i '.status = "done"' jira/tickets/FEAT-042.md
printf '...' >> shared/audit.log
```

```typescript
// ❌
import { writeFile } from 'node:fs/promises';
await writeFile('jira/tickets/FEAT-042.md', updated);
await fs.outputFile('shared/audit.log', line, { flag: 'a' });
```

替换为对应的写入器 API。

---

## 例外标记（Escape Hatch）

少数场景（初始化向导、迁移脚本、测试 fixture 构建）需直写受保护表面。允许但必须**显式标注**理由：

### Shell

```bash
# allow: shared-fs-write reason=initial bootstrap, before state writer is loadable
printf '%s' "$seed" > .eket/state/instance_config.yml
```

### TypeScript

```typescript
// allow: shared-fs-write reason: migration from legacy format (TASK-050)
await writeFile(resolve(root, 'jira/tickets/FEAT-001.md'), migrated);
```

规则：

- 注释必须**紧邻**写入语句的上一行
- `reason=` 后必须是人类可读短语或 ticket ID
- PR 中 reviewer 必须**点名确认** escape hatch，否则 block merge

---

## 强制手段

1. **Shell 扫描**：`scripts/audit-writes.sh`
   - 对 `scripts/**/*.sh` 做正则扫描，发现受保护路径下的 `>` / `>>` / `sed -i` / `yq -i` 且缺失 `# allow:` 注释时报错
   - 纳入 `tests/protocol-compliance/`
2. **ESLint 规则**：`eket/no-direct-shared-fs-write`
   - 位于 `node/eslint-rules/no-direct-shared-fs-write.js`（Task 0.4 交付项）
   - 静态分析 `fs` / `fs/promises` / `fs-extra` 的写函数，路径参数包含受保护前缀时报错
   - 认可紧邻的 `// allow: shared-fs-write` 注释
3. **双引擎等价性测试**：`tests/dual-engine/**`
   - 同一序列分别由 Shell、Node 执行，受保护目录下的最终字节应**逐位相等**（审计的 engine 列与时间戳除外）
   - 等价失败即违规，回溯查找绕过 API 的直写

---

## 审计表面完整性

只要所有写入走 API，`shared/audit.log` 就是**共享状态变更的完整流水账**。
任何调试时发现 audit.log 缺条但文件内容改变 → **存在直写漏洞**，优先修复。
