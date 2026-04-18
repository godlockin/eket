/**
 * node/src/core/state/writer.ts — EKET Node 共享状态写入的唯一入口
 *
 * ⚠ 所有 node/src/ 对 jira/ / inbox/ / outbox/ / shared/ / .eket/state/
 *   的写入必须通过此模块，禁止直接 fs.writeFile / fs-extra.outputFile。
 *
 * CI 扫描违反模式见 node/eslint-rules/no-direct-shared-fs-write.js（待建）
 * Shell 对应: lib/state/writer.sh
 * Phase: 0 / Task 0.4
 */

import { hostname } from 'node:os';
import { readFileSync, readdirSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWrite } from './atomic.js';
import { audit } from './audit.js';
import { getEketRoot, getNodeId } from './env.js';
import { withLock } from './lock.js';
import { locateTicketFile, readTicketField } from './reader.js';
import {
  getProtocolVersion,
  validate,
  validateHeartbeatStatus,
  validateImportance,
  validatePriority,
  validateTicketId,
  validateTicketStatus,
  validateTicketTransition,
} from './schema.js';

// ═════════════════════════════════════════════════════════════════════════
// 启动自检（惰性执行，首次写操作时触发）
// ═════════════════════════════════════════════════════════════════════════
let _inited = false;
function ensureInit(): void {
  if (_inited) {
    return;
  }
  const v = getProtocolVersion();
  if (!v) {
    throw new Error('state: empty protocol/VERSION');
  }
  _inited = true;
}

// ═════════════════════════════════════════════════════════════════════════
// Ticket
// ═════════════════════════════════════════════════════════════════════════

// ─── 可写字段白名单（与 Shell 必须完全一致） ─────────────────────
// 规范: protocol/conventions/ticket-format.md 《可写字段白名单》
// SSoT: protocol/schemas/ticket.meta.schema.yml
//
// 在此修改时必须同时同步:
//   1. protocol/conventions/ticket-format.md 表格
//   2. lib/state/writer.sh 的 _WRITABLE_TICKET_FIELDS
export const WRITABLE_TICKET_FIELDS = [
  'title',
  'status',
  'priority',
  'importance',
  'epic',
  'assignee',
  'branch',
  'updated_at',
  'estimated_hours',
  'actual_hours',
  'tags',
] as const;

export type TicketField = (typeof WRITABLE_TICKET_FIELDS)[number];

function isWritableField(field: string): field is TicketField {
  return (WRITABLE_TICKET_FIELDS as readonly string[]).includes(field);
}

/**
 * 写入 ticket 元数据字段（Markdown `**Field**: value` 行）。
 *
 * 内部执行：schema 校验 → 加锁 → 原子写 → 审计。
 */
export async function writeTicket(
  id: string,
  field: TicketField,
  value: string
): Promise<void> {
  ensureInit();
  validateTicketId(id);
  if (!isWritableField(field)) {
    throw new Error(`write_ticket: field not writable: ${field}`);
  }
  switch (field) {
    case 'status':
      validateTicketStatus(value);
      break;
    case 'priority':
      validatePriority(value);
      break;
    case 'importance':
      validateImportance(value);
      break;
  }

  const file = locateTicketFile(id);
  await withLock(`ticket:${id}`, async () => {
    const original = readFileSync(file, 'utf-8');
    const updated = _replaceTicketField(original, field, value);
    if (updated === original) {
      throw new Error(`write_ticket: field not found: ${field} in ${file}`);
    }
    await atomicWrite(file, updated);
    await audit('write_ticket', id, getNodeId(), `${field}=${value}`);
  });
}

/** 状态转移（先校验合法性，再写 status 字段） */
export async function transitionTicket(id: string, nextStatus: string): Promise<void> {
  ensureInit();
  validateTicketId(id);

  const currentRaw = readTicketField(id, 'status');
  if (!currentRaw) {
    throw new Error(`transition_ticket: current status missing on ${id}`);
  }
  const current = currentRaw.trim().toLowerCase();
  validateTicketTransition(current, nextStatus);

  await writeTicket(id, 'status', nextStatus);
}

