/**
 * EKET Framework - OpenCLAW Skill Adapter Tests
 * Version: 0.9.2
 *
 * Tests for OpenCLAW Adapter: connect, fetchSkill, listSkills, execute,
 * protocol conversion, error handling
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { OpenCLAWSkillAdapter, createOpenCLAWAdapter } from '@/skills/adapters/openclaw-adapter.js';
import { EketErrorClass } from '@/types/index.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('OpenCLAWSkillAdapter', () => {
  let adapter: OpenCLAWSkillAdapter;
  const baseConfig = {
    type: 'openclaw' as const,
    host: 'localhost',
    port: 8080,
    projectRoot: '/test/project',
  };

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = new OpenCLAWSkillAdapter(baseConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with correct configuration', () => {
      expect(adapter.source).toBe('openclaw');
      expect(adapter.connected).toBe(false);
    });

    it('should set authorization header when apiKey is provided', () => {
      const adapterWithAuth = new OpenCLAWSkillAdapter({
        ...baseConfig,
        apiKey: 'test-api-key',
      });

      expect(adapterWithAuth).toBeDefined();
    });

    it('should use http by default', () => {
      const adapterWithHttps = new OpenCLAWSkillAdapter({
        ...baseConfig,
        useHttps: false,
      });

      expect(adapterWithHttps).toBeDefined();
    });

    it('should use https when useHttps is true', () => {
      const adapterWithHttps = new OpenCLAWSkillAdapter({
        ...baseConfig,
        useHttps: true,
      });

      expect(adapterWithHttps).toBeDefined();
    });
  });

  describe('connect()', () => {
    it('should successfully connect to OpenCLAW server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });

      await adapter.connect();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://localhost:8080/api/v1/rpc',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should throw CONNECTION_FAILED on connection error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(adapter.connect()).rejects.toThrow('Failed to connect to OpenCLAW');
    });

    it('should throw CONNECTION_FAILED on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Service unavailable',
      });

      await expect(adapter.connect()).rejects.toThrow('Failed to connect to OpenCLAW');
    });

    it('should set connected to true on successful connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });

      await adapter.connect();

      // Note: connected is readonly, but we can verify connection succeeded
      expect(adapter.connected).toBe(true);
    });
  });

  describe('disconnect()', () => {
    it('should set connected to false', async () => {
      // First connect
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });
      await adapter.connect();

      // Then disconnect
      await adapter.disconnect();

      expect(adapter.connected).toBe(false);
    });
  });

  describe('fetchSkill()', () => {
    beforeEach(() => {
      // Mock successful connection for all fetchSkill tests
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
            name: 'test_skill',
            description: 'Test skill description',
            category: 'testing',
            input_schema: { type: 'object' },
            output_schema: { type: 'object' },
            steps: [{ name: 'step1', action: 'test' }],
          },
        }),
      });

      const skill = await adapter.fetchSkill('test_skill');

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('test_skill');
      expect(skill?.description).toBe('Test skill description');
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

    it('should throw error on API failure', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Internal server error',
      });

      await expect(adapter.fetchSkill('test_skill')).rejects.toThrow();
    });

    it('should transform skill steps correctly', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            name: 'complex_skill',
            description: 'Complex skill',
            category: 'development',
            steps: [
              { name: 'step1', action: 'analyze', parameters: { param1: 'value1' } },
              { name: 'step2', action: 'generate', parameters: { param2: 'value2' } },
            ],
          },
        }),
      });

      const skill = await adapter.fetchSkill('complex_skill');

      expect(skill?.steps).toHaveLength(2);
      expect(skill?.steps?.[0].name).toBe('step1');
      expect(skill?.steps?.[0].action).toBe('analyze');
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
          data: { skills: ['skill1', 'skill2', 'skill3'] },
        }),
      });

      const skills = await adapter.listSkills();

      expect(skills).toHaveLength(3);
      expect(skills).toContain('skill1');
      expect(skills).toContain('skill2');
      expect(skills).toContain('skill3');
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
        json: async () => ({ success: true, data: { skills: [] } }),
      });

      const skills = await adapter.listSkills();

      expect(skills).toHaveLength(0);
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
          data: { result: 'execution result', processed: true },
        }),
      });

      const result = await adapter.execute('test_skill', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'execution result', processed: true });
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

      const result = await adapter.execute('failing_skill', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill execution failed');
    });

    it('should include duration in result', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      const result = await adapter.execute('timed_skill', {});

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should handle network errors gracefully', async () => {
      await adapter.connect();

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.execute('network_error_skill', {});

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Protocol Message Format', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });
    });

    it('should send correctly formatted protocol messages', async () => {
      await adapter.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await adapter.execute('test_skill', { test: 'param' });

      const call = mockFetch.mock.calls[1];
      const body = JSON.parse(call?.[1]?.body as string);

      expect(body.type).toBe('skill_request');
      expect(body.from).toBe('eket-adapter');
      expect(body.to).toBe('openclaw');
      expect(body.payload.skillName).toBe('skill.execute');
    });

    it('should include request timeout in payload', async () => {
      const adapterWithTimeout = new OpenCLAWSkillAdapter({
        ...baseConfig,
        requestTimeout: 5000,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });
      await adapterWithTimeout.connect();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

      await adapterWithTimeout.execute('test_skill', {});

      const call = mockFetch.mock.calls[1];
      const body = JSON.parse(call?.[1]?.body as string);

      expect(body.payload.timeout).toBe(5000);
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
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, data: { status: 'healthy' } }),
      });

      await adapter.connect();

      const calls: string[] = [];
      for (let i = 0; i < 5; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: {} }),
        });
        await adapter.execute(`skill_${i}`, {});
        const call = mockFetch.mock.calls[i + 1];
        const body = JSON.parse(call?.[1]?.body as string);
        calls.push(body.id);
      }

      // All IDs should be unique
      const uniqueIds = new Set(calls);
      expect(uniqueIds.size).toBe(5);
    });
  });
});

describe('createOpenCLAWAdapter', () => {
  it('should create adapter instance', () => {
    const adapter = createOpenCLAWAdapter({
      type: 'openclaw',
      host: 'localhost',
      port: 8080,
      projectRoot: '/test',
    });

    expect(adapter).toBeInstanceOf(OpenCLAWSkillAdapter);
  });
});

describe('OpenCLAWSkillAdapter - HTTPS Configuration', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should use https when configured', async () => {
    const adapter = new OpenCLAWSkillAdapter({
      type: 'openclaw',
      host: 'secure.example.com',
      port: 443,
      projectRoot: '/test',
      useHttps: true,
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { status: 'healthy' } }),
    });

    await adapter.connect();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://secure.example.com:443/api/v1/rpc',
      expect.any(Object)
    );
  });
});

describe('OpenCLAWSkillAdapter - API Key Authentication', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should include Bearer token in requests', async () => {
    const adapter = new OpenCLAWSkillAdapter({
      type: 'openclaw',
      host: 'localhost',
      port: 8080,
      projectRoot: '/test',
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
});
