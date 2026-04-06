/**
 * Agent Mailbox Module
 *
 * 基于文件系统的 P2P 消息通信机制，作为 Redis 消息队列的容灾设计。
 *
 * 核心设计：
 * - 每个 Agent 有独立 inbox 文件：~/.eket/inboxes/{agent_id}.json
 * - 写入时用文件锁（lockfile）防止多进程并发冲突
 * - 重试退避：10 次重试，5-100ms 随机间隔
 * - 结构化消息类型：任务分配、任务完成、空闲通知、权限请求、关机请求
 *
 * @module AgentMailbox
 */

import * as fs from 'fs';
import * as path from 'path';

import lockfile from 'proper-lockfile';

import type { AuditLogger } from '../api/audit-logger.js';
import { EketError, EketErrorCode } from '../types/index.js';
import type { Result } from '../types/index.js';
import { encrypt, decrypt, isEncryptionEnabled, getEncryptionKey } from '../utils/encryption.js';

// ============================================================================
// 审计日志全局配置
// ============================================================================

/**
 * 全局审计日志实例（可选）
 * 如果设置了此实例，所有数据访问操作都会被记录
 */
let globalAuditLogger: AuditLogger | null = null;

/**
 * 设置全局审计日志实例
 */
export function setMailboxAuditLogger(auditLogger: AuditLogger): void {
  globalAuditLogger = auditLogger;
}

/**
 * 记录数据访问审计日志
 */
async function logAccessAudit(
  action: 'READ' | 'WRITE' | 'DELETE',
  actor: string,
  targetAgentId: string,
  details?: Record<string, unknown>
): Promise<void> {
  if (!globalAuditLogger) {
    return;
  }

  try {
    await globalAuditLogger.log(
      `MAILBOX_${action}`,
      actor,
      {
        targetAgent: targetAgentId,
        ...details,
      },
      `mailbox:${targetAgentId}`
    );
  } catch (error) {
    console.error('[Agent Mailbox] Audit log error:', error);
  }
}

// ============================================================================
// 文件锁工具（proper-lockfile 封装）
// ============================================================================

/**
 * 文件锁选项类型
 */
type LockOptions = {
  stale?: number;
  update?: number;
  retries?: {
    retries: number;
    minTimeout: number;
    maxTimeout: number;
  };
};

/**
 * 文件锁最大重试次数
 */
const MAX_LOCK_RETRIES = 10;

/**
 * 文件锁配置
 * proper-lockfile 自动处理锁文件，不需要手动指定 lockfilePath
 */
const LOCK_OPTIONS: LockOptions = {
  stale: 5000, // 5 秒后认为锁已过期
  update: 2000, // 每 2 秒更新锁
  retries: {
    retries: MAX_LOCK_RETRIES,
    minTimeout: 5,
    maxTimeout: 100,
  },
};

/**
 * 获取文件锁（proper-lockfile 封装）
 * proper-lockfile 自动处理锁文件，返回释放锁的函数
 */
async function acquireLock(filePath: string): Promise<() => Promise<void>> {
  return await lockfile.lock(filePath, LOCK_OPTIONS);
}

/**
 * 释放文件锁
 */
async function releaseLock(release: () => Promise<void>): Promise<void> {
  try {
    await release();
  } catch (error) {
    // 忽略释放锁时的错误（可能锁已经过期）
    console.debug('[Agent Mailbox] Lock release error (ignored):', (error as Error).message);
  }
}

// ============================================================================
// 核心消息类型
// ============================================================================

/**
 * 基础消息接口
 */
export interface AgentMessage {
  id: string;
  from: string;
  text: string;
  timestamp: string;
  read: boolean;
  color?: string; // 发送方颜色标识
  summary?: string; // 5-10 词摘要，用于 UI 预览
}

/**
 * 空闲通知：Agent 完成任务后向 Master 发送的空闲通知
 */
export interface IdleNotificationMessage {
  type: 'idle_notification';
  from: string;
  timestamp: string;
  idleReason?: 'available' | 'interrupted' | 'failed';
  summary?: string; // 最后一次任务的简短摘要
  completedTaskId?: string;
  completedStatus?: 'resolved' | 'blocked' | 'failed';
  failureReason?: string;
}