// ═════════════════════════════════════════════════════════════════════════
// Heartbeat
// ═════════════════════════════════════════════════════════════════════════

export interface HeartbeatOpts {
  role: 'master' | 'slaver';
  instanceId: string;
  status: string;
  currentTask?: string | null;
  /**
   * 额外字段（如 specialty / pending_prs / ready_tasks），追加在核心字段之后。
   *
   * 为保证双引擎快照字节等价，extras 按 key 字典顺序序列化。
   */
  extras?: Record<string, string | number | null>;
}

/**
 * 写心跳文件（与 Shell `state_update_heartbeat` 字节等价）
 * 位置: .eket/state/<role>_<instance_id>_heartbeat.yml
 *
 * extras 按 key 字典序序列化，避免 Map 迭代顺序导致的字节漂移。
 */
export async function updateHeartbeat(opts: HeartbeatOpts): Promise<void> {
  ensureInit();
  validateHeartbeatStatus(opts.status);

  const file = `${getEketRoot()}/.eket/state/${opts.role}_${opts.instanceId}_heartbeat.yml`;
  const ts = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const taskLine =
    opts.currentTask == null || opts.currentTask === ''
      ? 'current_task: ~'
      : `current_task: "${opts.currentTask}"`;

  let content =
    `instance_id: ${opts.instanceId}\n` +
    `role: ${opts.role}\n` +
    `status: ${opts.status}\n` +
    `${taskLine}\n` +
    `timestamp: ${ts}\n` +
    `host: ${hostname().split('.')[0]}\n` +
    `pid: ${process.pid}\n`;

  if (opts.extras) {
    const keys = Object.keys(opts.extras).sort();
    for (const k of keys) {
      const v = opts.extras[k];
      content += v == null ? `${k}: ~\n` : `${k}: ${v}\n`;
    }
  }

  await withLock(`heartbeat:${opts.instanceId}`, async () => {
    await atomicWrite(file, content);
    await audit('heartbeat', opts.instanceId, opts.instanceId, `status=${opts.status}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Message queue
// ═══════════════════════════════════════════════════════════════════════════

export interface Message {
  id: string;
  timestamp: string;
  from: string;
  to: string;
  type: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  payload: Record<string, unknown>;
}

/**
 * 入队消息 → shared/message_queue/inbox/<id>.json
 *
 * 可省略 `id` / `timestamp` / `from`，writer 自动填充。
 * 所有消息进 schema 校验后写入，失败不落盘。
 */
export async function enqueueMessage(
  msg: Omit<Message, 'id' | 'timestamp' | 'from'> &
    Partial<Pick<Message, 'id' | 'timestamp' | 'from'>>
): Promise<Message> {
  ensureInit();

  const id = msg.id ?? _genMessageId();
  const ts = msg.timestamp ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const from = msg.from ?? getNodeId();
  // P0-9: 与 Shell state_enqueue_message 的默认 P1 对齐（字节等价）
  const priority = msg.priority ?? 'P1';

  // 字段顺序必须与 lib/state/writer.sh 的 state_enqueue_message 对齐（字节等价）：
  // id → timestamp → from → to → type → priority → payload
  const finalMsg: Message = {
    id,
    timestamp: ts,
    from,
    to: msg.to,
    type: msg.type,
    priority,
    payload: msg.payload,
  };

  validate('message', finalMsg);

  const filepath = join(
    getEketRoot(),
    'shared',
    'message_queue',
    'inbox',
    `${id}.json`
  );
  const content = JSON.stringify(finalMsg, null, 2) + '\n';

  await withLock(`message:${id}`, async () => {
    await atomicWrite(filepath, content);
    await audit('enqueue_message', id, from, `to=${finalMsg.to} type=${finalMsg.type}`);
  });

  return finalMsg;
}

/**
 * 生成符合协议格式的消息 ID: `msg_YYYYMMDD_HHMMSS_NNN`。
 * 所有内存/Redis/WebSocket 队列也必须使用此 ID 生成器（P0-1/2 统一 ID 空间）。
 */
export function genMessageId(): string {
  return _genMessageId();
}

function _genMessageId(): string {
  // 格式：msg_YYYYMMDD_HHMMSS_NNN（P0-8: 900 → 900×86400 空间，
  // 同秒碰撞概率 900 选 1，跨秒完全不碰撞；与 Shell $(date -u +%Y%m%d_%H%M%S) + $RANDOM 对齐）
  const d = new Date();
  const ymd =
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  const hms =
    String(d.getUTCHours()).padStart(2, '0') +
    String(d.getUTCMinutes()).padStart(2, '0') +
    String(d.getUTCSeconds()).padStart(2, '0');
  const n = String(Math.floor(Math.random() * 900) + 100);
  return `msg_${ymd}_${hms}_${n}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PR / review request
// ═══════════════════════════════════════════════════════════════════════════

export interface ReviewRequest {
  ticketId: string;
  submitter: string;
  branch: string;
  targetBranch?: string;
  /** Markdown 正文（按 outbox/review_requests 模板） */
  body: string;
}

/**
 * 提交 PR 审评请求 → outbox/review_requests/pr-<ticket>-<ts>.md
 *
 * 文件名格式与 Shell `scripts/submit-pr.sh` 对齐。
 */
export async function submitReviewRequest(req: ReviewRequest): Promise<string> {
  ensureInit();
  validateTicketId(req.ticketId);

  const ts = new Date()
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/[:-]/g, '');
  const filename = `pr-${req.ticketId}-${ts}.md`;
  const filepath = join(
    getEketRoot(),
    'outbox',
    'review_requests',
    filename
  );

  await withLock(`review:${req.ticketId}`, async () => {
    await atomicWrite(
      filepath,
      req.body.endsWith('\n') ? req.body : `${req.body}\n`
    );
    await audit(
      'submit_pr',
      req.ticketId,
      req.submitter,
      `branch=${req.branch} file=${filename}`
    );
  });

  return filepath;
}

// ═══════════════════════════════════════════════════════════════════════════
// Message queue (consume side)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 出队一条消息 → 原子 rename 到 `processing/`，返回解析后的消息。
 *
 * 语义:
 *   - FIFO 近似：按文件名字典序（msg_YYYYMMDD_NNN 天然有序）
 *   - 原子移动：`inbox/<id>.json` → `processing/<id>.json`，避免两个消费者重复处理
 *   - 无消息返回 `null`
 *
 * @param filter 可选，返回 true 才认领；默认总认领
 */
export async function dequeueMessage(
  filter?: (msg: Message) => boolean
): Promise<Message | null> {
  ensureInit();

  const inboxDir = join(getEketRoot(), 'shared', 'message_queue', 'inbox');
  const processingDir = join(getEketRoot(), 'shared', 'message_queue', 'processing');
  const deadLetterDir = join(getEketRoot(), 'shared', 'message_queue', 'dead-letter');

  if (!existsSync(inboxDir)) {
    return null;
  }

  mkdirSync(processingDir, { recursive: true });

  const files = readdirSync(inboxDir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const f of files) {
    const src = join(inboxDir, f);
    const dst = join(processingDir, f);

    // P0-5: 先 rename 抢占（原子，消除 TOCTOU），再 parse；parse/filter 失败进 dead-letter。
    // 日志全路径记录，便于事后排查；静默 return null 是审计黑洞。
    const claimed = await withLock(`message:${f}`, async () => {
      if (!existsSync(src)) {
        return null;
      }
      try {
        renameSync(src, dst);
      } catch (e) {
        // 被其他 consumer 抢走或文件消失
        await audit(
          'dequeue_message_skip',
          f,
          getNodeId(),
          `reason=rename_failed err=${(e as Error).message}`
        );
        return null;
      }
      let msg: Message;
      try {
        msg = JSON.parse(readFileSync(dst, 'utf-8')) as Message;
      } catch (e) {
        // 损坏消息：搬到 dead-letter，避免无限重试
        mkdirSync(deadLetterDir, { recursive: true });
        try {
          renameSync(dst, join(deadLetterDir, f));
        } catch {
          /* best effort */
        }
        await audit(
          'dequeue_message_dead_letter',
          f,
          getNodeId(),
          `reason=parse_error err=${(e as Error).message}`
        );
        return null;
      }
      if (filter && !filter(msg)) {
        // 不符合 filter：还回 inbox，留给其他消费者
        try {
          renameSync(dst, src);
        } catch (e) {
          await audit(
            'dequeue_message_skip',
            msg.id,
            getNodeId(),
            `reason=filter_return_failed err=${(e as Error).message}`
          );
        }
        return null;
      }
      return msg;
    });

    if (claimed) {
      await audit(
        'dequeue_message',
        claimed.id,
        getNodeId(),
        `type=${claimed.type} from=${claimed.from}`
      );
      return claimed;
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Node profile
// ═══════════════════════════════════════════════════════════════════════════

export interface NodeProfile {
  node_id: string;
  role: 'master' | 'slaver';
  specialty?: string;
  registered_at?: string;
  capabilities?: string[];
  [k: string]: unknown;
}

/**
 * 注册节点 → `.eket/state/nodes/<node_id>.yml`
 *
 * 幂等：重复 register 同一 node_id 会覆盖 profile（保留 registered_at 首次时间戳）。
 */
export async function registerNode(profile: NodeProfile): Promise<void> {
  ensureInit();

  const filepath = join(
    getEketRoot(),
    '.eket',
    'state',
    'nodes',
    `${profile.node_id}.yml`
  );

  // 首次 registered_at 保留
  let registered_at = profile.registered_at;
  if (!registered_at && existsSync(filepath)) {
    const prev = readFileSync(filepath, 'utf-8');
    const m = prev.match(/^registered_at:\s*(.+)$/m);
    if (m) {
      registered_at = m[1]!.trim();
    }
  }
  if (!registered_at) {
    registered_at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  }

  const finalProfile: NodeProfile = {
    ...profile,
    registered_at,
  };

  // P0-9: Phase 0 不做 node.profile schema 校验（schema 文件标注 "Phase 1 启用"，
  // 要求 node_id/type/role/host/joined_at 5 字段；当前 registerNode 白名单仅 4 字段，
  // 校验必失败且与 Shell state_register_node 不对称）。
  // TODO(Phase 1): 扩展 registerNode 输出 type/host/joined_at 后重新启用校验。
  // validate('node.profile', finalProfile);

  // YAML 序列化（白名单，保 Shell 字节等价）：
  // 只序列化核心 4 字段 node_id/registered_at/role/specialty，字典序；
  // 其他字段（如 capabilities）即使 profile 携带也不落盘，防止 Shell/Node diff。
  // P0-3 等价性修复：Shell state_register_node 固定序列化这 4 字段。
  const PROFILE_ALLOWED_KEYS = ['node_id', 'registered_at', 'role', 'specialty'] as const;
  let content = '';
  for (const k of PROFILE_ALLOWED_KEYS) {
    const v = (finalProfile as Record<string, unknown>)[k];
    if (v == null || v === '') continue;
    content += `${k}: ${v}\n`;
  }

  await withLock(`node:${profile.node_id}`, async () => {
    await atomicWrite(filepath, content);
    await audit('register_node', profile.node_id, profile.node_id, `role=${profile.role}`);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Project status snapshot
// ═══════════════════════════════════════════════════════════════════════════

export interface ProjectStatus {
  last_updated?: string;
  slavers: {
    active: string[];
    idle: string[];
    busy: string[];
  };
  cards: {
    milestones: string[];
    sprints: string[];
    epics: string[];
    tickets: string[];
  };
  progress: {
    sprint_target: string | null;
    deadline: string | null;
    days_remaining: number | null;
    completed: number;
    total: number;
    completion_rate?: string;
  };
  risks?: string[];
  action_items?: string[];
}

/**
 * 写项目状态快照 → `jira/state/project-status.yml`
 *
 * - 由 Master 轮询周期性更新
 * - completion_rate 自动从 completed/total 计算（若调用方未提供）
 * - 序列化按 project-status schema 字段顺序，避免字节漂移
 */
export async function writeProjectStatus(status: ProjectStatus): Promise<void> {
  ensureInit();

  const last_updated =
    status.last_updated ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const rate =
    status.progress.completion_rate ??
    (status.progress.total > 0
      ? `${Math.round((status.progress.completed / status.progress.total) * 100)}%`
      : '0%');

  const final: ProjectStatus = {
    ...status,
    last_updated,
    progress: { ...status.progress, completion_rate: rate },
    risks: status.risks ?? [],
    action_items: status.action_items ?? [],
  };

  validate('project-status', final);

  const filepath = join(getEketRoot(), 'jira', 'state', 'project-status.yml');

  let content = `# 项目状态报告\n# 生成于：${last_updated}\n\n`;
  content += `last_updated: ${last_updated}\n\n`;
  content += `slavers:\n`;
  for (const k of ['active', 'idle', 'busy'] as const) {
    const arr = final.slavers[k];
    if (arr.length === 0) {
      content += `  ${k}: []\n`;
    } else {
      content += `  ${k}:\n`;
      for (const item of arr) content += `    - ${item}\n`;
    }
  }
  content += `\ncards:\n`;
  for (const k of ['milestones', 'sprints', 'epics', 'tickets'] as const) {
    const arr = final.cards[k];
    if (arr.length === 0) {
      content += `  ${k}: []\n`;
    } else {
      content += `  ${k}:\n`;
      for (const item of arr) content += `    - ${item}\n`;
    }
  }
  content += `\nprogress:\n`;
  content += `  sprint_target: ${final.progress.sprint_target ?? '~'}\n`;
  content += `  deadline: ${final.progress.deadline ?? '~'}\n`;
  content += `  days_remaining: ${final.progress.days_remaining ?? '~'}\n`;
  content += `  completed: ${final.progress.completed}\n`;
  content += `  total: ${final.progress.total}\n`;
  content += `  completion_rate: ${rate}\n\n`;

  const risks = final.risks ?? [];
  if (risks.length === 0) content += `risks: []\n`;
  else {
    content += `risks:\n`;
    for (const r of risks) content += `  - ${r}\n`;
  }

  const actions = final.action_items ?? [];
  if (actions.length === 0) content += `action_items: []\n`;
  else {
    content += `action_items:\n`;
    for (const a of actions) content += `  - ${a}\n`;
  }

  await withLock('project-status', async () => {
    await atomicWrite(filepath, content);
    await audit('write_project_status', 'project', getNodeId(), `completed=${final.progress.completed}/${final.progress.total}`);
  });
}

// ═════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═════════════════════════════════════════════════════════════════════════

/**
 * 在 Markdown 元数据块中替换 `**<Field>**: <value>` 行，保留其余内容。
 * 规则: Shell 版 awk 逻辑的 TS 对等实现。
 *
 * @returns 更新后的文本；未找到字段时返回原文（调用方判断抛错）
 */
function _replaceTicketField(source: string, field: string, value: string): string {
  const fieldTitle = field
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ');

  const lines = source.split('\n');
  let replaced = false;
  let inBody = false;
  const out = lines.map((line) => {
    // 仅在元数据块内替换，碰到首个 "## " 标题后停止（避免正文反模式误伤）
    if (/^## /.test(line)) {
      inBody = true;
    }
    if (replaced || inBody) {
      return line;
    }
    const m = line.match(/^\*\*([^*]+)\*\*:/);
    if (m && m[1].trim().toLowerCase() === fieldTitle.toLowerCase()) {
      replaced = true;
      return `**${fieldTitle}**: ${value}`;
    }
    return line;
  });
  if (!replaced) {
    return source;
  }
  return out.join('\n');
}
