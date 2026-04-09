/**
 * EKET Framework - Skills Registry Tests
 * Version: 0.9.2
 *
 * Tests for Skills Registry: register, getSkill, getSkillsByCategory, listSkills,
 * unregister, clear, registerAdapter, getAdapter, getStats
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { SkillsRegistry, createSkillsRegistry, getGlobalSkillsRegistry, resetGlobalSkillsRegistry } from '@/skills/registry.js';
import { SkillCategory } from '@/skills/types.js';
import type { Skill } from '@/skills/types.js';
import type { SkillAdapter } from '@/skills/adapters/types.js';

// Mock Skill for testing
function createMockSkill(name: string, category: string = 'custom'): Skill {
  return {
    name,
    description: `Mock skill ${name}`,
    category,
    tags: ['mock', 'test'],
    version: '1.0.0',
    execute: jest.fn().mockResolvedValue({
      success: true,
      data: { result: 'mock result' },
      duration: 10,
    }),
    validateInput: jest.fn().mockReturnValue(true),
  };
}

// Mock Adapter for testing
function createMockAdapter(name: string, source: string = 'openclaw'): SkillAdapter {
  return {
    source: source as any,
    connected: true,
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    fetchSkill: jest.fn().mockResolvedValue(null),
    listSkills: jest.fn().mockResolvedValue([]),
    execute: jest.fn().mockResolvedValue({ success: true, output: {}, duration: 10 }),
  };
}

describe('SkillsRegistry', () => {
  let registry: SkillsRegistry;

  beforeEach(() => {
    registry = createSkillsRegistry();
  });

  afterEach(() => {
    // Clean up global registry after each test
    resetGlobalSkillsRegistry();
  });

  describe('register()', () => {
    it('should register a skill successfully', () => {
      const skill = createMockSkill('test_skill', 'requirements');

      expect(() => registry.register(skill)).not.toThrow();
      expect(registry.getSkill('test_skill')).toBe(skill);
    });

    it('should throw error when registering duplicate skill without allowOverwrite', () => {
      const skill = createMockSkill('duplicate_skill');

      registry.register(skill);

      expect(() => registry.register(skill)).toThrow('already registered');
    });

    it('should allow overwriting skill when allowOverwrite is true', () => {
      const registryWithOverwrite = createSkillsRegistry({ allowOverwrite: true });
      const skill1 = createMockSkill('overwrite_skill');
      const skill2 = createMockSkill('overwrite_skill');

      registryWithOverwrite.register(skill1);
      expect(() => registryWithOverwrite.register(skill2)).not.toThrow();
      expect(registryWithOverwrite.getSkill('overwrite_skill')).toBe(skill2);
    });

    it('should throw error when registering invalid skill (missing name)', () => {
      const invalidSkill = {
        description: 'Missing name',
        category: 'custom',
        execute: jest.fn(),
      } as unknown as Skill;

      expect(() => registry.register(invalidSkill)).toThrow('does not implement required methods');
    });

    it('should throw error when registering invalid skill (missing description)', () => {
      const invalidSkill = {
        name: 'invalid_skill',
        category: 'custom',
        execute: jest.fn(),
      } as unknown as Skill;

      expect(() => registry.register(invalidSkill)).toThrow('does not implement required methods');
    });

    it('should throw error when registering invalid skill (missing category)', () => {
      const invalidSkill = {
        name: 'invalid_skill',
        description: 'Missing category',
        execute: jest.fn(),
      } as unknown as Skill;

      expect(() => registry.register(invalidSkill)).toThrow('does not implement required methods');
    });

    it('should throw error when registering invalid skill (missing execute method)', () => {
      const invalidSkill = {
        name: 'invalid_skill',
        description: 'Missing execute',
        category: 'custom',
      } as unknown as Skill;

      expect(() => registry.register(invalidSkill)).toThrow('does not implement required methods');
    });

    it('should register skill to category index', () => {
      const skill = createMockSkill('category_test', 'design');

      registry.register(skill);

      const designSkills = registry.getSkillsByCategory('design');
      expect(designSkills).toContain(skill);
    });

    it('should handle case-insensitive category names', () => {
      const skill = createMockSkill('case_test', 'Requirements');

      registry.register(skill);

      const requirementsSkills = registry.getSkillsByCategory('requirements');
      expect(requirementsSkills).toContain(skill);

      const REQUIREMENTSSkills = registry.getSkillsByCategory('REQUIREMENTS');
      expect(REQUIREMENTSSkills).toContain(skill);
    });
  });

  describe('getSkill()', () => {
    it('should return skill when found', () => {
      const skill = createMockSkill('find_me');
      registry.register(skill);

      const found = registry.getSkill('find_me');
      expect(found).toBe(skill);
    });

    it('should return undefined when skill not found', () => {
      const found = registry.getSkill('nonexistent');
      expect(found).toBeUndefined();
    });

    it('should return undefined after skill is unregistered', () => {
      const skill = createMockSkill('temporary');
      registry.register(skill);
      registry.unregister('temporary');

      const found = registry.getSkill('temporary');
      expect(found).toBeUndefined();
    });
  });

  describe('getSkillsByCategory()', () => {
    it('should return all skills in a category', () => {
      const skill1 = createMockSkill('req1', 'requirements');
      const skill2 = createMockSkill('req2', 'requirements');
      const skill3 = createMockSkill('dev1', 'development');

      registry.register(skill1);
      registry.register(skill2);
      registry.register(skill3);

      const requirementsSkills = registry.getSkillsByCategory('requirements');
      expect(requirementsSkills).toHaveLength(2);
      expect(requirementsSkills).toContain(skill1);
      expect(requirementsSkills).toContain(skill2);
    });

    it('should return empty array for nonexistent category', () => {
      const skills = registry.getSkillsByCategory('nonexistent');
      expect(skills).toHaveLength(0);
    });

    it('should handle mixed case category names', () => {
      const skill = createMockSkill('mixed_case', 'DeSiGn');
      registry.register(skill);

      const designSkills = registry.getSkillsByCategory('design');
      expect(designSkills).toContain(skill);
    });
  });

  describe('listSkills()', () => {
    it('should return all registered skill names', () => {
      const skill1 = createMockSkill('first');
      const skill2 = createMockSkill('second');
      const skill3 = createMockSkill('third');

      registry.register(skill1);
      registry.register(skill2);
      registry.register(skill3);

      const list = registry.listSkills();
      expect(list).toHaveLength(3);
      expect(list).toContain('first');
      expect(list).toContain('second');
      expect(list).toContain('third');
    });

    it('should return empty array when no skills registered', () => {
      const list = registry.listSkills();
      expect(list).toHaveLength(0);
    });

    it('should return correct count after unregister', () => {
      const skill1 = createMockSkill('to_remove');
      const skill2 = createMockSkill('to_keep');

      registry.register(skill1);
      registry.register(skill2);
      registry.unregister('to_remove');

      const list = registry.listSkills();
      expect(list).toHaveLength(1);
      expect(list).toContain('to_keep');
    });
  });

  describe('unregister()', () => {
    it('should remove skill from registry', () => {
      const skill = createMockSkill('removable');
      registry.register(skill);

      registry.unregister('removable');

      expect(registry.getSkill('removable')).toBeUndefined();
      expect(registry.listSkills()).not.toContain('removable');
    });

    it('should remove skill from category index', () => {
      const skill = createMockSkill('cat_removable', 'testing');
      registry.register(skill);

      registry.unregister('cat_removable');

      const testingSkills = registry.getSkillsByCategory('testing');
      expect(testingSkills).not.toContain(skill);
    });

    it('should remove empty category', () => {
      const skill = createMockSkill('only_one', 'unique_category');
      registry.register(skill);

      registry.unregister('only_one');

      // Category should be removed from index
      const uniqueSkills = registry.getSkillsByCategory('unique_category');
      expect(uniqueSkills).toHaveLength(0);
    });

    it('should not throw when unregistering nonexistent skill', () => {
      expect(() => registry.unregister('nonexistent')).not.toThrow();
    });

    it('should not affect other skills in same category', () => {
      const skill1 = createMockSkill('keep1', 'shared');
      const skill2 = createMockSkill('remove1', 'shared');
      const skill3 = createMockSkill('keep2', 'shared');

      registry.register(skill1);
      registry.register(skill2);
      registry.register(skill3);

      registry.unregister('remove1');

      const sharedSkills = registry.getSkillsByCategory('shared');
      expect(sharedSkills).toHaveLength(2);
      expect(sharedSkills).toContain(skill1);
      expect(sharedSkills).toContain(skill3);
    });
  });

  describe('hasSkill()', () => {
    it('should return true for registered skill', () => {
      const skill = createMockSkill('exists');
      registry.register(skill);

      expect(registry.hasSkill('exists')).toBe(true);
    });

    it('should return false for unregistered skill', () => {
      expect(registry.hasSkill('nonexistent')).toBe(false);
    });

    it('should return false after unregister', () => {
      const skill = createMockSkill('was_here');
      registry.register(skill);
      registry.unregister('was_here');

      expect(registry.hasSkill('was_here')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should remove all registered skills', async () => {
      const skill1 = createMockSkill('clear1');
      const skill2 = createMockSkill('clear2');
      const skill3 = createMockSkill('clear3');

      registry.register(skill1);
      registry.register(skill2);
      registry.register(skill3);

      await registry.clear();

      expect(registry.listSkills()).toHaveLength(0);
      expect(registry.getSkill('clear1')).toBeUndefined();
      expect(registry.getSkill('clear2')).toBeUndefined();
      expect(registry.getSkill('clear3')).toBeUndefined();
    });

    it('should clear all category indexes', async () => {
      registry.register(createMockSkill('cat1', 'cat_a'));
      registry.register(createMockSkill('cat2', 'cat_b'));

      await registry.clear();

      expect(registry.getSkillsByCategory('cat_a')).toHaveLength(0);
      expect(registry.getSkillsByCategory('cat_b')).toHaveLength(0);
    });

    it('should disconnect and clear all adapters', async () => {
      const adapter1 = createMockAdapter('adapter1');
      const adapter2 = createMockAdapter('adapter2');

      registry.registerAdapter('adapter1', adapter1, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });
      registry.registerAdapter('adapter2', adapter2, { type: 'openclaw', host: 'localhost', port: 8081, projectRoot: '/test' });

      await registry.clear();

      expect(registry.listAdapters()).toHaveLength(0);
      expect(adapter1.disconnect).toHaveBeenCalled();
      expect(adapter2.disconnect).toHaveBeenCalled();
    });
  });

  describe('registerAdapter()', () => {
    it('should register an adapter successfully', () => {
      const adapter = createMockAdapter('test_adapter');
      const config = { type: 'openclaw' as const, host: 'localhost', port: 8080, projectRoot: '/test' };

      expect(() => registry.registerAdapter('test_adapter', adapter, config)).not.toThrow();
      expect(registry.getAdapter('test_adapter')).toBe(adapter);
    });

    it('should store adapter configuration', () => {
      const adapter = createMockAdapter('configured_adapter');
      const config = { type: 'openclaw' as const, host: 'example.com', port: 9000, projectRoot: '/project' };

      registry.registerAdapter('configured_adapter', adapter, config);

      const storedConfig = registry.getAdapterConfig('configured_adapter');
      expect(storedConfig).toEqual(config);
    });

    it('should allow registering multiple adapters', () => {
      const adapter1 = createMockAdapter('adapter1');
      const adapter2 = createMockAdapter('adapter2');
      const adapter3 = createMockAdapter('adapter3');

      registry.registerAdapter('adapter1', adapter1, { type: 'openclaw', host: 'localhost', port: 1, projectRoot: '/test' });
      registry.registerAdapter('adapter2', adapter2, { type: 'claude-code', projectRoot: '/test' });
      registry.registerAdapter('adapter3', adapter3, { type: 'codex', baseUrl: 'http://test', apiKey: 'key' });

      expect(registry.listAdapters()).toHaveLength(3);
    });

    it('should allow overwriting adapters', () => {
      const adapter1 = createMockAdapter('overwrite');
      const adapter2 = createMockAdapter('overwrite2');

      registry.registerAdapter('overwrite', adapter1, { type: 'openclaw', host: 'localhost', port: 1, projectRoot: '/test' });
      registry.registerAdapter('overwrite', adapter2, { type: 'openclaw', host: 'localhost', port: 2, projectRoot: '/test' });

      expect(registry.getAdapter('overwrite')).toBe(adapter2);
    });
  });

  describe('getAdapter()', () => {
    it('should return adapter when found', () => {
      const adapter = createMockAdapter('find_me');
      registry.registerAdapter('find_me', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      const found = registry.getAdapter('find_me');
      expect(found).toBe(adapter);
    });

    it('should return undefined when adapter not found', () => {
      const found = registry.getAdapter('nonexistent');
      expect(found).toBeUndefined();
    });

    it('should return undefined after adapter is unregistered', async () => {
      const adapter = createMockAdapter('temporary_adapter');
      registry.registerAdapter('temporary_adapter', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      await registry.unregisterAdapter('temporary_adapter');

      const found = registry.getAdapter('temporary_adapter');
      expect(found).toBeUndefined();
    });
  });

  describe('hasAdapter()', () => {
    it('should return true for registered adapter', () => {
      const adapter = createMockAdapter('adapter_exists');
      registry.registerAdapter('adapter_exists', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      expect(registry.hasAdapter('adapter_exists')).toBe(true);
    });

    it('should return false for unregistered adapter', () => {
      expect(registry.hasAdapter('nonexistent_adapter')).toBe(false);
    });

    it('should return false after unregister', async () => {
      const adapter = createMockAdapter('was_here_adapter');
      registry.registerAdapter('was_here_adapter', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      await registry.unregisterAdapter('was_here_adapter');

      expect(registry.hasAdapter('was_here_adapter')).toBe(false);
    });
  });

  describe('unregisterAdapter()', () => {
    it('should remove adapter from registry', async () => {
      const adapter = createMockAdapter('removable_adapter');
      registry.registerAdapter('removable_adapter', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      await registry.unregisterAdapter('removable_adapter');

      expect(registry.getAdapter('removable_adapter')).toBeUndefined();
      expect(registry.listAdapters()).not.toContain('removable_adapter');
    });

    it('should disconnect adapter before removing', async () => {
      const adapter = createMockAdapter('disconnect_test');
      registry.registerAdapter('disconnect_test', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      await registry.unregisterAdapter('disconnect_test');

      expect(adapter.disconnect).toHaveBeenCalled();
    });

    it('should remove adapter configuration', async () => {
      const adapter = createMockAdapter('config_test');
      registry.registerAdapter('config_test', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      await registry.unregisterAdapter('config_test');

      expect(registry.getAdapterConfig('config_test')).toBeUndefined();
    });

    it('should not throw when unregistering nonexistent adapter', async () => {
      await expect(registry.unregisterAdapter('nonexistent')).resolves.not.toThrow();
    });

    it('should handle adapter disconnect errors gracefully', async () => {
      const adapter = createMockAdapter('failing_disconnect');
      (adapter.disconnect as jest.Mock).mockRejectedValue(new Error('Disconnect failed'));
      registry.registerAdapter('failing_disconnect', adapter, { type: 'openclaw', host: 'localhost', port: 8080, projectRoot: '/test' });

      await expect(registry.unregisterAdapter('failing_disconnect')).resolves.not.toThrow();
      expect(registry.getAdapter('failing_disconnect')).toBeUndefined();
    });
  });

  describe('listAdapters()', () => {
    it('should return all registered adapter names', () => {
      const adapter1 = createMockAdapter('first_adapter');
      const adapter2 = createMockAdapter('second_adapter');

      registry.registerAdapter('first_adapter', adapter1, { type: 'openclaw', host: 'localhost', port: 1, projectRoot: '/test' });
      registry.registerAdapter('second_adapter', adapter2, { type: 'openclaw', host: 'localhost', port: 2, projectRoot: '/test' });

      const list = registry.listAdapters();
      expect(list).toHaveLength(2);
      expect(list).toContain('first_adapter');
      expect(list).toContain('second_adapter');
    });

    it('should return empty array when no adapters registered', () => {
      const list = registry.listAdapters();
      expect(list).toHaveLength(0);
    });
  });

  describe('getAdapterConfig()', () => {
    it('should return adapter configuration when found', () => {
      const adapter = createMockAdapter('config_adapter');
      const config = { type: 'openclaw' as const, host: 'config.example.com', port: 1234, projectRoot: '/config_test' };

      registry.registerAdapter('config_adapter', adapter, config);

      const storedConfig = registry.getAdapterConfig('config_adapter');
      expect(storedConfig).toEqual(config);
    });

    it('should return undefined when adapter not found', () => {
      const config = registry.getAdapterConfig('nonexistent');
      expect(config).toBeUndefined();
    });

    it('should return undefined after adapter is unregistered', async () => {
      const adapter = createMockAdapter('temp_config');
      const config = { type: 'openclaw' as const, host: 'localhost', port: 8080, projectRoot: '/test' };

      registry.registerAdapter('temp_config', adapter, config);
      await registry.unregisterAdapter('temp_config');

      expect(registry.getAdapterConfig('temp_config')).toBeUndefined();
    });
  });

  describe('getStats()', () => {
    it('should return correct total skill count', () => {
      registry.register(createMockSkill('stat1'));
      registry.register(createMockSkill('stat2'));
      registry.register(createMockSkill('stat3'));

      const stats = registry.getStats();
      expect(stats.total).toBe(3);
    });

    it('should return skills count by category', () => {
      registry.register(createMockSkill('req1', 'requirements'));
      registry.register(createMockSkill('req2', 'requirements'));
      registry.register(createMockSkill('dev1', 'development'));
      registry.register(createMockSkill('test1', 'testing'));

      const stats = registry.getStats();
      expect(stats.byCategory['requirements']).toBe(2);
      expect(stats.byCategory['development']).toBe(1);
      expect(stats.byCategory['testing']).toBe(1);
    });

    it('should return correct adapter statistics', () => {
      registry.registerAdapter('ocl1', createMockAdapter('ocl1', 'openclaw'), { type: 'openclaw', host: 'localhost', port: 1, projectRoot: '/test' });
      registry.registerAdapter('ocl2', createMockAdapter('ocl2', 'openclaw'), { type: 'openclaw', host: 'localhost', port: 2, projectRoot: '/test' });
      registry.registerAdapter('cc1', createMockAdapter('cc1', 'claude-code'), { type: 'claude-code', projectRoot: '/test' });

      const stats = registry.getStats();
      expect(stats.adapters.total).toBe(3);
      expect(stats.adapters.bySource['openclaw']).toBe(2);
      expect(stats.adapters.bySource['claude-code']).toBe(1);
    });

    it('should return empty stats when registry is empty', () => {
      const stats = registry.getStats();
      expect(stats.total).toBe(0);
      expect(stats.byCategory).toEqual({});
      expect(stats.adapters.total).toBe(0);
      expect(stats.adapters.bySource).toEqual({});
    });
  });
});

describe('createSkillsRegistry', () => {
  it('should create a new SkillsRegistry instance', () => {
    const registry = createSkillsRegistry();
    expect(registry).toBeInstanceOf(SkillsRegistry);
  });

  it('should apply custom config', () => {
    const registry = createSkillsRegistry({ allowOverwrite: true, enableLogging: false });
    // Test that allowOverwrite works
    const skill1 = createMockSkill('test');
    const skill2 = createMockSkill('test');
    registry.register(skill1);
    expect(() => registry.register(skill2)).not.toThrow();
  });
});

describe('getGlobalSkillsRegistry', () => {
  afterEach(() => {
    resetGlobalSkillsRegistry();
  });

  it('should create global registry on first call', () => {
    const registry1 = getGlobalSkillsRegistry();
    expect(registry1).toBeInstanceOf(SkillsRegistry);
  });

  it('should return same instance on subsequent calls', () => {
    const registry1 = getGlobalSkillsRegistry();
    const registry2 = getGlobalSkillsRegistry();
    expect(registry1).toBe(registry2);
  });

  it('should reset global registry when resetGlobalSkillsRegistry is called', () => {
    const registry1 = getGlobalSkillsRegistry();
    resetGlobalSkillsRegistry();
    const registry2 = getGlobalSkillsRegistry();
    expect(registry1).not.toBe(registry2);
  });
});
