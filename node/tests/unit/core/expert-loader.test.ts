/**
 * ExpertLoader Unit Tests
 * TASK-Z05: core/ module unit testing
 *
 * Covers:
 * - Expert ID management
 * - Profile loading
 * - Ticket parsing
 * - Section formatting
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
  getAllExpertIds,
  getDefaultExpertIds,
  getExpertFilePath,
  loadExpertProfiles,
  parseAssignedExperts,
  formatExpertSection,
  type LoadedExperts,
} from '../../../src/core/expert-loader.js';

describe('ExpertLoader', () => {
  describe('getAllExpertIds', () => {
    it('should return array of expert IDs', () => {
      const ids = getAllExpertIds();

      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('should include default experts', () => {
      const ids = getAllExpertIds();

      expect(ids).toContain('architect');
      expect(ids).toContain('backend');
      expect(ids).toContain('frontend');
      expect(ids).toContain('tester');
    });

    it('should include optional experts', () => {
      const ids = getAllExpertIds();

      expect(ids).toContain('security');
      expect(ids).toContain('devops');
      expect(ids).toContain('aiml');
    });

    it('should have more than 50 total experts', () => {
      const ids = getAllExpertIds();
      // 7 default + 53 optional = 60
      expect(ids.length).toBeGreaterThanOrEqual(60);
    });
  });

  describe('getDefaultExpertIds', () => {
    it('should return exactly 7 default experts', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults.length).toBe(7);
    });

    it('should include architect', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults).toContain('architect');
    });

    it('should include backend', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults).toContain('backend');
    });

    it('should include frontend', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults).toContain('frontend');
    });

    it('should include fullstack', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults).toContain('fullstack');
    });

    it('should include tester', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults).toContain('tester');
    });

    it('should include ux', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults).toContain('ux');
    });

    it('should include product', () => {
      const defaults = getDefaultExpertIds();
      expect(defaults).toContain('product');
    });
  });

  describe('getExpertFilePath', () => {
    it('should return path for valid expert ID', () => {
      const filePath = getExpertFilePath('architect');

      expect(filePath).not.toBeNull();
      expect(filePath).toContain('architect.md');
    });

    it('should return default tier path for default experts', () => {
      const filePath = getExpertFilePath('backend');

      expect(filePath).toContain('default');
      expect(filePath).toContain('backend.md');
    });

    it('should return optional tier path for optional experts', () => {
      const filePath = getExpertFilePath('security');

      expect(filePath).toContain('optional');
      expect(filePath).toContain('security.md');
    });

    it('should include correct domain for optional experts', () => {
      const aimlPath = getExpertFilePath('aiml');
      expect(aimlPath).toContain(path.join('optional', 'ai', 'aiml.md'));

      const devopsPath = getExpertFilePath('devops');
      expect(devopsPath).toContain(path.join('optional', 'tech', 'devops.md'));
    });

    it('should return null for unknown expert ID', () => {
      const filePath = getExpertFilePath('unknown-expert-xyz');
      expect(filePath).toBeNull();
    });

    it('should use home directory base path', () => {
      const filePath = getExpertFilePath('architect');
      expect(filePath).toContain(os.homedir());
    });
  });

  describe('loadExpertProfiles', () => {
    it('should return empty profiles for empty input', () => {
      const result = loadExpertProfiles([]);

      expect(result.profiles).toEqual([]);
      expect(result.missing).toEqual([]);
    });

    it('should mark unavailable experts', () => {
      const result = loadExpertProfiles(['nonexistent-expert-xyz']);

      expect(result.profiles.length).toBe(1);
      expect(result.profiles[0].available).toBe(false);
      expect(result.profiles[0].content).toBe('');
      expect(result.missing).toContain('nonexistent-expert-xyz');
    });

    it('should return profile with id for unavailable expert', () => {
      const result = loadExpertProfiles(['fake-expert']);

      expect(result.profiles[0].id).toBe('fake-expert');
    });

    it('should handle mixed available/unavailable experts', () => {
      // Create a temp expert file for testing
      const tempDir = path.join(os.tmpdir(), 'eket-expert-test');
      fs.mkdirSync(tempDir, { recursive: true });

      // This test just verifies the structure when files don't exist
      const result = loadExpertProfiles(['architect', 'totally-fake']);

      expect(result.profiles.length).toBe(2);
      expect(result.profiles.find((p) => p.id === 'totally-fake')?.available).toBe(false);
    });

    it('should preserve expert ID in profile', () => {
      const result = loadExpertProfiles(['architect', 'backend']);

      expect(result.profiles.find((p) => p.id === 'architect')).toBeDefined();
      expect(result.profiles.find((p) => p.id === 'backend')).toBeDefined();
    });
  });

  describe('parseAssignedExperts', () => {
    it('should parse comma-separated expert list', () => {
      const content = `
# Ticket
**assigned_experts**: architect, backend, security
`;
      const result = parseAssignedExperts(content);

      expect(result).toEqual(['architect', 'backend', 'security']);
    });

    it('should handle colon format', () => {
      const content = `assigned_experts: frontend, ux`;
      const result = parseAssignedExperts(content);

      expect(result).toEqual(['frontend', 'ux']);
    });

    it('should strip backticks from expert names', () => {
      const content = `assigned_experts: \`architect\`, \`backend\``;
      const result = parseAssignedExperts(content);

      expect(result).toEqual(['architect', 'backend']);
    });

    it('should return empty array when no experts assigned', () => {
      const content = `# Ticket with no experts`;
      const result = parseAssignedExperts(content);

      expect(result).toEqual([]);
    });

    it('should filter out "none" and "-"', () => {
      const content = `assigned_experts: none, -, architect`;
      const result = parseAssignedExperts(content);

      expect(result).toEqual(['architect']);
    });

    it('should filter out Chinese "wu" (none)', () => {
      const content = `assigned_experts: 无, backend`;
      const result = parseAssignedExperts(content);

      expect(result).toEqual(['backend']);
    });

    it('should handle whitespace variations', () => {
      const content = `assigned_experts:   architect  ,  backend  ,   frontend`;
      const result = parseAssignedExperts(content);

      expect(result).toEqual(['architect', 'backend', 'frontend']);
    });

    it('should handle markdown bold format', () => {
      const content = `**assigned_experts**: devops, sre`;
      const result = parseAssignedExperts(content);

      expect(result).toEqual(['devops', 'sre']);
    });
  });

  describe('formatExpertSection', () => {
    it('should return empty string for empty profiles', () => {
      const loaded: LoadedExperts = { profiles: [], missing: [] };
      const result = formatExpertSection(loaded);

      expect(result).toBe('');
    });

    it('should show warning when no available profiles', () => {
      const loaded: LoadedExperts = {
        profiles: [{ id: 'fake', available: false, content: '' }],
        missing: ['fake'],
      };
      const result = formatExpertSection(loaded);

      expect(result).toContain('无可用专家');
    });

    it('should list missing experts with install command', () => {
      const loaded: LoadedExperts = {
        profiles: [{ id: 'fake-expert', available: false, content: '' }],
        missing: ['fake-expert'],
      };
      const result = formatExpertSection(loaded);

      expect(result).toContain('fake-expert');
      expect(result).toContain('install-extended.sh');
    });

    it('should include section header', () => {
      const loaded: LoadedExperts = {
        profiles: [
          {
            id: 'architect',
            available: true,
            content: '# Architect\nrole: System Architect',
            role: 'System Architect',
          },
        ],
        missing: [],
      };
      const result = formatExpertSection(loaded);

      expect(result).toContain('## 专家团队');
      expect(result).toContain('Assigned Experts');
    });

    it('should format available expert with details tag', () => {
      const loaded: LoadedExperts = {
        profiles: [
          {
            id: 'backend',
            name: 'Backend Dev',
            name_cn: '后端工程师',
            role: 'Backend Developer',
            emoji: '🔧',
            available: true,
            content: '# Backend\nrole: Backend Developer\n\nExpert in server-side development.',
          },
        ],
        missing: [],
      };
      const result = formatExpertSection(loaded);

      expect(result).toContain('🔧');
      expect(result).toContain('后端工程师');
      expect(result).toContain('<details>');
      expect(result).toContain('展开 profile');
    });

    it('should use default emoji when none provided', () => {
      const loaded: LoadedExperts = {
        profiles: [
          {
            id: 'tester',
            available: true,
            content: '# Tester',
          },
        ],
        missing: [],
      };
      const result = formatExpertSection(loaded);

      expect(result).toContain('👤'); // default emoji
    });

    it('should handle mixed available and missing experts', () => {
      const loaded: LoadedExperts = {
        profiles: [
          { id: 'architect', available: true, content: '# Architect' },
          { id: 'fake', available: false, content: '' },
        ],
        missing: ['fake'],
      };
      const result = formatExpertSection(loaded);

      expect(result).toContain('architect');
      expect(result).toContain('未找到');
      expect(result).toContain('fake');
    });
  });
});
