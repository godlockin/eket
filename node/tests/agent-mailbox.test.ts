/**
 * Agent Mailbox Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// 测试用的 inbox 目录
const TEST_INBOX_DIR = path.join(process.cwd(), '.eket', 'data', 'test-inboxes');

// 在导入模块前设置环境变量
process.env.EKET_INBOX_DIR = TEST_INBOX_DIR;

import {
  readMailbox,
  readUnreadMessages,
  writeToMailbox,
  markMessageAsReadByIndex,
  markMessagesAsRead,
  clearMailbox,
  createIdleNotification,
  createTaskAssignmentMessage,
  createTaskCompletedNotification,
  createPermissionRequestMessage,
  createShutdownRequestMessage,
  sendIdleNotification,
  sendTaskAssignment,
  sendTaskCompletedNotification,
  getUnreadStructuredMessages,
  isIdleNotification,
  isTaskAssignmentMessage,
  isStructuredProtocolMessage,
  generateMessageId,
} from '../src/core/agent-mailbox.js';

describe('Agent Mailbox', () => {
  // 每个测试前清理测试目录
  beforeEach(() => {
    if (fs.existsSync(TEST_INBOX_DIR)) {
      fs.rmSync(TEST_INBOX_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TEST_INBOX_DIR, { recursive: true });
  });

  // 测试后清理
  afterEach(() => {
    if (fs.existsSync(TEST_INBOX_DIR)) {
      fs.rmSync(TEST_INBOX_DIR, { recursive: true, force: true });
    }
  });

  describe('generateMessageId', () => {
    it('should generate unique message IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateMessageId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs with correct format', () => {
      const id = generateMessageId();
      expect(id).toMatch(/^msg_\d+_[a-z0-9]+$/);
    });
  });

  describe('createIdleNotification', () => {
    it('should create idle notification with required fields', () => {
      const notification = createIdleNotification('agent-001');

      expect(notification.type).toBe('idle_notification');
      expect(notification.from).toBe('agent-001');
      expect(notification.timestamp).toBeDefined();
    });

    it('should create idle notification with optional fields', () => {
      const notification = createIdleNotification('agent-001', {
        idleReason: 'available',
        summary: 'Task completed successfully',
        completedTaskId: 'task-123',
        completedStatus: 'resolved',
      });

      expect(notification.idleReason).toBe('available');
      expect(notification.summary).toBe('Task completed successfully');
      expect(notification.completedTaskId).toBe('task-123');
      expect(notification.completedStatus).toBe('resolved');
    });
  });

  describe('createTaskAssignmentMessage', () => {
    it('should create task assignment with required fields', () => {
      const message = createTaskAssignmentMessage({
        taskId: 'task-123',
        subject: 'Implement feature X',
        description: 'Implement the new feature',
        assignedBy: 'master-001',
      });

      expect(message.type).toBe('task_assignment');
      expect(message.taskId).toBe('task-123');
      expect(message.subject).toBe('Implement feature X');
      expect(message.assignedBy).toBe('master-001');
      expect(message.priority).toBe('normal'); // default
    });

    it('should create task assignment with optional fields', () => {
      const message = createTaskAssignmentMessage({
        taskId: 'task-456',
        subject: 'Urgent fix',
        description: 'Fix the critical bug',
        assignedBy: 'master-001',
        priority: 'urgent',
        tags: ['bug', 'critical'],
      });

      expect(message.priority).toBe('urgent');
      expect(message.tags).toEqual(['bug', 'critical']);
    });
  });

  describe('writeToMailbox and readMailbox', () => {
    it('should write and read messages', async () => {
      const agentId = 'test-agent';
      const message = {
        id: generateMessageId(),
        from: 'master',
        text: 'Hello, Agent!',
        timestamp: new Date().toISOString(),
        summary: 'Greeting',
      };

      const writeResult = await writeToMailbox(agentId, message);
      expect(writeResult.success).toBe(true);

      const messages = await readMailbox(agentId);
      expect(messages.length).toBe(1);
      expect(messages[0].text).toBe('Hello, Agent!');
      expect(messages[0].read).toBe(false);
    });

    it('should return empty array for non-existent inbox', async () => {
      const messages = await readMailbox('non-existent-agent');
      expect(messages).toEqual([]);
    });

    it('should append multiple messages', async () => {
      const agentId = 'test-agent';

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Message 1',
        timestamp: new Date().toISOString(),
      });

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Message 2',
        timestamp: new Date().toISOString(),
      });

      const messages = await readMailbox(agentId);
      expect(messages.length).toBe(2);
    });
  });

  describe('readUnreadMessages', () => {
    it('should return only unread messages', async () => {
      const agentId = 'test-agent';

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Unread message',
        timestamp: new Date().toISOString(),
      });

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Another unread message',
        timestamp: new Date().toISOString(),
      });

      const unread = await readUnreadMessages(agentId);
      expect(unread.length).toBe(2);

      // Mark first message as read
      await markMessageAsReadByIndex(agentId, 0);

      const unreadAfter = await readUnreadMessages(agentId);
      expect(unreadAfter.length).toBe(1);
      expect(unreadAfter[0].text).toBe('Another unread message');
    });
  });

  describe('markMessageAsReadByIndex', () => {
    it('should mark message as read', async () => {
      const agentId = 'test-agent';

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Test message',
        timestamp: new Date().toISOString(),
      });

      const result = await markMessageAsReadByIndex(agentId, 0);
      expect(result.success).toBe(true);

      const messages = await readMailbox(agentId);
      expect(messages[0].read).toBe(true);
    });

    it('should handle invalid index gracefully', async () => {
      const agentId = 'test-agent';

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Test message',
        timestamp: new Date().toISOString(),
      });

      // Negative index
      const result1 = await markMessageAsReadByIndex(agentId, -1);
      expect(result1.success).toBe(true);

      // Out of bounds index
      const result2 = await markMessageAsReadByIndex(agentId, 100);
      expect(result2.success).toBe(true);
    });
  });

  describe('markMessagesAsRead', () => {
    it('should mark all messages as read', async () => {
      const agentId = 'test-agent';

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Message 1',
        timestamp: new Date().toISOString(),
      });

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Message 2',
        timestamp: new Date().toISOString(),
      });

      const result = await markMessagesAsRead(agentId);
      expect(result.success).toBe(true);

      const messages = await readMailbox(agentId);
      expect(messages.every(m => m.read)).toBe(true);
    });

    it('should handle empty inbox gracefully', async () => {
      const result = await markMessagesAsRead('empty-agent');
      expect(result.success).toBe(true);
    });
  });

  describe('clearMailbox', () => {
    it('should clear all messages', async () => {
      const agentId = 'test-agent';

      await writeToMailbox(agentId, {
        id: generateMessageId(),
        from: 'master',
        text: 'Message to clear',
        timestamp: new Date().toISOString(),
      });

      const result = await clearMailbox(agentId);
      expect(result.success).toBe(true);

      const messages = await readMailbox(agentId);
      expect(messages.length).toBe(0);
    });

    it('should handle non-existent inbox gracefully', async () => {
      const result = await clearMailbox('non-existent-agent');
      expect(result.success).toBe(true);
    });
  });

  describe('Structured Messages', () => {
    it('should send and receive structured idle notification', async () => {
      const masterId = 'master-001';
      const agentId = 'agent-001';

      const result = await sendIdleNotification(agentId, masterId, {
        idleReason: 'available',
        summary: 'Completed task-123',
        completedTaskId: 'task-123',
        completedStatus: 'resolved',
      });

      expect(result.success).toBe(true);

      const structured = await getUnreadStructuredMessages(masterId);
      expect(structured.length).toBe(1);
      expect(isIdleNotification(structured[0])).toBe(true);
    });

    it('should send and receive structured task assignment', async () => {
      const agentId = 'agent-001';

      const result = await sendTaskAssignment(agentId, {
        taskId: 'task-456',
        subject: 'Implement feature',
        description: 'Implement the new feature X',
        assignedBy: 'master-001',
        priority: 'high',
        tags: ['feature', 'backend'],
      });

      expect(result.success).toBe(true);

      const structured = await getUnreadStructuredMessages(agentId);
      expect(structured.length).toBe(1);
      expect(isTaskAssignmentMessage(structured[0])).toBe(true);
    });

    it('should send and receive structured task completed notification', async () => {
      const masterId = 'master-001';

      const result = await sendTaskCompletedNotification(masterId, {
        taskId: 'task-789',
        from: 'agent-001',
        status: 'completed',
        result: { filesChanged: 5 },
        durationMs: 12345,
      });

      expect(result.success).toBe(true);

      const structured = await getUnreadStructuredMessages(masterId);
      expect(structured.length).toBe(1);
      expect(structured[0].type).toBe('task_completed_notification');
    });
  });

  describe('Message type guards', () => {
    it('should correctly identify structured protocol messages', () => {
      const idleNotification = createIdleNotification('agent-001');
      expect(isStructuredProtocolMessage(idleNotification)).toBe(true);
      expect(isIdleNotification(idleNotification)).toBe(true);

      const taskAssignment = createTaskAssignmentMessage({
        taskId: 'task-123',
        subject: 'Test',
        description: 'Test',
        assignedBy: 'master',
      });
      expect(isStructuredProtocolMessage(taskAssignment)).toBe(true);
      expect(isTaskAssignmentMessage(taskAssignment)).toBe(true);

      const plainMessage = {
        id: 'msg-123',
        from: 'test',
        text: 'Plain text',
        timestamp: new Date().toISOString(),
        read: false,
      };
      expect(isStructuredProtocolMessage(plainMessage)).toBe(false);
    });
  });
});
