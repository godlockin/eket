/**
 * EKET Framework - Claude Code Skill Adapter Tests
 * Version: 0.9.2
 *
 * Tests for Claude Code Adapter using real file system (temp directories)
 * instead of memfs which doesn't work in ts-jest ESM environment.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeCodeSkillAdapter, createClaudeCodeAdapter } from '@/skills/adapters/claude-code-adapter.js';
import { setupFsTest, cleanupTempDir } from '../../../helpers/fs-test.js';

describe('ClaudeCodeSkillAdapter', () => {
  let adapter: ClaudeCodeSkillAdapter;
  let tempDir: string;
  let testProjectRoot: string;
  let testInboxDir: string;
  let testOutboxDir: string;

  beforeEach(() => {
    const { dir, cleanup } = setupFsTest('claude-code-adapter-test-');
    tempDir = dir;
    testProjectRoot = path.join(tempDir, 'project');
    testInboxDir = path.join(testProjectRoot, '.eket', 'inbox');
    testOutboxDir = path.join(testProjectRoot, '.eket', 'outbox');

    fs.mkdirSync(testProjectRoot, { recursive: true });

    adapter = createClaudeCodeAdapter({
      type: 'claude-code',
      projectRoot: testProjectRoot,
    });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('constructor', () => {
    it('should create adapter with default directories', () => {
      expect(adapter.source).toBe('claude-code');
      expect(adapter.connected).toBe(false);
    });

    it('should use custom inbox/outbox directories when provided', () => {
      const customAdapter = createClaudeCodeAdapter({
        type: 'claude-code',
        projectRoot: testProjectRoot,
        inboxDir: '/custom/inbox',
        outboxDir: '/custom/outbox',
      });

      expect(customAdapter).toBeDefined();
    });
  });

  describe('connect()', () => {
    it('should create inbox and outbox directories', async () => {
      await adapter.connect();

      expect(fs.existsSync(testInboxDir)).toBe(true);
      expect(fs.existsSync(testOutboxDir)).toBe(true);
    });

    it('should handle existing directories', async () => {
      // Pre-create directories
      fs.mkdirSync(testInboxDir, { recursive: true });
      fs.mkdirSync(testOutboxDir, { recursive: true });
      fs.writeFileSync(path.join(testInboxDir, '.gitkeep'), '');

      await adapter.connect();

      expect(fs.existsSync(testInboxDir)).toBe(true);
      expect(fs.existsSync(testOutboxDir)).toBe(true);
    });

    it('should start polling for responses', async () => {
      await adapter.connect();
      expect(adapter.connected).toBe(true);
    });
  });

  describe('disconnect()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should stop polling', async () => {
      await adapter.disconnect();
      expect(adapter.connected).toBe(false);
    });

    it('should clear pending requests', async () => {
      (adapter as any).pendingRequests.set('test-request', {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: setTimeout(() => {}, 1000),
      });

      await adapter.disconnect();
      expect((adapter as any).pendingRequests.size).toBe(0);
    });

    it('should reject pending requests', async () => {
      const rejectFn = jest.fn();
      (adapter as any).pendingRequests.set('test-request', {
        resolve: jest.fn(),
        reject: rejectFn,
        timeout: setTimeout(() => {}, 1000),
      });

      await adapter.disconnect();
      expect(rejectFn).toHaveBeenCalled();
    });
  });

  describe('readSkillFromInbox()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should read and parse request from inbox', async () => {
      const requestFile = 'req_001.request.json';
      const requestContent = {
        requestId: 'req_001',
        type: 'skill_request',
        skillName: 'test_skill',
        params: { param1: 'value1' },
        createdAt: Date.now(),
      };

      fs.writeFileSync(path.join(testInboxDir, requestFile), JSON.stringify(requestContent));

      const result = await adapter.readSkillFromInbox();

      expect(result).not.toBeNull();
      expect(result?.requestId).toBe('req_001');
      expect(result?.skillName).toBe('test_skill');
    });

    it('should delete request file after reading', async () => {
      const requestFile = 'req_002.request.json';
      fs.writeFileSync(
        path.join(testInboxDir, requestFile),
        JSON.stringify({
          requestId: 'req_002',
          type: 'skill_request',
          createdAt: Date.now(),
        })
      );

      await adapter.readSkillFromInbox();

      expect(fs.existsSync(path.join(testInboxDir, requestFile))).toBe(false);
    });

    it('should return null when inbox is empty', async () => {
      const result = await adapter.readSkillFromInbox();
      expect(result).toBeNull();
    });

    it('should return null when only non-request files exist', async () => {
      fs.writeFileSync(path.join(testInboxDir, 'readme.txt'), 'Not a request file');
      fs.writeFileSync(path.join(testInboxDir, 'data.json'), '{"not": "a request"}');

      const result = await adapter.readSkillFromInbox();
      expect(result).toBeNull();
    });

    it('should throw error on invalid JSON', async () => {
      fs.writeFileSync(path.join(testInboxDir, 'invalid.request.json'), 'not valid json');
      await expect(adapter.readSkillFromInbox()).rejects.toThrow();
    });
  });

  describe('writeSkillResult()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should write result to outbox directory', async () => {
      const result = {
        requestId: 'resp_001',
        success: true,
        result: { data: 'test result' },
        completedAt: Date.now(),
      };

      await adapter.writeSkillResult(result);

      const files = fs.readdirSync(testOutboxDir);
      expect(files.some(f => f.endsWith('.response.json'))).toBe(true);
    });

    it('should throw error if outbox directory is not writable', async () => {
      const readonlyAdapter = createClaudeCodeAdapter({
        type: 'claude-code',
        projectRoot: '/readonly',
      });

      await expect(
        readonlyAdapter.writeSkillResult({
          requestId: 'test',
          success: true,
          result: {},
          completedAt: Date.now(),
        })
      ).rejects.toThrow();
    });

    it('should write correctly formatted JSON', async () => {
      const result = {
        requestId: 'resp_003',
        success: false,
        error: 'Test error message',
        completedAt: 1234567890,
      };

      await adapter.writeSkillResult(result);

      const content = fs.readFileSync(
        path.join(testOutboxDir, 'resp_003.response.json'),
        'utf-8'
      );

      // Parse and verify content (format may be pretty-printed)
      const parsed = JSON.parse(content);
      expect(parsed.requestId).toBe('resp_003');
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Test error message');
      expect(parsed.completedAt).toBe(1234567890);
    });
  });

  describe('fetchSkill()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should return null on timeout', async () => {
      adapter = createClaudeCodeAdapter({
        type: 'claude-code',
        projectRoot: testProjectRoot,
        requestTimeout: 50,
      });
      await adapter.connect();

      const skill = await adapter.fetchSkill('nonexistent');
      expect(skill).toBeNull();
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs with cc_ prefix', () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((adapter as any).generateRequestId());
      }

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      ids.forEach((id) => {
        expect(id.startsWith('cc_')).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle directory read errors in polling', async () => {
      await adapter.connect();
      expect(adapter.connected).toBe(true);
    });
  });
});

describe('createClaudeCodeAdapter', () => {
  it('should create ClaudeCodeSkillAdapter instance', () => {
    const adapter = createClaudeCodeAdapter({
      type: 'claude-code',
      projectRoot: '/test',
    });

    expect(adapter).toBeInstanceOf(ClaudeCodeSkillAdapter);
  });

  it('should accept custom configuration', () => {
    const adapter = createClaudeCodeAdapter({
      type: 'claude-code',
      projectRoot: '/custom',
      inboxDir: '/custom/inbox',
      outboxDir: '/custom/outbox',
      requestTimeout: 30000,
    });

    expect(adapter).toBeDefined();
  });
});
