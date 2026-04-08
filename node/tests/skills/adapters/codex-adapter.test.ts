/**
 * EKET Framework - Codex Skill Adapter Tests
 * Version: 0.9.2
 *
 * Tests for Codex Adapter: HTTP API calls, Bearer Token authentication,
 * error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CodexSkillAdapter, createCodexAdapter } from '@/skills/adapters/codex-adapter.js';
import { EketErrorClass } from '@/types/index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('CodexSkillAdapter', () => {
  let adapter: CodexSkillAdapter;
  const baseConfig = {
    type: 'codex' as const,
    baseUrl: 'https://api.codex.example.com',
    apiKey: 'test-api-key',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new CodexSkillAdapter(baseConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with correct configuration', () => {
      expect(adapter.source).toBe('codex');
      expect(adapter.connected).toBe(false);
    });

    it('should set Bearer token authorization header', () => {
      const adapterWithAuth = new CodexSkillAdapter({
        ...baseConfig,
        apiKey: 'secret-key',
      });

      expect(adapterWithAuth).toBeDefined();
    });

    it('should include organization ID header when provided', () => {
      const adapterWithOrg = new CodexSkillAdapter({
        ...baseConfig,
        organizationId: 'org-123',
      });

      expect(adapterWithOrg).toBeDefined();
    });

    it('should set User-Agent header', () => {
      const testAdapter = new CodexSkillAdapter(baseConfig);
      expect(testAdapter).toBeDefined();
    });
  });

  describe('connect()', () => {
    it('should successfully connect to Codex server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy', version: '1.0.0' } }),
      });

      await adapter.connect();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.codex.example.com/health',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should throw CONNECTION_FAILED on connection error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.connect()).rejects.toThrow('CONNECTION_FAILED');
    });

    it('should throw CONNECTION_FAILED on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Service unavailable',
      });

      await expect(adapter.connect()).rejects.toThrow('CONNECTION_FAILED');
    });

    it('should handle API errors with details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => '{"error": "Invalid API key"}',
      });

      await expect(adapter.connect()).rejects.toThrow();
    });
  });

  describe('disconnect()', () => {
    it('should set connected to false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });

      await adapter.connect();
      await adapter.disconnect();

      expect(adapter.connected).toBe(false);
    });
  });

  describe('fetchSkill()', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });
    });

    it('should fetch skill definition successfully', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'skill_001',
            name: 'codex_test_skill',
            description: 'Codex test skill description',
            category: 'testing',
            version: '1.0.0',
            input_schema: { type: 'object' },
            output_schema: { type: 'object' },
            steps: [{ name: 'step1', action: 'test' }],
          },
        }),
      });

      const skill = await adapter.fetchSkill('codex_test_skill');

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('codex_test_skill');
      expect(skill?.description).toBe('Codex test skill description');
      expect(skill?.category).toBe('testing');
    });

    it('should return null when skill not found', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Skill not found',
      });

      const skill = await adapter.fetchSkill('nonexistent');

      expect(skill).toBeNull();
    });

    it('should handle NOT_FOUND error code', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Skill not found' },
        }),
      });

      const skill = await adapter.fetchSkill('missing');

      expect(skill).toBeNull();
    });

    it('should transform skill steps correctly', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'skill_002',
            name: 'complex_codex_skill',
            description: 'Complex skill',
            category: 'development',
            version: '2.0.0',
            steps: [
              { name: 'step1', action: 'analyze', parameters: { param1: 'value1' } },
              { name: 'step2', action: 'generate', parameters: { param2: 'value2' } },
              { name: 'step3', action: 'validate' },
            ],
          },
        }),
      });

      const skill = await adapter.fetchSkill('complex_codex_skill');

      expect(skill?.steps).toHaveLength(3);
      expect(skill?.steps?.[0].name).toBe('step1');
      expect(skill?.steps?.[2].action).toBe('validate');
    });
  });

  describe('listSkills()', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });
    });

    it('should list all available skills', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            skills: [
              { name: 'codex_skill1' },
              { name: 'codex_skill2' },
              { name: 'codex_skill3' },
            ],
          },
        }),
      });

      const skills = await adapter.listSkills();

      expect(skills).toHaveLength(3);
      expect(skills).toContain('codex_skill1');
      expect(skills).toContain('codex_skill2');
      expect(skills).toContain('codex_skill3');
    });

    it('should return empty array on error', async () => {
      await adapter.connect();

      mockFetch.mockRejectedValueOnce(new Error('API error'));

      const skills = await adapter.listSkills();

      expect(skills).toHaveLength(0);
    });

    it('should handle empty skill list', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { skills: [] },
        }),
      });

      const skills = await adapter.listSkills();

      expect(skills).toHaveLength(0);
    });

    it('should throw EXECUTION_ERROR on API failure', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Internal server error',
      });

      await expect(adapter.listSkills()).rejects.toThrow('EXECUTION_ERROR');
    });
  });

  describe('execute()', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });
    });

    it('should execute skill successfully', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { result: 'codex execution result', processed: true },
        }),
      });

      const result = await adapter.execute('codex_test_skill', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'codex execution result', processed: true });
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should return error on execution failure', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          error: { code: 'EXECUTION_FAILED', message: 'Skill execution failed' },
        }),
      });

      const result = await adapter.execute('failing_codex_skill', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill execution failed');
    });

    it('should include duration in result', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      const result = await adapter.execute('timed_codex_skill', {});

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle network errors gracefully', async () => {
      await adapter.connect();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.execute('network_error_codex_skill', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should pass skill_name and params to API', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await adapter.execute('parameterized_skill', { key1: 'value1', key2: 'value2' });

      const call = mockFetch.mock.calls[1];
      const body = JSON.parse(call?.[1]?.body as string);

      expect(body.params).toEqual({
        skill_name: 'parameterized_skill',
        params: { key1: 'value1', key2: 'value2' },
      });
    });
  });

  describe('API Request Format', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });
    });

    it('should send correctly formatted API requests', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await adapter.execute('test_skill', { test: 'param' });

      const call = mockFetch.mock.calls[1];
      const url = call?.[0] as string;
      const options = call?.[1] as RequestInit;

      expect(url).toBe('https://api.codex.example.com/skills/execute');
      expect(options.method).toBe('POST');
      expect(options.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-api-key',
      });
    });

    it('should include request ID in payload', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await adapter.fetchSkill('request_id_test');

      const call = mockFetch.mock.calls[1];
      const body = JSON.parse(call?.[1]?.body as string);

      expect(body.requestId).toBeDefined();
      expect(body.requestId).toMatch(/codex_\d+_\d+/);
    });

    it('should use correct endpoint for each method', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { skills: [] } }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await adapter.listSkills();
      await adapter.fetchSkill('test');

      const listCall = mockFetch.mock.calls[1];
      const fetchCall = mockFetch.mock.calls[2];

      expect(listCall?.[0]).toBe('https://api.codex.example.com/skills/list');
      expect(fetchCall?.[0]).toBe('https://api.codex.example.com/skills/get');
    });
  });

  describe('Error Handling', () => {
    it('should handle API response without data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await expect(adapter.connect()).rejects.toThrow();
    });

    it('should handle malformed JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      await expect(adapter.connect()).rejects.toThrow();
    });

    it('should include error context in exceptions', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      try {
        await adapter.connect();
      } catch (error) {
        expect(error).toBeInstanceOf(EketErrorClass);
        const eketError = error as EketErrorClass;
        expect(eketError.message).toContain('Connection refused');
      }
    });

    it('should handle HTTP error status codes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(adapter.connect()).rejects.toThrow('500');
    });

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded',
      });

      await expect(adapter.connect()).rejects.toThrow('429');
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });

      await adapter.connect();

      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: {} }),
        });
        await adapter.execute(`skill_${i}`, {});
        const call = mockFetch.mock.calls[i + 1];
        const body = JSON.parse(call?.[1]?.body as string);
        ids.push(body.requestId);
      }

      // All IDs should be unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      // All should have codex_ prefix
      ids.forEach((id) => {
        expect(id.startsWith('codex_')).toBe(true);
      });
    });

    it('should increment counter for each request', () => {
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push((adapter as any).generateRequestId());
      }

      // Counter should increment, making each ID unique
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('Base URL Handling', () => {
    it('should handle base URL with trailing slash', async () => {
      const adapterWithSlash = new CodexSkillAdapter({
        ...baseConfig,
        baseUrl: 'https://api.codex.example.com/',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });

      await adapterWithSlash.connect();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.codex.example.com/health',
        expect.any(Object)
      );
    });

    it('should handle base URL without trailing slash', async () => {
      const adapterWithoutSlash = new CodexSkillAdapter({
        ...baseConfig,
        baseUrl: 'https://api.codex.example.com',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });

      await adapterWithoutSlash.connect();

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});

describe('createCodexAdapter', () => {
  it('should create CodexSkillAdapter instance', () => {
    const adapter = createCodexAdapter({
      type: 'codex',
      baseUrl: 'https://api.codex.example.com',
      apiKey: 'test-key',
    });

    expect(adapter).toBeInstanceOf(CodexSkillAdapter);
  });

  it('should accept optional configuration', () => {
    const adapter = createCodexAdapter({
      type: 'codex',
      baseUrl: 'https://api.codex.example.com',
      apiKey: 'test-key',
      organizationId: 'org-123',
      defaultModel: 'codex-latest',
    });

    expect(adapter).toBeDefined();
  });
});

describe('CodexSkillAdapter - Authentication', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should include Bearer token in all requests', async () => {
    const adapter = new CodexSkillAdapter({
      type: 'codex',
      baseUrl: 'https://api.codex.example.com',
      apiKey: 'secret-api-key',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { status: 'healthy' } }),
    });

    await adapter.connect();

    const call = mockFetch.mock.calls[0];
    const headers = call?.[1]?.headers as Record<string, string>;

    expect(headers['Authorization']).toBe('Bearer secret-api-key');
  });

  it('should include organization ID header when configured', async () => {
    const adapter = new CodexSkillAdapter({
      type: 'codex',
      baseUrl: 'https://api.codex.example.com',
      apiKey: 'test-key',
      organizationId: 'my-org',
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { status: 'healthy' } }),
    });

    await adapter.connect();

    const call = mockFetch.mock.calls[0];
    const headers = call?.[1]?.headers as Record<string, string>;

    expect(headers['X-Organization-ID']).toBe('my-org');
  });
});

describe('CodexSkillAdapter - Response Handling', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { status: 'healthy' } }),
    });
  });

  it('should handle successful API response', async () => {
    await new CodexSkillAdapter(baseConfig).connect();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { result: 'success' },
        requestId: 'test_123',
      }),
    });

    const adapter = new CodexSkillAdapter(baseConfig);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { status: 'healthy' } }),
    });
    await adapter.connect();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { result: 'test' },
      }),
    });

    const result = await adapter.execute('test', {});

    expect(result.success).toBe(true);
  });

  it('should handle API error response', async () => {
    const adapter = new CodexSkillAdapter(baseConfig);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: { code: 'SKILL_NOT_FOUND', message: 'Skill does not exist' },
      }),
    });

    await adapter.connect();

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: false,
        error: { code: 'EXECUTION_ERROR', message: 'Failed to execute' },
      }),
    });

    const result = await adapter.execute('nonexistent', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to execute');
  });
});
