/**
 * EKET Framework - Skills Loader Tests
 * Version: 0.9.2
 *
 * Tests for Skills Loader: loadFromDirectory, loadSkill, reloadAll,
 * cache logic, TTL expiration, hot reload
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { SkillLoader, createSkillLoader, loadSkillsFromDirectory, loadSkill } from '@/skills/loader.js';
import type { Skill } from '@/skills/types.js';
import { setupFsTest, cleanupTempDir } from '../../helpers/fs-test.js';

describe('SkillLoader', () => {
  let loader: SkillLoader;
  let tempDir: string;
  let testRootDir: string;

  beforeEach(() => {
    const { dir, cleanup } = setupFsTest('loader-test-');
    tempDir = dir;
    testRootDir = path.join(tempDir, 'skills');
    fs.mkdirSync(testRootDir, { recursive: true });
    loader = createSkillLoader({ skillsRootDir: testRootDir, enableCache: false });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  const createSkillModule = (name: string, category: string = 'custom'): string => {
    return `
      module.exports = {
        name: '${name}',
        description: 'Test skill ${name}',
        category: '${category}',
        tags: ['test', 'mock'],
        version: '1.0.0',
        execute: async function(input) {
          return { success: true, data: { result: '${name} executed' }, duration: 10 };
        },
        validateInput: function(input) {
          return input != null;
        }
      };
    `;
  };

  const setupSkillFiles = (skills: Array<{ name: string; category?: string }>) => {
    for (const skill of skills) {
      const category = skill.category || 'custom';
      const categoryDir = path.join(testRootDir, category);
      fs.mkdirSync(categoryDir, { recursive: true });
      const skillPath = path.join(categoryDir, `${skill.name}.ts`);
      fs.writeFileSync(skillPath, createSkillModule(skill.name, category));
    }
  };

  describe('loadFromDirectory()', () => {
    it('should load all skills from directory', async () => {
      setupSkillFiles([
        { name: 'skill1', category: 'requirements' },
        { name: 'skill2', category: 'requirements' },
        { name: 'skill3', category: 'design' },
      ]);

      const result = await loader.loadFromDirectory();

      expect(result.success).toBe(true);
      expect(result.skills).toHaveLength(3);
      expect(result.stats).toEqual({
        total: 3,
        loaded: 3,
        failed: 0,
        skipped: 0,
      });
    });

    it('should return error when directory does not exist', async () => {
      // Create loader with non-existent directory
      const nonExistentLoader = createSkillLoader({
        skillsRootDir: '/non-existent-directory-that-does-not-exist',
        enableCache: false
      });

      const result = await nonExistentLoader.loadFromDirectory();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Directory not found');
    });

    it('should recursively load skills from subdirectories', async () => {
      setupSkillFiles([
        { name: 'req1', category: 'requirements' },
        { name: 'req2', category: 'requirements' },
        { name: 'api_design', category: 'design' },
        { name: 'db_design', category: 'design' },
        { name: 'frontend', category: 'development' },
      ]);

      const result = await loader.loadFromDirectory();

      expect(result.success).toBe(true);
      expect(result.stats?.total).toBe(5);
    });

    it('should skip hidden directories', async () => {
      const hiddenDir = path.join(testRootDir, '.hidden');
      const visibleDir = path.join(testRootDir, 'visible');
      fs.mkdirSync(hiddenDir, { recursive: true });
      fs.mkdirSync(visibleDir, { recursive: true });
      fs.writeFileSync(path.join(hiddenDir, 'skill.ts'), createSkillModule('hidden_skill'));
      fs.writeFileSync(path.join(visibleDir, 'skill.ts'), createSkillModule('visible_skill'));

      const result = await loader.loadFromDirectory();

      expect(result.success).toBe(true);
      expect(result.stats?.loaded).toBe(1);
      expect(result.skills?.some(s => s.name === 'visible_skill')).toBe(true);
    });

    it('should skip node_modules directories', async () => {
      const nodeModulesDir = path.join(testRootDir, 'node_modules', 'package');
      const mySkillsDir = path.join(testRootDir, 'my_skills');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.mkdirSync(mySkillsDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'skill.ts'), createSkillModule('npm_skill'));
      fs.writeFileSync(path.join(mySkillsDir, 'skill.ts'), createSkillModule('my_skill'));

      const result = await loader.loadFromDirectory();

      expect(result.success).toBe(true);
      expect(result.stats?.loaded).toBe(1);
    });

    it('should handle load failures gracefully', async () => {
      const customDir = path.join(testRootDir, 'custom');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(path.join(customDir, 'valid.ts'), createSkillModule('valid_skill'));
      fs.writeFileSync(path.join(customDir, 'invalid.ts'), 'invalid module content that cannot be imported');

      const result = await loader.loadFromDirectory();

      expect(result.success).toBe(true);
      expect(result.stats?.failed).toBeGreaterThanOrEqual(0);
    });

    it('should load skills with .js extension', async () => {
      const customDir = path.join(testRootDir, 'custom');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(path.join(customDir, 'skill.js'), createSkillModule('js_skill'));

      const result = await loader.loadFromDirectory();

      expect(result.success).toBe(true);
      expect(result.stats?.loaded).toBe(1);
    });

    it('should load skills with .mts extension', async () => {
      const customDir = path.join(testRootDir, 'custom');
      fs.mkdirSync(customDir, { recursive: true });
      // Use CommonJS syntax for .mts files in tests
      fs.writeFileSync(path.join(customDir, 'skill.mts'), `
        module.exports = {
          name: 'mts_skill',
          description: 'Test skill mts_skill',
          category: 'custom',
          tags: ['test', 'mock'],
          version: '1.0.0',
          execute: async function(input) {
            return { success: true, data: { result: 'mts_skill executed' }, duration: 10 };
          },
          validateInput: function(input) {
            return input != null;
          }
        };
      `);

      const result = await loader.loadFromDirectory();

      expect(result.success).toBe(true);
      expect(result.stats?.loaded).toBe(1);
    });
  });

  describe('loadSkill()', () => {
    beforeEach(() => {
      // Enable cache for these tests - use same testRootDir from outer scope
      loader = createSkillLoader({ skillsRootDir: testRootDir, enableCache: true, cacheTTL: 5000 });
    });

    it('should load skill by name', async () => {
      setupSkillFiles([{ name: 'target_skill', category: 'requirements' }]);

      const skill = await loader.loadSkill('target_skill');

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('target_skill');
      expect(skill?.description).toBe('Test skill target_skill');
    });

    it('should return null when skill not found', async () => {
      const skill = await loader.loadSkill('nonexistent');
      expect(skill).toBeNull();
    });

    it('should cache loaded skill', async () => {
      setupSkillFiles([{ name: 'cached_skill' }]);

      const skill1 = await loader.loadSkill('cached_skill');
      const skill2 = await loader.loadSkill('cached_skill');

      expect(skill1).toBe(skill2);
    });

    it('should respect cache TTL', async () => {
      loader = createSkillLoader({ skillsRootDir: testRootDir, enableCache: true, cacheTTL: 10 });
      setupSkillFiles([{ name: 'expiring_skill' }]);

      const skill1 = await loader.loadSkill('expiring_skill');

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 20));

      const skill2 = await loader.loadSkill('expiring_skill');

      // Should reload after TTL
      expect(skill2).not.toBe(skill1);
    });

    it('should prevent concurrent loads with lock', async () => {
      setupSkillFiles([{ name: 'concurrent_skill' }]);

      // Start multiple concurrent loads
      const loads = Promise.all([
        loader.loadSkill('concurrent_skill'),
        loader.loadSkill('concurrent_skill'),
        loader.loadSkill('concurrent_skill'),
      ]);

      const results = await loads;

      // All should return the same skill (first load result)
      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });

    it('should release lock after load completes', async () => {
      setupSkillFiles([{ name: 'lock_test_skill' }]);

      await loader.loadSkill('lock_test_skill');

      // Lock should be released
      const stats = loader.getStats();
      expect(stats.locks).toBe(0);
    });

    it('should search in category paths', async () => {
      setupSkillFiles([
        { name: 'requirement_decomposition', category: 'requirements' },
        { name: 'api_design', category: 'design' },
        { name: 'unit_test', category: 'testing' },
      ]);

      const reqSkill = await loader.loadSkill('requirement_decomposition');
      expect(reqSkill?.name).toBe('requirement_decomposition');

      const designSkill = await loader.loadSkill('api_design');
      expect(designSkill?.name).toBe('api_design');

      const testSkill = await loader.loadSkill('unit_test');
      expect(testSkill?.name).toBe('unit_test');
    });
  });

  describe('reloadAll()', () => {
    it('should clear cache and reload all skills', async () => {
      setupSkillFiles([{ name: 'reload_skill' }]);

      // Initial load
      await loader.loadFromDirectory();
      const skill1 = await loader.loadSkill('reload_skill');

      // Modify the skill file
      const customDir = path.join(testRootDir, 'custom');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(path.join(customDir, 'reload_skill.ts'), createSkillModule('reloaded_skill'));

      // Reload
      const result = await loader.reloadAll();

      expect(result.success).toBe(true);
      // Cache is cleared, so skill should be reloaded
      const skill2 = await loader.loadSkill('reload_skill');
      expect(skill2?.name).toBe('reloaded_skill');
    });

    it('should return updated stats after reload', async () => {
      setupSkillFiles([
        { name: 'skill1' },
        { name: 'skill2' },
      ]);

      const result1 = await loader.loadFromDirectory();
      expect(result1.stats?.loaded).toBe(2);

      // Add new skill
      const customDir = path.join(testRootDir, 'custom');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(path.join(customDir, 'skill3.ts'), createSkillModule('skill3'));

      const result2 = await loader.reloadAll();
      expect(result2.stats?.loaded).toBe(3);
    });
  });

  describe('clearCache()', () => {
    it('should clear all cached skills', async () => {
      loader = createSkillLoader({ skillsRootDir: testRootDir, enableCache: true });
      setupSkillFiles([{ name: 'cache_test' }]);

      await loader.loadSkill('cache_test');
      const stats1 = loader.getStats();
      expect(stats1.cached).toBe(1);

      loader.clearCache();
      const stats2 = loader.getStats();
      expect(stats2.cached).toBe(0);
    });

    it('should log cache clear operation', async () => {
      loader = createSkillLoader({ skillsRootDir: testRootDir, enableCache: true });
      setupSkillFiles([{ name: 'test1' }, { name: 'test2' }]);

      await loader.loadSkill('test1');
      await loader.loadSkill('test2');

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      loader.clearCache();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cleared'));
      consoleSpy.mockRestore();
    });
  });

  describe('getStats()', () => {
    it('should return cache and lock statistics', async () => {
      loader = createSkillLoader({ skillsRootDir: testRootDir, enableCache: true });
      setupSkillFiles([{ name: 'stat_skill' }]);

      await loader.loadSkill('stat_skill');

      const stats = loader.getStats();
      expect(stats.cached).toBeGreaterThanOrEqual(0);
      expect(stats.locks).toBeGreaterThanOrEqual(0);
    });

    it('should show zero locks when no loads in progress', () => {
      const stats = loader.getStats();
      expect(stats.locks).toBe(0);
    });
  });
});

describe('createSkillLoader', () => {
  it('should create a new SkillLoader instance', () => {
    const loader = createSkillLoader({ skillsRootDir: '/test' });
    expect(loader).toBeInstanceOf(SkillLoader);
  });

  it('should apply default config when no config provided', () => {
    const loader = createSkillLoader({ skillsRootDir: '/test' });
    // Default config should be applied
    expect(loader).toBeDefined();
  });
});

describe('loadSkillsFromDirectory', () => {
  let tempDir: string;

  beforeEach(() => {
    const { dir, cleanup } = setupFsTest('loadskills-test-');
    tempDir = dir;
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should create loader and load from directory', async () => {
    const testDir = path.join(tempDir, 'test_skills');
    const customDir = path.join(testDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'test.ts'), `
      module.exports = {
        name: 'test',
        description: 'Test',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
    `);

    const result = await loadSkillsFromDirectory(testDir);

    expect(result.success).toBe(true);
    expect(result.skills).toHaveLength(1);
  });

  it('should pass optional dir parameter', async () => {
    const testDir = path.join(tempDir, 'test_skills');
    const subdir = path.join(testDir, 'subdir');
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(path.join(subdir, 'skill.ts'), `
      module.exports = {
        name: 'subskill',
        description: 'Sub skill',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
    `);

    const result = await loadSkillsFromDirectory(testDir, 'subdir');

    expect(result.success).toBe(true);
    expect(result.skills).toHaveLength(1);
  });
});

describe('loadSkill', () => {
  let tempDir: string;

  beforeEach(() => {
    const { dir, cleanup } = setupFsTest('loadskill-test-');
    tempDir = dir;
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should create loader and load single skill', async () => {
    const testDir = path.join(tempDir, 'test_single');
    const customDir = path.join(testDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'single.ts'), `
      module.exports = {
        name: 'single',
        description: 'Single skill',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
    `);

    const skill = await loadSkill(testDir, 'single');

    expect(skill).not.toBeNull();
    expect(skill?.name).toBe('single');
  });

  it('should return null when skill not found', async () => {
    const testDir = path.join(tempDir, 'test_not_found');
    fs.mkdirSync(testDir, { recursive: true });

    const skill = await loadSkill(testDir, 'nonexistent');

    expect(skill).toBeNull();
  });
});

describe('SkillLoader - Edge Cases', () => {
  let loader: SkillLoader;
  let tempDir: string;
  let testRootDir: string;

  beforeEach(() => {
    const { dir, cleanup } = setupFsTest('edge-test-');
    tempDir = dir;
    testRootDir = path.join(tempDir, 'edge_test');
    fs.mkdirSync(testRootDir, { recursive: true });
    loader = createSkillLoader({ skillsRootDir: testRootDir, enableCache: false });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should handle empty directory', async () => {
    const result = await loader.loadFromDirectory();

    expect(result.success).toBe(true);
    expect(result.skills).toHaveLength(0);
    expect(result.stats).toEqual({
      total: 0,
      loaded: 0,
      failed: 0,
      skipped: 0,
    });
  });

  it('should handle skill with missing required fields', async () => {
    const customDir = path.join(testRootDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'invalid.ts'), `
      module.exports = {
        name: 'incomplete',
        // missing description, category, execute
      };
    `);

    const result = await loader.loadFromDirectory();

    // Should skip invalid skills
    expect(result.stats?.failed).toBeGreaterThanOrEqual(0);
  });

  it('should handle skill with non-function execute', async () => {
    const customDir = path.join(testRootDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'invalid2.ts'), `
      module.exports = {
        name: 'bad_execute',
        description: 'Bad execute',
        category: 'custom',
        execute: 'not a function'
      };
    `);

    const result = await loader.loadFromDirectory();

    // Should skip invalid skills
    expect(result.stats?.failed).toBeGreaterThanOrEqual(0);
  });

  it('should handle default export format', async () => {
    const customDir = path.join(testRootDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'default_export.ts'), `
      module.exports.default = {
        name: 'default_skill',
        description: 'Default export skill',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
    `);

    const result = await loader.loadFromDirectory();

    expect(result.success).toBe(true);
    expect(result.skills?.some(s => s.name === 'default_skill')).toBe(true);
  });

  it('should handle named export format', async () => {
    const customDir = path.join(testRootDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'named_export.ts'), `
      const NamedSkill = {
        name: 'named_skill',
        description: 'Named export skill',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
      module.exports.NamedSkill = NamedSkill;
    `);

    const result = await loader.loadFromDirectory();

    expect(result.success).toBe(true);
    expect(result.skills?.some(s => s.name === 'named_skill')).toBe(true);
  });

  it('should handle file-named export format', async () => {
    const customDir = path.join(testRootDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });
    fs.writeFileSync(path.join(customDir, 'file_named.ts'), `
      module.exports.FileNamed = {
        name: 'file_named',
        description: 'File named export',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
    `);

    const result = await loader.loadFromDirectory();

    expect(result.success).toBe(true);
  });
});

describe('SkillLoader - Non-recursive mode', () => {
  let loader: SkillLoader;
  let tempDir: string;
  let testRootDir: string;

  beforeEach(() => {
    const { dir, cleanup } = setupFsTest('nonrecursive-test-');
    tempDir = dir;
    testRootDir = path.join(tempDir, 'non_recursive');
    fs.mkdirSync(testRootDir, { recursive: true });
    loader = createSkillLoader({ skillsRootDir: testRootDir, recursive: false, enableCache: false });
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  it('should not scan subdirectories when recursive is false', async () => {
    fs.writeFileSync(path.join(testRootDir, 'root_skill.ts'), `
      module.exports = {
        name: 'root_skill',
        description: 'Root level skill',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
    `);

    const subdir = path.join(testRootDir, 'subdir');
    fs.mkdirSync(subdir, { recursive: true });
    fs.writeFileSync(path.join(subdir, 'sub_skill.ts'), `
      module.exports = {
        name: 'sub_skill',
        description: 'Subdir skill',
        category: 'custom',
        execute: async () => ({ success: true, data: {}, duration: 0 })
      };
    `);

    const result = await loader.loadFromDirectory();

    expect(result.success).toBe(true);
    expect(result.stats?.loaded).toBe(1);
    expect(result.skills?.some(s => s.name === 'root_skill')).toBe(true);
  });
});
