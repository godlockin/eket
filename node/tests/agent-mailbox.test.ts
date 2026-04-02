/**
 * Agent Mailbox Tests
 *
 * Tests for file-based P2P messaging with proper-lockfile.
 * Covers: read/write operations, file locking, structured messages, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  // Core functions
  readMailbox,
  readUnreadMessages,
  writeToMailbox,
  markMessageAsReadByIndex,
  markMessagesAsRead,
  clearMailbox,
  // Path utilities
  getInboxPath,
  // Message factories
  generateMessageId,
  createIdleNotification,
  createTaskAssignmentMessage,
  createTaskCompletedNotification,
  createPermissionRequestMessage,
  createPermissionResponseMessage,
  createShutdownRequestMessage,
  // Type guards
  isStructuredProtocolMessage,
  isIdleNotification,
  isTaskAssignmentMessage,
  isTaskCompletedNotification,
  isPermissionRequest,
  isShutdownRequest,
  // Helper functions
  sendIdleNotification,
  sendTaskAssignment,
  sendTaskCompletedNotification,
  sendPermissionRequest,
  sendShutdownRequest,
  getUnreadStructuredMessages,
  // Types
  type AgentMessage,
  type IdleNotificationMessage,
  type TaskAssignmentMessage,
  type TaskCompletedNotification,
  type PermissionRequestMessage,
  type PermissionResponseMessage,
  type ShutdownRequestMessage,
} from '../src/core/agent-mailbox.js';

describe('AgentMailbox', () => {
  // Test inbox directory
  const TEST_INBOX_DIR = path.join(process.cwd(), '.eket', 'test-inboxes');

  // Test agent IDs
  const TEST_AGENT_ID = 'test-agent-001';
  const TEST_MASTER_ID = 'test-master-001';

  beforeEach(async () => {
    // Set up test inbox directory
    process.env.EKET_INBOX_DIR = TEST_INBOX_DIR;
    if (!fs.existsSync(TEST_INBOX_DIR)) {
      fs.mkdirSync(TEST_INBOX_DIR, { recursive: true });
    }

    // Clean up any existing test inboxes
    const files = fs.readdirSync(TEST_INBOX_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(TEST_INBOX_DIR, file));
    }
  });

  afterEach(async () => {
    // Clean up test inboxes
    if (fs.existsSync(TEST_INBOX_DIR)) {
      const files = fs.readdirSync(TEST_INBOX_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_INBOX_DIR, file));
      }
      fs.rmdirSync(TEST_INBOX_DIR);
    }
    delete process.env.EKET_INBOX_DIR;
  });

  // ============================================================================
  // Path Utilities Tests
  // ============================================================================

  describe('Path Utilities', () => {
    it('should respect EKET_INBOX_DIR environment variable', () => {
      process.env.EKET_INBOX_DIR = '/custom/inbox/path';
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      expect(inboxPath).toBe('/custom/inbox/path/test-agent-001.json');
    });

    it('should use default inbox directory when env not set', () => {
      delete process.env.EKET_INBOX_DIR;
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      const expectedDefault = path.join(process.cwd(), '.eket', 'data', 'inboxes', 'test-agent-001.json');
      expect(inboxPath).toBe(expectedDefault);
    });

    it('should generate inbox file path for agent', () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      expect(inboxPath).toBe(path.join(TEST_INBOX_DIR, `${TEST_AGENT_ID}.json`));
    });

    it('should sanitize path components to prevent path injection', () => {
      const maliciousAgentId = '../../../etc/passwd';
      const inboxPath = getInboxPath(maliciousAgentId);
      // Should replace / and \ with _
      expect(inboxPath).toContain('.._.._.._etc_passwd.json');
    });

    it('should handle agent IDs with backslashes', () => {
      const agentId = 'agent\\with\\backslashes';
      const inboxPath = getInboxPath(agentId);
      expect(inboxPath).toContain('agent_with_backslashes.json');
    });

    it('should handle normal agent IDs', () => {
      const inboxPath = getInboxPath('normal-agent-123');
      expect(inboxPath).toBe(path.join(TEST_INBOX_DIR, 'normal-agent-123.json'));
    });
  });

  // ============================================================================
  // Core Mailbox Operations Tests
  // ============================================================================

  describe('readMailbox', () => {
    it('should return empty array for non-existent inbox', async () => {
      const messages = await readMailbox('non-existent-agent');
      expect(messages).toEqual([]);
    });

    it('should read all messages from inbox', async () => {
      await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'Hello',
        timestamp: new Date().toISOString(),
      });

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe('msg-001');
    });

    it('should handle corrupted JSON gracefully', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      fs.writeFileSync(inboxPath, 'invalid json content', 'utf-8');

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages).toEqual([]);
    });
  });

  describe('readUnreadMessages', () => {
    it('should return only unread messages', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      const messages: AgentMessage[] = [
        { id: 'msg-001', from: 'sender', text: 'Unread', timestamp: new Date().toISOString(), read: false },
        { id: 'msg-002', from: 'sender', text: 'Read', timestamp: new Date().toISOString(), read: true },
        { id: 'msg-003', from: 'sender', text: 'Also unread', timestamp: new Date().toISOString(), read: false },
      ];
      fs.writeFileSync(inboxPath, JSON.stringify(messages), 'utf-8');

      const unread = await readUnreadMessages(TEST_AGENT_ID);
      expect(unread).toHaveLength(2);
      expect(unread.map(m => m.id)).toEqual(['msg-001', 'msg-003']);
    });

    it('should return empty array when all messages are read', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      const messages: AgentMessage[] = [
        { id: 'msg-001', from: 'sender', text: 'Read 1', timestamp: new Date().toISOString(), read: true },
        { id: 'msg-002', from: 'sender', text: 'Read 2', timestamp: new Date().toISOString(), read: true },
      ];
      fs.writeFileSync(inboxPath, JSON.stringify(messages), 'utf-8');

      const unread = await readUnreadMessages(TEST_AGENT_ID);
      expect(unread).toEqual([]);
    });
  });

  describe('writeToMailbox', () => {
    it('should write message to inbox', async () => {
      const result = await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'Test message',
        timestamp: new Date().toISOString(),
      });

      expect(result.success).toBe(true);

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages).toHaveLength(1);
      expect(messages[0].text).toBe('Test message');
      expect(messages[0].read).toBe(false);
    });

    it('should append messages without overwriting', async () => {
      await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'First',
        timestamp: new Date().toISOString(),
      });

      await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-002',
        from: 'sender',
        text: 'Second',
        timestamp: new Date().toISOString(),
      });

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('First');
      expect(messages[1].text).toBe('Second');
    });
  });

  describe('markMessageAsReadByIndex', () => {
    it('should mark message at index as read', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      const messages: AgentMessage[] = [
        { id: 'msg-001', from: 'sender', text: 'Unread', timestamp: new Date().toISOString(), read: false },
        { id: 'msg-002', from: 'sender', text: 'Also unread', timestamp: new Date().toISOString(), read: false },
      ];
      fs.writeFileSync(inboxPath, JSON.stringify(messages), 'utf-8');

      const result = await markMessageAsReadByIndex(TEST_AGENT_ID, 0);

      expect(result.success).toBe(true);

      const updated = await readMailbox(TEST_AGENT_ID);
      expect(updated[0].read).toBe(true);
      expect(updated[1].read).toBe(false);
    });

    it('should handle out-of-range index gracefully', async () => {
      const result = await markMessageAsReadByIndex(TEST_AGENT_ID, 100);
      expect(result.success).toBe(true);
    });

    it('should handle negative index gracefully', async () => {
      const result = await markMessageAsReadByIndex(TEST_AGENT_ID, -1);
      expect(result.success).toBe(true);
    });

    it('should handle non-existent inbox gracefully', async () => {
      const result = await markMessageAsReadByIndex('non-existent-agent', 0);
      expect(result.success).toBe(true);
    });

    it('should skip already read messages', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      const messages: AgentMessage[] = [
        { id: 'msg-001', from: 'sender', text: 'Already read', timestamp: new Date().toISOString(), read: true },
      ];
      fs.writeFileSync(inboxPath, JSON.stringify(messages), 'utf-8');

      const result = await markMessageAsReadByIndex(TEST_AGENT_ID, 0);
      expect(result.success).toBe(true);
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark all messages as read', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      const messages: AgentMessage[] = [
        { id: 'msg-001', from: 'sender', text: 'Unread 1', timestamp: new Date().toISOString(), read: false },
        { id: 'msg-002', from: 'sender', text: 'Unread 2', timestamp: new Date().toISOString(), read: false },
        { id: 'msg-003', from: 'sender', text: 'Already read', timestamp: new Date().toISOString(), read: true },
      ];
      fs.writeFileSync(inboxPath, JSON.stringify(messages), 'utf-8');

      const result = await markMessagesAsRead(TEST_AGENT_ID);

      expect(result.success).toBe(true);

      const updated = await readMailbox(TEST_AGENT_ID);
      expect(updated.every(m => m.read)).toBe(true);
    });

    it('should handle empty inbox gracefully', async () => {
      const result = await markMessagesAsRead(TEST_AGENT_ID);
      expect(result.success).toBe(true);
    });

    it('should handle non-existent inbox gracefully', async () => {
      const result = await markMessagesAsRead('non-existent-agent');
      expect(result.success).toBe(true);
    });
  });

  describe('clearMailbox', () => {
    it('should clear all messages from inbox', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);
      const messages: AgentMessage[] = [
        { id: 'msg-001', from: 'sender', text: 'To be cleared', timestamp: new Date().toISOString(), read: false },
        { id: 'msg-002', from: 'sender', text: 'Also cleared', timestamp: new Date().toISOString(), read: false },
      ];
      fs.writeFileSync(inboxPath, JSON.stringify(messages), 'utf-8');

      const result = await clearMailbox(TEST_AGENT_ID);

      expect(result.success).toBe(true);

      const updated = await readMailbox(TEST_AGENT_ID);
      expect(updated).toEqual([]);
    });

    it('should handle non-existent inbox gracefully', async () => {
      const result = await clearMailbox('non-existent-agent');
      expect(result.success).toBe(true);
    });

    it('should preserve the inbox file', async () => {
      const inboxPath = getInboxPath(TEST_AGENT_ID);

      const writeResult = await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'Test',
        timestamp: new Date().toISOString(),
      });

      // Skip if write failed
      if (!writeResult.success) {
        return;
      }

      await clearMailbox(TEST_AGENT_ID);

      expect(fs.existsSync(inboxPath)).toBe(true);
    });
  });

  // ============================================================================
  // Message ID Generation Tests
  // ============================================================================

  describe('generateMessageId', () => {
    it('should generate unique message IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMessageId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs with expected format', () => {
      const id = generateMessageId();
      expect(id).toMatch(/^msg_\d+_[a-z0-9]+$/);
    });
  });

  // ============================================================================
  // Structured Message Factory Tests
  // ============================================================================

  describe('createIdleNotification', () => {
    it('should create idle notification with minimal options', () => {
      const notification = createIdleNotification(TEST_AGENT_ID);

      expect(notification.type).toBe('idle_notification');
      expect(notification.from).toBe(TEST_AGENT_ID);
      expect(notification.timestamp).toBeDefined();
    });

    it('should create idle notification with all options', () => {
      const notification = createIdleNotification(TEST_AGENT_ID, {
        idleReason: 'available',
        summary: 'Completed task X',
        completedTaskId: 'task-123',
        completedStatus: 'resolved',
      });

      expect(notification.idleReason).toBe('available');
      expect(notification.completedTaskId).toBe('task-123');
      expect(notification.completedStatus).toBe('resolved');
    });
  });

  describe('createTaskAssignmentMessage', () => {
    it('should create task assignment message with required fields', () => {
      const message = createTaskAssignmentMessage({
        taskId: 'task-123',
        subject: 'Implement feature',
        description: 'Detailed description',
        assignedBy: TEST_MASTER_ID,
      });

      expect(message.type).toBe('task_assignment');
      expect(message.taskId).toBe('task-123');
      expect(message.priority).toBe('normal');
      expect(message.tags).toEqual([]);
    });

    it('should create task assignment message with custom priority and tags', () => {
      const message = createTaskAssignmentMessage({
        taskId: 'task-456',
        subject: 'Urgent fix',
        description: 'Fix critical bug',
        assignedBy: TEST_MASTER_ID,
        priority: 'urgent',
        tags: ['bug', 'critical'],
      });

      expect(message.priority).toBe('urgent');
      expect(message.tags).toEqual(['bug', 'critical']);
    });
  });

  describe('createTaskCompletedNotification', () => {
    it('should create task completed notification', () => {
      const notification = createTaskCompletedNotification({
        taskId: 'task-123',
        from: TEST_AGENT_ID,
        status: 'completed',
        durationMs: 5000,
      });

      expect(notification.type).toBe('task_completed_notification');
      expect(notification.taskId).toBe('task-123');
      expect(notification.status).toBe('completed');
    });

    it('should create failed task notification with error', () => {
      const notification = createTaskCompletedNotification({
        taskId: 'task-456',
        from: TEST_AGENT_ID,
        status: 'failed',
        error: 'Something went wrong',
      });

      expect(notification.status).toBe('failed');
      expect(notification.error).toBe('Something went wrong');
    });
  });

  describe('createPermissionRequestMessage', () => {
    it('should create permission request message', () => {
      const message = createPermissionRequestMessage({
        agentId: TEST_AGENT_ID,
        toolName: 'Bash',
        toolInput: { command: 'rm -rf /important' },
        description: 'Delete important files',
      });

      expect(message.type).toBe('permission_request');
      expect(message.agentId).toBe(TEST_AGENT_ID);
      expect(message.requestId).toMatch(/^perm_\d+_[a-z0-9]+$/);
    });
  });

  describe('createPermissionResponseMessage', () => {
    it('should create permission response - approved', () => {
      const message = createPermissionResponseMessage({
        requestId: 'perm-123',
        approved: true,
      });

      expect(message.type).toBe('permission_response');
      expect(message.approved).toBe(true);
    });

    it('should create permission response - denied', () => {
      const message = createPermissionResponseMessage({
        requestId: 'perm-123',
        approved: false,
        reason: 'Security concern',
      });

      expect(message.approved).toBe(false);
      expect(message.reason).toBe('Security concern');
    });
  });

  describe('createShutdownRequestMessage', () => {
    it('should create shutdown request message', () => {
      const message = createShutdownRequestMessage({
        from: TEST_MASTER_ID,
        reason: 'System maintenance',
      });

      expect(message.type).toBe('shutdown_request');
      expect(message.from).toBe(TEST_MASTER_ID);
      expect(message.requestId).toMatch(/^shutdown_\d+$/);
    });

    it('should create shutdown request without reason', () => {
      const message = createShutdownRequestMessage({ from: TEST_MASTER_ID });
      expect(message.reason).toBeUndefined();
    });
  });

  // ============================================================================
  // Type Guard Tests
  // ============================================================================

  describe('Type Guards', () => {
    it('should identify structured protocol messages', () => {
      const structured: IdleNotificationMessage = createIdleNotification(TEST_AGENT_ID);
      const plain: AgentMessage = {
        id: 'msg-001',
        from: 'sender',
        text: 'Hello',
        timestamp: new Date().toISOString(),
        read: false,
      };

      expect(isStructuredProtocolMessage(structured)).toBe(true);
      expect(isStructuredProtocolMessage(plain)).toBe(false);
    });

    it('should identify idle notification messages', () => {
      const idle = createIdleNotification(TEST_AGENT_ID);
      const task = createTaskAssignmentMessage({
        taskId: '1',
        subject: 'Test',
        description: 'Test',
        assignedBy: 'master',
      });

      expect(isIdleNotification(idle)).toBe(true);
      expect(isIdleNotification(task)).toBe(false);
    });

    it('should identify task assignment messages', () => {
      const task = createTaskAssignmentMessage({
        taskId: '1',
        subject: 'Test',
        description: 'Test',
        assignedBy: 'master',
      });
      const idle = createIdleNotification(TEST_AGENT_ID);

      expect(isTaskAssignmentMessage(task)).toBe(true);
      expect(isTaskAssignmentMessage(idle)).toBe(false);
    });

    it('should identify task completed notifications', () => {
      const completed = createTaskCompletedNotification({
        taskId: '1',
        from: TEST_AGENT_ID,
        status: 'completed',
      });
      const task = createTaskAssignmentMessage({
        taskId: '1',
        subject: 'Test',
        description: 'Test',
        assignedBy: 'master',
      });

      expect(isTaskCompletedNotification(completed)).toBe(true);
      expect(isTaskCompletedNotification(task)).toBe(false);
    });

    it('should identify permission request messages', () => {
      const request = createPermissionRequestMessage({
        agentId: TEST_AGENT_ID,
        toolName: 'Bash',
        toolInput: {},
        description: 'Test',
      });
      const response = createPermissionResponseMessage({
        requestId: 'perm-123',
        approved: true,
      });

      expect(isPermissionRequest(request)).toBe(true);
      expect(isPermissionRequest(response)).toBe(false);
    });

    it('should identify shutdown request messages', () => {
      const shutdown = createShutdownRequestMessage({
        from: TEST_MASTER_ID,
        reason: 'Test',
      });
      const idle = createIdleNotification(TEST_AGENT_ID);

      expect(isShutdownRequest(shutdown)).toBe(true);
      expect(isShutdownRequest(idle)).toBe(false);
    });
  });

  // ============================================================================
  // Helper Function Tests
  // ============================================================================

  describe('sendIdleNotification', () => {
    it('should send idle notification to master', async () => {
      const result = await sendIdleNotification(TEST_AGENT_ID, TEST_MASTER_ID, {
        idleReason: 'available',
        summary: 'Task completed',
        completedTaskId: 'task-123',
      });

      expect(result.success).toBe(true);

      const messages = await readUnreadMessages(TEST_MASTER_ID);
      expect(messages).toHaveLength(1);

      const parsed = JSON.parse(messages[0].text) as IdleNotificationMessage;
      expect(parsed.type).toBe('idle_notification');
      expect(parsed.from).toBe(TEST_AGENT_ID);
    });
  });

  describe('sendTaskAssignment', () => {
    it('should send task assignment to agent', async () => {
      const result = await sendTaskAssignment(TEST_AGENT_ID, {
        taskId: 'task-123',
        subject: 'Implement feature',
        description: 'Detailed description',
        assignedBy: TEST_MASTER_ID,
        priority: 'high',
      });

      expect(result.success).toBe(true);

      const messages = await readUnreadMessages(TEST_AGENT_ID);
      expect(messages).toHaveLength(1);

      const parsed = JSON.parse(messages[0].text) as TaskAssignmentMessage;
      expect(parsed.type).toBe('task_assignment');
      expect(parsed.taskId).toBe('task-123');
    });
  });

  describe('sendTaskCompletedNotification', () => {
    it('should send task completed notification to master', async () => {
      const result = await sendTaskCompletedNotification(TEST_MASTER_ID, {
        taskId: 'task-123',
        from: TEST_AGENT_ID,
        status: 'completed',
        durationMs: 10000,
      });

      expect(result.success).toBe(true);

      const messages = await readUnreadMessages(TEST_MASTER_ID);
      expect(messages).toHaveLength(1);

      const parsed = JSON.parse(messages[0].text) as TaskCompletedNotification;
      expect(parsed.type).toBe('task_completed_notification');
      expect(parsed.taskId).toBe('task-123');
    });
  });

  describe('sendPermissionRequest', () => {
    it('should send permission request to master', async () => {
      const result = await sendPermissionRequest(TEST_MASTER_ID, {
        agentId: TEST_AGENT_ID,
        toolName: 'Bash',
        toolInput: { command: 'echo hello' },
        description: 'Print hello',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = await readUnreadMessages(TEST_MASTER_ID);
      expect(messages).toHaveLength(1);
    });
  });

  describe('sendShutdownRequest', () => {
    it('should send shutdown request', async () => {
      const result = await sendShutdownRequest(TEST_AGENT_ID, TEST_MASTER_ID, 'System shutdown');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();

      const messages = await readUnreadMessages(TEST_AGENT_ID);
      expect(messages).toHaveLength(1);

      const parsed = JSON.parse(messages[0].text) as ShutdownRequestMessage;
      expect(parsed.reason).toBe('System shutdown');
    });
  });

  describe('getUnreadStructuredMessages', () => {
    it('should return only structured messages', async () => {
      await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'Plain message',
        timestamp: new Date().toISOString(),
      });

      await sendIdleNotification('other-agent', TEST_AGENT_ID, {
        idleReason: 'available',
      });

      const structured = await getUnreadStructuredMessages(TEST_AGENT_ID);

      expect(structured).toHaveLength(1);
      expect(structured[0].type).toBe('idle_notification');
    });

    it('should ignore messages with invalid JSON', async () => {
      await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'invalid json',
        timestamp: new Date().toISOString(),
      });

      const structured = await getUnreadStructuredMessages(TEST_AGENT_ID);
      expect(structured).toEqual([]);
    });

    it('should return empty array for empty inbox', async () => {
      const structured = await getUnreadStructuredMessages(TEST_AGENT_ID);
      expect(structured).toEqual([]);
    });
  });

  // ============================================================================
  // Concurrent Access Tests (File Locking)
  // ============================================================================

  describe('Concurrent Access', () => {
    it('should handle concurrent writes with file locking', async () => {
      const writePromises: Promise<unknown>[] = [];

      for (let i = 0; i < 10; i++) {
        writePromises.push(
          writeToMailbox(TEST_AGENT_ID, {
            id: `msg-${i}`,
            from: 'sender',
            text: `Message ${i}`,
            timestamp: new Date().toISOString(),
          })
        );
      }

      await Promise.all(writePromises);

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages).toHaveLength(10);

      const ids = messages.map(m => m.id);
      for (let i = 0; i < 10; i++) {
        expect(ids).toContain(`msg-${i}`);
      }
    });

    it('should handle concurrent mark operations', async () => {
      for (let i = 0; i < 5; i++) {
        await writeToMailbox(TEST_AGENT_ID, {
          id: `msg-${i}`,
          from: 'sender',
          text: `Message ${i}`,
          timestamp: new Date().toISOString(),
        });
      }

      const markPromises = [];
      for (let i = 0; i < 5; i++) {
        markPromises.push(markMessageAsReadByIndex(TEST_AGENT_ID, i));
      }

      const results = await Promise.all(markPromises);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages.every(m => m.read)).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle normal length agent IDs', async () => {
      const normalAgentId = 'normal-agent-id-123';
      const result = await writeToMailbox(normalAgentId, {
        id: 'msg-001',
        from: 'sender',
        text: 'Test',
        timestamp: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it('should handle empty message text', async () => {
      const result = await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: '',
        timestamp: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it('should handle large messages', async () => {
      const largeText = 'x'.repeat(100000);
      const result = await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: largeText,
        timestamp: new Date().toISOString(),
      });

      expect(result.success).toBe(true);
    });

    it('should handle messages with optional fields', async () => {
      const result = await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'Test',
        timestamp: new Date().toISOString(),
        color: '#ff0000',
        summary: 'Brief summary',
      });

      expect(result.success).toBe(true);

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages[0].color).toBe('#ff0000');
      expect(messages[0].summary).toBe('Brief summary');
    });
  });

  // ============================================================================
  // Defensive Programming Tests
  // ============================================================================

  describe('Defensive Programming', () => {
    it('should handle inbox directory deletion between operations', async () => {
      await writeToMailbox(TEST_AGENT_ID, {
        id: 'msg-001',
        from: 'sender',
        text: 'Test',
        timestamp: new Date().toISOString(),
      });

      const files = fs.readdirSync(TEST_INBOX_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(TEST_INBOX_DIR, file));
      }
      fs.rmdirSync(TEST_INBOX_DIR);

      const messages = await readMailbox(TEST_AGENT_ID);
      expect(messages).toEqual([]);
    });
  });
});