/**
 * 任务分配消息：Master → Worker
 */
export interface TaskAssignmentMessage {
  type: 'task_assignment';
  taskId: string;
  subject: string;
  description: string;
  assignedBy: string;
  timestamp: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  tags?: string[];
}

/**
 * 任务完成通知：Worker → Master
 */
export interface TaskCompletedNotification {
  type: 'task_completed_notification';
  taskId: string;
  from: string;
  timestamp: string;
  status: 'completed' | 'failed' | 'blocked';
  result?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}

/**
 * 权限请求：Worker → Master，申请执行敏感操作
 */
export interface PermissionRequestMessage {
  type: 'permission_request';
  requestId: string;
  agentId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
  timestamp: string;
}

/**
 * 权限响应：Master → Worker，批准/拒绝敏感操作
 */
export interface PermissionResponseMessage {
  type: 'permission_response';
  requestId: string;
  approved: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
  timestamp: string;
}

/**
 * 关机请求：Master ↔ Worker 的优雅关机协议
 */
export interface ShutdownRequestMessage {
  type: 'shutdown_request';
  requestId: string;
  from: string;
  reason?: string;
  timestamp: string;
}

/**
 * 所有结构化消息类型的联合
 */
export type StructuredMessage =
  | IdleNotificationMessage
  | TaskAssignmentMessage
  | TaskCompletedNotification
  | PermissionRequestMessage
  | PermissionResponseMessage
  | ShutdownRequestMessage;

// ============================================================================
// 路径工具
// ============================================================================

/**
 * 获取 inbox 目录
 * 支持通过 EKET_INBOX_DIR 环境变量覆盖（用于测试）
 */
function getInboxDir(): string {
  return process.env.EKET_INBOX_DIR || path.join(process.cwd(), '.eket', 'data', 'inboxes');
}

/**
 * inbox 文件路径：~/.eket/data/inboxes/{agent_id}.json
 */
export function getInboxPath(agentId: string): string {
  const safeAgentId = sanitizePathComponent(agentId);
  return path.join(getInboxDir(), `${safeAgentId}.json`);
}

/**
 * 清理路径组件，防止路径注入
 */
function sanitizePathComponent(name: string): string {
  return name.replace(/[\/\\]/g, '_');
}

/**
 * 加密消息内容
 * 如果未配置加密密钥，则返回原文
 */
function encryptContent(content: string): string {
  if (!isEncryptionEnabled()) {
    return content;
  }
  try {
    const key = getEncryptionKey();
    if (!key) {
      return content;
    }
    const encrypted = encrypt(content, key);
    return JSON.stringify(encrypted);
  } catch (error) {
    console.error('[Agent Mailbox] Encryption error:', error);
    return content; // 加密失败时降级为明文
  }
}

/**
 * 解密消息内容
 * 如果内容未加密或无法解密，返回原文
 */
function decryptContent(content: string): string {
  if (!isEncryptionEnabled()) {
    return content;
  }
  try {
    // 尝试解析为加密数据
    const maybeEncrypted = JSON.parse(content) as {
      salt?: string;
      iv?: string;
      encryptedData?: string;
      authTag?: string;
    };
    if (
      maybeEncrypted.salt &&
      maybeEncrypted.iv &&
      maybeEncrypted.encryptedData &&
      maybeEncrypted.authTag
    ) {
      const key = getEncryptionKey();
      if (!key) {
        return content;
      }
      // 类型断言，因为上面已经检查了所有字段都存在
      return decrypt(maybeEncrypted as import('../utils/encryption.js').EncryptedData, key);
    }
  } catch {
    // 不是有效的加密数据，返回原文
  }
  return content;
}

/**
 * 验证 Agent ID 是否合法，防止路径注入攻击
 * 检查是否包含非法字符（路径分隔符、特殊字符等）
 */
function validateAgentId(agentId: string): boolean {
  // 不允许为空
  if (!agentId || agentId.trim().length === 0) {
    return false;
  }
  // 不允许包含路径分隔符
  if (/[\/\\]/.test(agentId)) {
    return false;
  }
  // 不允许包含特殊字符（只允许字母、数字、下划线、连字符）
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId)) {
    return false;
  }
  return true;
}

