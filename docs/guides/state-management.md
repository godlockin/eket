# node/src/core/state/ — Node 共享状态写入层

**状态**: Skeleton — Phase 0 / Task 0.4
**对应 Shell**: [`lib/state/`](../../../../lib/state/)

---

## 核心原则

> **所有 `node/src/` 对 `jira/` / `inbox/` / `outbox/` / `shared/` / `.eket/state/` 的写入必须通过此模块，禁止直接 `fs.writeFile`。**

类比：`node/src/commands/*.ts` = 应用代码；`core/state/` = 标准库。
业务代码 import，不直接操作 FS。

---

## 文件分工

| 文件 | 职责 |
|------|------|
| [`writer.ts`](writer.ts) | 写入（writeTicket / transitionTicket / updateHeartbeat） |
| [`reader.ts`](reader.ts) | 读取（readTicketField / listTickets） |
| [`schema.ts`](schema.ts) | Ajv + 状态机校验（JSON/YAML schema） |
| [`lock.ts`](lock.ts) | proper-lockfile 封装（跨引擎协作锁） |
| [`atomic.ts`](atomic.ts) | tmp + rename 原子写 |
| [`audit.ts`](audit.ts) | 审计日志（与 Shell 行格式等价，engine 列除外） |
| [`env.ts`](env.ts) | EKET_ROOT / EKET_NODE_ID 解析 |

---

## 使用示例

```typescript
import { transitionTicket, writeTicket, updateHeartbeat } from '../core/state/index.js';

// 状态转移（内部做 schema + 锁 + 原子写 + 审计）
await transitionTicket('FEAT-001', 'in_progress');
await writeTicket('FEAT-001', 'assignee', 'alicemac-node-slaver-frontend_dev-a1b2c3');

// 心跳
await updateHeartbeat({
  role: 'slaver',
  instanceId: 'slaver-abc123',
  status: 'working',
  currentTask: 'FEAT-001',
});
```

---

## 禁止模式（ESLint + CI）

```typescript
// ❌ 直接 fs 写入
await fs.writeFile('jira/tickets/FEAT-001.md', content);
await fs.writeFileSync('.eket/state/heartbeat.yml', data);

// ❌ fs-extra
await fse.outputFile('shared/message_queue/msg.json', ...);

// ✅ 通过 state 层
await transitionTicket('FEAT-001', 'done');
```

由 ESLint 规则 `eket/no-direct-shared-fs-write`（待建）静态拦截。

---

## 与 Shell 层的协作

| 方面 | 协作方式 |
|------|---------|
| Schema | 共用 `protocol/schemas/` 源文件 |
| 状态机 | 共用 `protocol/state-machines/ticket-status.yml` |
| 锁文件 | 同一 `lockfile` 路径，双方写 `.holder` 声明 |
| 原子写 | 双方都 `tmp + rename`，tmp 命名不冲突 |
| 审计行 | 同格式，engine 列区分 (`shell` / `node`) |

等价性由 [`tests/dual-engine/`](../../../../tests/dual-engine/) 验证。

---

## 依赖

| 包 | 用途 |
|----|------|
| `ajv` + `ajv-formats` | JSON Schema 校验（已在 package.json） |
| `js-yaml` | YAML schema / 状态机读取（已在 package.json） |
| `proper-lockfile` | 跨进程锁（已在 package.json） |

无新增依赖。

---

## 实现状态（Phase 0 / Task 0.4）

| 模块 | 状态 |
|------|------|
| `env.ts` | ✅ Skeleton |
| `atomic.ts` | ✅ Skeleton |
| `lock.ts` | ✅ Skeleton |
| `audit.ts` | ✅ Skeleton |
| `schema.ts` | ✅ Skeleton（含 state-machine + 字段快速校验） |
| `reader.ts` | ✅ Skeleton（Markdown 元数据提取） |
| `writer.ts` | ✅ Skeleton（writeTicket / transitionTicket / updateHeartbeat） |
| ESLint 规则 | ⚪ 未开始（`eket/no-direct-shared-fs-write`） |
| 迁移存量 58 处写入 | ⚪ 未开始 |

---

## 下一步

1. 接入 ESLint 自定义规则拦截新代码违规
2. 按 audit 里的 58 处写入优先级逐个迁移：
   - 先迁 `commands/ticket-index.ts` (7x 高频写) → `writeTicket`
   - 再迁 `commands/master-poll.ts` / `slaver-poll.ts` (心跳) → `updateHeartbeat`
   - 消息队列走 `message-queue.ts` 的包装（独立小节，Phase 0 末期再做）
3. 填充 `tests/dual-engine/scenarios/01-claim-ticket.sh` 的真实调用
