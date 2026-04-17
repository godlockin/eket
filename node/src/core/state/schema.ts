/**
 * node/src/core/state/schema.ts — 从 protocol/schemas/ 做数据校验
 *
 * Shell 对应: lib/state/schema.sh
 *
 * 用 ajv 做完整 JSON Schema draft-07 校验；YAML schema 通过 js-yaml 转 JSON。
 * 校验失败统一抛 SchemaError，错误信息与 Shell 端保持风格一致。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import yaml from 'js-yaml';

import { getEketRoot } from './env.js';

// ─── Errors ─────────────────────────────────────────────────────────────
export class SchemaError extends Error {
  readonly kind = 'SchemaError';
  readonly errors?: unknown;

  constructor(message: string, errors?: unknown) {
    super(message);
    this.errors = errors;
  }
}

// ─── Ajv instance ───────────────────────────────────────────────────────
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const _validators = new Map<string, ValidateFunction>();

function protocolDir(): string {
  return join(getEketRoot(), 'protocol');
}

/**
 * 懒加载 schema 并编译为 ajv 校验函数。
 *
 * @param name 例如 `ticket.meta`、`message`、`heartbeat`、`node.profile`
 */
function loadValidator(name: string): ValidateFunction {
  const cached = _validators.get(name);
  if (cached) {
    return cached;
  }

  const schemasDir = join(protocolDir(), 'schemas');
  const candidates = [`${name}.schema.json`, `${name}.schema.yml`, `${name}.schema.yaml`];

  let schema: unknown;
  for (const c of candidates) {
    const p = join(schemasDir, c);
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf-8');
      schema = c.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw);
      break;
    }
  }
  if (!schema) {
    throw new SchemaError(`schema not found for: ${name}`);
  }

  const validator = ajv.compile(schema as object);
  _validators.set(name, validator);
  return validator;
}

/**
 * 针对指定 schema 校验数据，失败则抛 SchemaError。
 */
export function validate(schemaName: string, data: unknown): void {
  const v = loadValidator(schemaName);
  if (!v(data)) {
    throw new SchemaError(
      `schema: ${schemaName} validation failed`,
      v.errors ?? undefined
    );
  }
}

// ─── 协议版本 ────────────────────────────────────────────────────────────
let _cachedVersion: string | null = null;

export function getProtocolVersion(): string {
  if (_cachedVersion) {
    return _cachedVersion;
  }
  const p = join(protocolDir(), 'VERSION');
  if (!existsSync(p)) {
    throw new SchemaError(`protocol/VERSION missing at ${p}`);
  }
  _cachedVersion = readFileSync(p, 'utf-8').trim();
  return _cachedVersion;
}

// ─── Ticket 状态机 ───────────────────────────────────────────────────────
interface StateMachine {
  initial: string;
  states: Record<
    string,
    {
      description?: string;
      allowed_transitions: string[];
      who_can_transition?: string[];
      terminal?: boolean;
      requires?: string[];
    }
  >;
}

let _cachedSm: StateMachine | null = null;

function loadStateMachine(): StateMachine {
  if (_cachedSm) {
    return _cachedSm;
  }
  const p = join(protocolDir(), 'state-machines', 'ticket-status.yml');
  if (!existsSync(p)) {
    throw new SchemaError(`state machine missing: ${p}`);
  }
  _cachedSm = yaml.load(readFileSync(p, 'utf-8')) as StateMachine;
  return _cachedSm;
}

export function validateTicketStatus(status: string): void {
  const sm = loadStateMachine();
  if (!(status in sm.states)) {
    throw new SchemaError(`schema: invalid ticket status '${status}'`);
  }
}

export function validateTicketTransition(current: string, next: string): void {
  const sm = loadStateMachine();
  const state = sm.states[current];
  if (!state) {
    throw new SchemaError(`schema: state '${current}' not found`);
  }
  if (!state.allowed_transitions.includes(next)) {
    throw new SchemaError(`schema: invalid transition ${current} -> ${next}`);
  }
}

// ─── 快速字段校验（与 Shell 等价） ───────────────────────────────────────
const TICKET_ID_RE = /^(FEAT|TASK|FIX|TEST|DEPL|T-DESIGN)-[0-9]{3,6}$/;
const NODE_ID_RE = /^[a-z][a-z0-9_-]{2,63}$/;
const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const IMPORTANCES = new Set(['critical', 'high', 'medium', 'low']);
const HEARTBEAT_STATUSES = new Set([
  'idle',
  'busy',
  'working',
  'blocked',
  'offline',
  'draining',
]);

export function validateTicketId(id: string): void {
  if (!TICKET_ID_RE.test(id)) {
    throw new SchemaError(`schema: invalid ticket id '${id}'`);
  }
}

export function validateNodeId(id: string): void {
  if (!NODE_ID_RE.test(id)) {
    throw new SchemaError(`schema: invalid node_id '${id}'`);
  }
}

export function validatePriority(v: string): void {
  if (!PRIORITIES.has(v)) {
    throw new SchemaError(`schema: invalid priority '${v}'`);
  }
}

export function validateImportance(v: string): void {
  if (!IMPORTANCES.has(v)) {
    throw new SchemaError(`schema: invalid importance '${v}'`);
  }
}

export function validateHeartbeatStatus(v: string): void {
  if (!HEARTBEAT_STATUSES.has(v)) {
    throw new SchemaError(
      `schema: invalid heartbeat status '${v}' (expected idle/busy/working/blocked/offline/draining)`
    );
  }
}

/** 仅测试用 */
export function _resetSchemaCache(): void {
  _validators.clear();
  _cachedVersion = null;
  _cachedSm = null;
}
