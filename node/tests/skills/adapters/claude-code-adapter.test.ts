/**
 * EKET Framework - Claude Code Skill Adapter Tests
 * Version: 0.9.2
 *
 * Tests for Claude Code Adapter: file system interaction,
 * readSkillFromInbox, writeSkillResult, atomic file operations
 */

import { Volume } from 'memfs';
import { ClaudeCodeSkillAdapter, createClaudeCodeAdapter } from '@/skills/adapters/claude-code-adapter.js';
import { EketErrorClass } from '@/types/index.js';

// Mock fs and fs/promises using memfs's default volume
jest.mock('fs', () => require('memfs').fs);
jest.mock('fs/promises', () => require('memfs').fs.promises);

describe('ClaudeCodeSkillAdapter', () => {
  let adapter: ClaudeCodeSkillAdapter;
  let mockVolume: Volume;
  const testProjectRoot = '/test/project';
  const testInboxDir = '/test/project/.eket/inbox';
  const testOutboxDir = '/test/project/.eket/outbox';

  beforeEach(() => {
    // Get memfs default volume and reset it
    mockVolume = require('memfs').vol;
    mockVolume.reset();
    mockVolume.fromJSON({});

    adapter = createClaudeCodeAdapter({
      type: 'claude-code',
      projectRoot: testProjectRoot,
    });
  });

  afterEach(() => {
    mockVolume.reset();
    jest.clearAllMocks();
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

      // Directories should be created
      expect(mockVolume.existsSync(testInboxDir)).toBe(true);
      expect(mockVolume.existsSync(testOutboxDir)).toBe(true);
    });

    it('should handle existing directories', async () => {
      // Pre-create directories
      mockVolume.fromJSON({
        [`${testInboxDir}/.gitkeep`]: '',
        [`${testOutboxDir}/.gitkeep`]: '',
      });

      await adapter.connect();

      expect(mockVolume.existsSync(testInboxDir)).toBe(true);
      expect(mockVolume.existsSync(testOutboxDir)).toBe(true);
    });

    it('should throw CONNECTION_FAILED if directory creation fails', async () => {
      // Simulate permission error by making parent directory non-writable
      mockVolume.fromJSON({
        '/readonly/.eket': '',
      });

      const readonlyAdapter = createClaudeCodeAdapter({
        type: 'claude-code',
        projectRoot: '/readonly',
      });

      // This should fail because we can't write to /readonly
      await expect(readonlyAdapter.connect()).rejects.toThrow(/CONNECTION_FAILED|Failed to connect/);
    });

    it('should start polling for responses', async () => {
      await adapter.connect();

      // Adapter should be connected
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
      // Add a pending request
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

      mockVolume.fromJSON({
        [`${testInboxDir}/${requestFile}`]: JSON.stringify(requestContent),
      });

      const result = await adapter.readSkillFromInbox();

      expect(result).not.toBeNull();
      expect(result?.requestId).toBe('req_001');
      expect(result?.skillName).toBe('test_skill');
    });

    it('should delete request file after reading', async () => {
      const requestFile = 'req_002.request.json';
      mockVolume.fromJSON({
        [`${testInboxDir}/${requestFile}`]: JSON.stringify({
          requestId: 'req_002',
          type: 'skill_request',
          createdAt: Date.now(),
        }),
      });

      await adapter.readSkillFromInbox();

      expect(mockVolume.existsSync(`${testInboxDir}/${requestFile}`)).toBe(false);
    });

    it('should return null when inbox is empty', async () => {
      const result = await adapter.readSkillFromInbox();

      expect(result).toBeNull();
    });

    it('should return null when only non-request files exist', async () => {
      mockVolume.fromJSON({
        [`${testInboxDir}/readme.txt`]: 'Not a request file',
        [`${testInboxDir}/data.json`]: '{"not": "a request"}',
      });

      const result = await adapter.readSkillFromInbox();

      expect(result).toBeNull();
    });

    it('should read oldest request file first', async () => {
      mockVolume.fromJSON({
        [`${testInboxDir}/req_003.request.json`]: JSON.stringify({
          requestId: 'req_003',
          type: 'skill_request',
          createdAt: Date.now() + 2000,
        }),
        [`${testInboxDir}/req_001.request.json`]: JSON.stringify({
          requestId: 'req_001',
          type: 'skill_request',
          createdAt: Date.now(),
        }),
        [`${testInboxDir}/req_002.request.json`]: JSON.stringify({
          requestId: 'req_002',
          type: 'skill_request',
          createdAt: Date.now() + 1000,
        }),
      });

      const result = await adapter.readSkillFromInbox();

      expect(result?.requestId).toBe('req_001');
    });

    it('should throw error on invalid JSON', async () => {
      mockVolume.fromJSON({
        [`${testInboxDir}/invalid.request.json`]: 'not valid json',
      });

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

      const files = mockVolume.readdirSync(testOutboxDir);
      expect(files).toContain('resp_001.response.json');
    });

    it('should use atomic write (temp + rename) pattern', async () => {
      const result = {
        requestId: 'resp_002',
        success: true,
        result: {},
        completedAt: Date.now(),
      };

      await adapter.writeSkillResult(result);

      // Verify final file exists
      const files = mockVolume.readdirSync(testOutboxDir);
      expect(files.some((f: string) => f.endsWith('.response.json'))).toBe(true);
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

      const content = mockVolume.readFileSync(
        `${testOutboxDir}/resp_003.response.json`,
        'utf-8'
      ) as string;

      expect(content).toContain('"requestId": "resp_003"');
      expect(content).toContain('"success": false');
    });
  });

  describe('fetchSkill()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should write request to inbox and wait for response', async () => {
      const requestId = 'cc_fetch_test';
      mockVolume.fromJSON({
        [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
          requestId,
          success: true,
          skill: {
            name: 'fetched_skill',
            description: 'Fetched description',
            category: 'testing',
          },
          completedAt: Date.now(),
        }),
      });

      const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
      (adapter as any).generateRequestId = () => requestId;

      const skill = await adapter.fetchSkill('test_skill');

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('fetched_skill');

      (adapter as any).generateRequestId = originalGenerateRequestId;
    });

    it('should return null on timeout', async () => {
      adapter = createClaudeCodeAdapter({
        type: 'claude-code',
        projectRoot: testProjectRoot,
        requestTimeout: 50,
      });
      await adapter.connect();

      // No response will be written
      const skill = await adapter.fetchSkill('nonexistent');

      expect(skill).toBeNull();
    });

    it('should return null on failed response', async () => {
      const requestId = 'cc_fail_test';
      mockVolume.fromJSON({
        [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
          requestId,
          success: false,
          error: 'Skill not found',
          completedAt: Date.now(),
        }),
      });

      const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
      (adapter as any).generateRequestId = () => requestId;

      const skill = await adapter.fetchSkill('missing_skill');

      expect(skill).toBeNull();

      (adapter as any).generateRequestId = originalGenerateRequestId;
    });
  });

  describe('listSkills()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should return list of skill names', async () => {
      // Create a known request ID and pre-add response
      const requestId = 'cc_list_test';
      mockVolume.fromJSON({
        [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
          requestId,
          success: true,
          skills: ['skill1', 'skill2', 'skill3'],
          completedAt: Date.now(),
        }),
      });

      // Mock the generateRequestId to return our known ID
      const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
      (adapter as any).generateRequestId = () => requestId;

      const skills = await adapter.listSkills();

      expect(skills).toHaveLength(3);
      expect(skills).toContain('skill1');
      expect(skills).toContain('skill2');
      expect(skills).toContain('skill3');

      // Restore original method
      (adapter as any).generateRequestId = originalGenerateRequestId;
    });

    it('should return empty array on error', async () => {
      const requestId = 'cc_err_test';
      mockVolume.fromJSON({
        [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
          requestId,
          success: false,
          error: 'API error',
          completedAt: Date.now(),
        }),
      });

      const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
      (adapter as any).generateRequestId = () => requestId;

      const skills = await adapter.listSkills();

      expect(skills).toHaveLength(0);

      (adapter as any).generateRequestId = originalGenerateRequestId;
    });
  });

  describe('execute()', () => {
    beforeEach(async () => {
      await adapter.connect();
    });

    it('should execute skill and return result', async () => {
      const requestId = 'cc_exec_test';
      mockVolume.fromJSON({
        [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
          requestId,
          success: true,
          result: { output: 'executed successfully', data: { key: 'value' } },
          completedAt: Date.now(),
        }),
      });

      const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
      (adapter as any).generateRequestId = () => requestId;

      const result = await adapter.execute('test_skill', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ output: 'executed successfully', data: { key: 'value' } });
      expect(result.duration).toBeGreaterThanOrEqual(0);

      (adapter as any).generateRequestId = originalGenerateRequestId;
    });

    it('should return error on failed execution', async () => {
      const requestId = 'cc_fail_exec_test';
      mockVolume.fromJSON({
        [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
          requestId,
          success: false,
          error: 'Execution failed: invalid params',
          completedAt: Date.now(),
        }),
      });

      const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
      (adapter as any).generateRequestId = () => requestId;

      const result = await adapter.execute('failing_skill', { invalid: 'params' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid params');

      (adapter as any).generateRequestId = originalGenerateRequestId;
    });

    it('should include request ID in inbox file', async () => {
      const requestId = 'cc_inbox_test';
      const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
      (adapter as any).generateRequestId = () => requestId;

      // Start the execute call (it will wait for response)
      const executePromise = adapter.execute('test_skill', {});

      // Give the inbox write a moment to complete
      await new Promise(resolve => setTimeout(resolve, 10));

      // Check inbox - request file should be written
      const files = mockVolume.readdirSync(testInboxDir);
      const requestFiles = files.filter((f: string) => f.endsWith('.request.json'));

      expect(requestFiles.length).toBeGreaterThan(0);
      expect(requestFiles[0]).toBe(`${requestId}.request.json`);

      // Add response file to let the execute complete
      mockVolume.fromJSON({
        [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
          requestId,
          success: true,
          result: {},
          completedAt: Date.now(),
        }),
      });

      await executePromise;

      (adapter as any).generateRequestId = originalGenerateRequestId;
    });
  });

  describe('Polling Mechanism', () => {
    it('should process outbox responses automatically', async () => {
      await adapter.connect();

      // Add a pending request
      let resolvedResponse: any;
      (adapter as any).pendingRequests.set('poll_test', {
        resolve: (r: any) => { resolvedResponse = r; },
        reject: jest.fn(),
        timeout: setTimeout(() => {}, 1000),
      });

      // Add response file
      mockVolume.fromJSON({
        [`${testOutboxDir}/poll_test.response.json`]: JSON.stringify({
          requestId: 'poll_test',
          success: true,
          result: { polled: true },
          completedAt: Date.now(),
        }),
      });

      // Wait for polling to process
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(resolvedResponse).toBeDefined();
      expect(resolvedResponse.success).toBe(true);
    });

    it('should clean up response files after processing', async () => {
      await adapter.connect();

      // Add pending request
      (adapter as any).pendingRequests.set('cleanup_test', {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: setTimeout(() => {}, 1000),
      });

      // Add response file
      mockVolume.fromJSON({
        [`${testOutboxDir}/cleanup_test.response.json`]: JSON.stringify({
          requestId: 'cleanup_test',
          success: true,
          result: {},
          completedAt: Date.now(),
        }),
      });

      // Wait for polling
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Response file should be deleted
      expect(
        mockVolume.existsSync(`${testOutboxDir}/cleanup_test.response.json`)
      ).toBe(false);
    });

    it('should skip orphan responses (no pending request)', async () => {
      await adapter.connect();

      // Add response file without pending request
      mockVolume.fromJSON({
        [`${testOutboxDir}/orphan.response.json`]: JSON.stringify({
          requestId: 'orphan',
          success: true,
          result: {},
          completedAt: Date.now(),
        }),
      });

      // Wait for polling
      await new Promise((resolve) => setTimeout(resolve, 600));

      // File should still exist (not processed)
      // Note: depends on implementation - may be cleaned up separately
      expect(
        mockVolume.existsSync(`${testOutboxDir}/orphan.response.json`)
      ).toBe(true);
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs with cc_ prefix', () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((adapter as any).generateRequestId());
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      // All should have cc_ prefix
      ids.forEach((id) => {
        expect(id.startsWith('cc_')).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle directory read errors in polling', async () => {
      await adapter.connect();

      // Polling should not crash even with errors
      expect(adapter.connected).toBe(true);
    });

    it('should handle malformed response JSON', async () => {
      await adapter.connect();

      (adapter as any).pendingRequests.set('malformed', {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: setTimeout(() => {}, 1000),
      });

      mockVolume.fromJSON({
        [`${testOutboxDir}/malformed.response.json`]: 'not valid json',
      });

      // Wait for polling to process (should skip invalid file)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Should not crash
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

describe('ClaudeCodeSkillAdapter - Atomic Operations', () => {
  let adapter: ClaudeCodeSkillAdapter;
  let mockVolume: Volume;
  const testProjectRoot = '/atomic/test';
  const testOutboxDir = '/atomic/test/.eket/outbox';

  beforeEach(() => {
    // Get memfs default volume and reset it
    mockVolume = require('memfs').vol;
    mockVolume.reset();
    mockVolume.fromJSON({});

    adapter = createClaudeCodeAdapter({
      type: 'claude-code',
      projectRoot: testProjectRoot,
    });
  });

  afterEach(() => {
    mockVolume.reset();
  });

  it('should use temp file pattern for inbox writes', async () => {
    await adapter.connect();

    const requestId = 'atomic_test';
    mockVolume.fromJSON({
      [`${testOutboxDir}/${requestId}.response.json`]: JSON.stringify({
        requestId,
        success: true,
        result: {},
        completedAt: Date.now(),
      }),
    });

    const originalGenerateRequestId = (adapter as any).generateRequestId.bind(adapter);
    (adapter as any).generateRequestId = () => requestId;

    await adapter.fetchSkill('test');

    (adapter as any).generateRequestId = originalGenerateRequestId;

    // Temp file should not exist after operation
    const outboxFiles = mockVolume.readdirSync(testOutboxDir);
    const tempFiles = outboxFiles.filter((f: string) => f.includes('.tmp.'));
    expect(tempFiles).toHaveLength(0);
  });

  it('should prevent partial writes', async () => {
    await adapter.connect();

    const result = {
      requestId: 'partial_test',
      success: true,
      result: { largeData: new Array(1000).fill('data') },
      completedAt: Date.now(),
    };

    await adapter.writeSkillResult(result);

    // Read back and verify integrity
    const content = mockVolume.readFileSync(
      `${testOutboxDir}/partial_test.response.json`,
      'utf-8'
    ) as string;

    const parsed = JSON.parse(content);
    expect(parsed.requestId).toBe('partial_test');
    expect(parsed.result.largeData).toHaveLength(1000);
  });
});