/**
 * 确保 inbox 目录存在
 */
async function ensureInboxDir(): Promise<void> {
  const inboxDir = getInboxDir();
  if (!fs.existsSync(inboxDir)) {
    try {
      fs.mkdirSync(inboxDir, { recursive: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      throw new EketError(
        EketErrorCode.FILE_CONNECT_FAILED,
        `Failed to create inbox directory: ${err.message}`,
        { code: err.code, inboxDir }
      );
    }
  }
}

// ============================================================================
// 读写接口
// ============================================================================

/**
 * 读取所有消息（含已读）
 */
export async function readMailbox(agentId: string, actor?: string): Promise<AgentMessage[]> {
  // 验证 agentId 防止路径注入
  if (!validateAgentId(agentId)) {
    console.error('[Agent Mailbox] Invalid agentId:', agentId);
    return [];
  }

  const inboxPath = getInboxPath(agentId);
  try {
    if (!fs.existsSync(inboxPath)) {
      return [];
    }
    const content = await fs.promises.readFile(inboxPath, 'utf-8');
    const messages = JSON.parse(content) as AgentMessage[];

    // 记录审计日志
    await logAccessAudit('READ', actor || 'system', agentId, {
      messageCount: messages.length,
    });

    // 解密消息内容
    return messages.map((m) => ({
      ...m,
      text: decryptContent(m.text),
    }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error('[Agent Mailbox] Read mailbox error:', error);
    return [];
  }
}

/**
 * 只读未读消息
 */
export async function readUnreadMessages(agentId: string): Promise<AgentMessage[]> {
  const messages = await readMailbox(agentId);
  return messages.filter((m) => !m.read);
}

/**
 * 向 inbox 写入消息（带文件锁，原子写入）
 *
 * 步骤：
 * 1. 验证 agentId 防止路径注入
 * 2. 确保 inbox 文件存在（wx flag 防止重复创建）
 * 3. 获取文件锁
 * 4. 重新读取最新消息（锁内读取避免丢失并发写入）
 * 5. 追加新消息并写回
 * 6. 释放锁
 */
export async function writeToMailbox(
  agentId: string,
  message: Omit<AgentMessage, 'read'>,
  actor?: string
): Promise<Result<void>> {
  // 验证 agentId 防止路径注入
  if (!validateAgentId(agentId)) {
    return {
      success: false,
      error: new EketError(
        EketErrorCode.UNKNOWN_ERROR,
        `Invalid agentId: ${agentId}. AgentId must contain only letters, numbers, underscores, or hyphens.`
      ),
    };
  }

  try {
    await ensureInboxDir();
    const inboxPath = getInboxPath(agentId);

    // 确保文件存在
    try {
      await fs.promises.writeFile(inboxPath, '[]', {
        encoding: 'utf-8',
        flag: 'wx',
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
    }

    // 获取文件锁
    const release = await acquireLock(inboxPath);

    try {
      // 锁内重读确保最新状态（防止并发写入丢失）
      // 注意：readMailbox 会解密，但我们要追加新消息，所以直接读取原始数据
      const inboxContent = await fs.promises.readFile(inboxPath, 'utf-8');
      const messages = JSON.parse(inboxContent) as AgentMessage[];

      // 加密新消息的 text 字段
      const encryptedMessage = {
        ...message,
        read: false,
        text: encryptContent(message.text),
      };

      messages.push(encryptedMessage);
      await fs.promises.writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');

      // 记录审计日志
      await logAccessAudit('WRITE', actor || message.from, agentId, {
        messageId: message.id,
        from: message.from,
      });

      return { success: true, data: undefined };
    } finally {
      await releaseLock(release);
    }
  } catch (error) {
    console.error('[Agent Mailbox] Write to mailbox error:', error);
    return {
      success: false,
      error: new EketError(
        EketErrorCode.MAILBOX_WRITE_FAILED,
        `Failed to write message: ${(error as Error).message}`
      ),
    };
  }
}

/**
 * 按索引标记单条消息为已读（带文件锁）
 */
export async function markMessageAsReadByIndex(
  agentId: string,
  messageIndex: number
): Promise<Result<void>> {
  // 验证 agentId 防止路径注入
  if (!validateAgentId(agentId)) {
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${agentId}`),
    };
  }

  const inboxPath = getInboxPath(agentId);

  if (!fs.existsSync(inboxPath)) {
    return { success: true, data: undefined }; // 空 inbox，无需标记
  }

  // 获取文件锁
  const release = await acquireLock(inboxPath);

  try {
    const messages = await readMailbox(agentId);
    if (messageIndex < 0 || messageIndex >= messages.length) {
      return { success: true, data: undefined }; // 索引超出范围
    }

    const message = messages[messageIndex];
    if (!message || message.read) {
      return { success: true, data: undefined }; // 消息不存在或已读
    }

    messages[messageIndex] = { ...message, read: true };
    await fs.promises.writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');

    return { success: true, data: undefined };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, data: undefined };
    }
    console.error('[Agent Mailbox] Mark message as read error:', error);
    return {
      success: false,
      error: new EketError(
        EketErrorCode.MAILBOX_MARK_READ_FAILED,
        `Failed to mark message as read: ${(error as Error).message}`
      ),
    };
  } finally {
    await releaseLock(release);
  }
}

/**
 * 标记所有消息为已读（带文件锁）
 */
export async function markMessagesAsRead(agentId: string): Promise<Result<void>> {
  // 验证 agentId 防止路径注入
  if (!validateAgentId(agentId)) {
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${agentId}`),
    };
  }

  const inboxPath = getInboxPath(agentId);

  if (!fs.existsSync(inboxPath)) {
    return { success: true, data: undefined };
  }

  // 获取文件锁
  const release = await acquireLock(inboxPath);

  try {
    const messages = await readMailbox(agentId);
    if (messages.length === 0) {
      return { success: true, data: undefined };
    }

    // 直接 mutate，因为来自 JSON.parse
    for (const m of messages) {
      m.read = true;
    }

    await fs.promises.writeFile(inboxPath, JSON.stringify(messages, null, 2), 'utf-8');

    return { success: true, data: undefined };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, data: undefined };
    }
    console.error('[Agent Mailbox] Mark messages as read error:', error);
    return {
      success: false,
      error: new EketError(
        EketErrorCode.MAILBOX_MARK_READ_FAILED,
        `Failed to mark messages as read: ${(error as Error).message}`
      ),
    };
  } finally {
    await releaseLock(release);
  }
}

/**
 * 清空 inbox（保留文件，内容置为空数组）
 */
export async function clearMailbox(agentId: string): Promise<Result<void>> {
  // 验证 agentId 防止路径注入
  if (!validateAgentId(agentId)) {
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${agentId}`),
    };
  }

  const inboxPath = getInboxPath(agentId);

  try {
    // flag 'r+': 文件不存在时抛 ENOENT，不会意外创建新文件
    await fs.promises.writeFile(inboxPath, '[]', {
      encoding: 'utf-8',
      flag: 'r+',
    });
    return { success: true, data: undefined };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { success: true, data: undefined };
    }
    console.error('[Agent Mailbox] Clear mailbox error:', error);
    return {
      success: false,
      error: new EketError(
        EketErrorCode.MAILBOX_CLEAR_FAILED,
        `Failed to clear mailbox: ${(error as Error).message}`
      ),
    };
  }
}

// ============================================================================
// 结构化消息工厂函数
// ============================================================================

/**
 * 生成消息 ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 创建空闲通知
 */
export function createIdleNotification(
  agentId: string,
  options?: {
    idleReason?: IdleNotificationMessage['idleReason'];
    summary?: string;
    completedTaskId?: string;
    completedStatus?: IdleNotificationMessage['completedStatus'];
    failureReason?: string;
  }
): IdleNotificationMessage {
  return {
    type: 'idle_notification',
    from: agentId,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * 创建任务分配消息
 */
export function createTaskAssignmentMessage(params: {
  taskId: string;
  subject: string;
  description: string;
  assignedBy: string;
  priority?: TaskAssignmentMessage['priority'];
  tags?: string[];
}): TaskAssignmentMessage {
  return {
    type: 'task_assignment',
    taskId: params.taskId,
    subject: params.subject,
    description: params.description,
    assignedBy: params.assignedBy,
    timestamp: new Date().toISOString(),
    priority: params.priority || 'normal',
    tags: params.tags || [],
  };
}

/**
 * 创建任务完成通知
 */
export function createTaskCompletedNotification(params: {
  taskId: string;
  from: string;
  status: TaskCompletedNotification['status'];
  result?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
}): TaskCompletedNotification {
  return {
    type: 'task_completed_notification',
    taskId: params.taskId,
    from: params.from,
    timestamp: new Date().toISOString(),
    status: params.status,
    result: params.result,
    error: params.error,
    durationMs: params.durationMs,
  };
}

/**
 * 创建权限请求消息
 */
export function createPermissionRequestMessage(params: {
  agentId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  description: string;
}): PermissionRequestMessage {
  return {
    type: 'permission_request',
    requestId: `perm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    agentId: params.agentId,
    toolName: params.toolName,
    toolInput: params.toolInput,
    description: params.description,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 创建权限响应消息
 */
export function createPermissionResponseMessage(params: {
  requestId: string;
  approved: boolean;
  reason?: string;
  updatedInput?: Record<string, unknown>;
}): PermissionResponseMessage {
  return {
    type: 'permission_response',
    requestId: params.requestId,
    approved: params.approved,
    reason: params.reason,
    updatedInput: params.updatedInput,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 创建关机请求消息
 */
export function createShutdownRequestMessage(params: {
  from: string;
  reason?: string;
}): ShutdownRequestMessage {
  return {
    type: 'shutdown_request',
    requestId: `shutdown_${Date.now()}`,
    from: params.from,
    reason: params.reason,
    timestamp: new Date().toISOString(),
  };
}

// ============================================================================
// 消息识别器
// ============================================================================

/**
 * 判断消息是否为结构化协议消息
 */
export function isStructuredProtocolMessage(
  message: AgentMessage | StructuredMessage
): message is StructuredMessage {
  return 'type' in message;
}

/**
 * 判断消息是否为空闲通知
 */
export function isIdleNotification(
  message: AgentMessage | StructuredMessage
): message is IdleNotificationMessage {
  return (message as StructuredMessage)?.type === 'idle_notification';
}

/**
 * 判断消息是否为任务分配消息
 */
export function isTaskAssignmentMessage(
  message: AgentMessage | StructuredMessage
): message is TaskAssignmentMessage {
  return (message as StructuredMessage)?.type === 'task_assignment';
}

/**
 * 判断消息是否为任务完成通知
 */
export function isTaskCompletedNotification(
  message: AgentMessage | StructuredMessage
): message is TaskCompletedNotification {
  return (message as StructuredMessage)?.type === 'task_completed_notification';
}

/**
 * 判断消息是否为权限请求
 */
export function isPermissionRequest(
  message: AgentMessage | StructuredMessage
): message is PermissionRequestMessage {
  return (message as StructuredMessage)?.type === 'permission_request';
}

/**
 * 判断消息是否为关机请求
 */
export function isShutdownRequest(
  message: AgentMessage | StructuredMessage
): message is ShutdownRequestMessage {
  return (message as StructuredMessage)?.type === 'shutdown_request';
}

// ============================================================================
// 高级工具函数
// ============================================================================

/**
 * 向 Agent 发送空闲通知
 */
export async function sendIdleNotification(
  agentId: string,
  masterId: string,
  options?: {
    idleReason?: IdleNotificationMessage['idleReason'];
    summary?: string;
    completedTaskId?: string;
    completedStatus?: IdleNotificationMessage['completedStatus'];
    failureReason?: string;
  }
): Promise<Result<void>> {
  // 验证 agentId 和 masterId 防止路径注入
  if (!validateAgentId(agentId) || !validateAgentId(masterId)) {
    const invalidId = !validateAgentId(agentId) ? agentId : masterId;
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${invalidId}`),
    };
  }

  const message = createIdleNotification(agentId, options);
  return await writeToMailbox(masterId, {
    id: generateMessageId(),
    from: message.from,
    text: JSON.stringify(message),
    timestamp: message.timestamp,
    summary: message.summary,
  });
}

/**
 * 向 Agent 发送任务分配消息
 */
export async function sendTaskAssignment(
  agentId: string,
  params: {
    taskId: string;
    subject: string;
    description: string;
    assignedBy: string;
    priority?: TaskAssignmentMessage['priority'];
    tags?: string[];
  }
): Promise<Result<void>> {
  // 验证 agentId 和 assignedBy 防止路径注入
  if (!validateAgentId(agentId) || !validateAgentId(params.assignedBy)) {
    const invalidId = !validateAgentId(agentId) ? agentId : params.assignedBy;
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${invalidId}`),
    };
  }

  const message = createTaskAssignmentMessage(params);
  return await writeToMailbox(agentId, {
    id: generateMessageId(),
    from: params.assignedBy,
    text: JSON.stringify(message),
    timestamp: message.timestamp,
    summary: params.subject,
  });
}

/**
 * 向 Master 发送任务完成通知
 */
export async function sendTaskCompletedNotification(
  masterId: string,
  params: {
    taskId: string;
    from: string;
    status: TaskCompletedNotification['status'];
    result?: Record<string, unknown>;
    error?: string;
    durationMs?: number;
  }
): Promise<Result<void>> {
  // 验证 masterId 和 from 防止路径注入
  if (!validateAgentId(masterId) || !validateAgentId(params.from)) {
    const invalidId = !validateAgentId(masterId) ? masterId : params.from;
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${invalidId}`),
    };
  }

  const message = createTaskCompletedNotification(params);
  return await writeToMailbox(masterId, {
    id: generateMessageId(),
    from: params.from,
    text: JSON.stringify(message),
    timestamp: message.timestamp,
    summary: `Task ${params.taskId} ${params.status}`,
  });
}

/**
 * 发送权限请求
 */
export async function sendPermissionRequest(
  masterId: string,
  params: {
    agentId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    description: string;
  }
): Promise<Result<PermissionRequestMessage>> {
  // 验证 masterId 和 agentId 防止路径注入
  if (!validateAgentId(masterId) || !validateAgentId(params.agentId)) {
    const invalidId = !validateAgentId(masterId) ? masterId : params.agentId;
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${invalidId}`),
    };
  }

  const message = createPermissionRequestMessage(params);
  const result = await writeToMailbox(masterId, {
    id: generateMessageId(),
    from: params.agentId,
    text: JSON.stringify(message),
    timestamp: message.timestamp,
    summary: `Permission request: ${params.toolName}`,
  });

  if (result.success) {
    return { success: true, data: message };
  }
  return { success: false, error: result.error };
}

/**
 * 发送关机请求
 */
export async function sendShutdownRequest(
  targetId: string,
  from: string,
  reason?: string
): Promise<Result<ShutdownRequestMessage>> {
  // 验证 targetId 和 from 防止路径注入
  if (!validateAgentId(targetId) || !validateAgentId(from)) {
    const invalidId = !validateAgentId(targetId) ? targetId : from;
    return {
      success: false,
      error: new EketError(EketErrorCode.UNKNOWN_ERROR, `Invalid agentId: ${invalidId}`),
    };
  }

  const message = createShutdownRequestMessage({ from, reason });
  const result = await writeToMailbox(targetId, {
    id: generateMessageId(),
    from,
    text: JSON.stringify(message),
    timestamp: message.timestamp,
    summary: `Shutdown request: ${reason || 'No reason provided'}`,
  });

  if (result.success) {
    return { success: true, data: message };
  }
  return { success: false, error: result.error };
}

/**
 * 获取未读的结构化消息
 */
export async function getUnreadStructuredMessages(agentId: string): Promise<StructuredMessage[]> {
  // 验证 agentId 防止路径注入
  if (!validateAgentId(agentId)) {
    console.error('[Agent Mailbox] Invalid agentId:', agentId);
    return [];
  }

  const messages = await readUnreadMessages(agentId);
  const structured: StructuredMessage[] = [];

  for (const msg of messages) {
    try {
      const parsed = JSON.parse(msg.text) as StructuredMessage;
      if (isStructuredProtocolMessage(parsed)) {
        structured.push(parsed);
      }
    } catch {
      // 忽略解析失败的消息
    }
  }

  return structured;
}
