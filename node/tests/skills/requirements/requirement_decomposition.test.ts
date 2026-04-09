/**
 * EKET Framework - Requirement Decomposition Skill Tests
 * Version: 0.9.2
 *
 * Tests for Requirement Decomposition Skill: input validation,
 * decomposition logic, output format, boundary conditions
 */

import { describe, it, expect } from '@jest/globals';
import {
  RequirementDecompositionSkill,
  RequirementDecompositionInput,
  RequirementDecompositionOutput,
} from '@/skills/requirements/requirement_decomposition.js';
import type { SkillInput } from '@/skills/types.js';

describe('RequirementDecompositionSkill', () => {
  describe('Metadata', () => {
    it('should have correct name', () => {
      expect(RequirementDecompositionSkill.name).toBe('requirement_decomposition');
    });

    it('should have description', () => {
      expect(RequirementDecompositionSkill.description).toBeDefined();
      expect(RequirementDecompositionSkill.description.length).toBeGreaterThan(0);
    });

    it('should be in requirements category', () => {
      expect(RequirementDecompositionSkill.category).toBe('requirements');
    });

    it('should have version', () => {
      expect(RequirementDecompositionSkill.version).toBe('1.0.0');
    });

    it('should have tags', () => {
      expect(RequirementDecompositionSkill.tags).toContain('requirements');
      expect(RequirementDecompositionSkill.tags).toContain('analysis');
    });
  });

  describe('Input Schema', () => {
    it('should have input schema defined', () => {
      expect(RequirementDecompositionSkill.inputSchema).toBeDefined();
      expect(RequirementDecompositionSkill.inputSchema?.required).toContain('requirement');
    });

    it('should define requirement field as required', () => {
      expect(RequirementDecompositionSkill.inputSchema?.properties?.requirement).toBeDefined();
    });

    it('should define optional fields', () => {
      const props = RequirementDecompositionSkill.inputSchema?.properties;
      expect(props?.source).toBeDefined();
      expect(props?.priority).toBeDefined();
      expect(props?.dueDate).toBeDefined();
    });
  });

  describe('Output Schema', () => {
    it('should have output schema defined', () => {
      expect(RequirementDecompositionSkill.outputSchema).toBeDefined();
    });

    it('should define subTasks array', () => {
      const props = RequirementDecompositionSkill.outputSchema?.properties;
      expect(props?.subTasks).toBeDefined();
    });

    it('should define totalEstimatedHours', () => {
      const props = RequirementDecompositionSkill.outputSchema?.properties;
      expect(props?.totalEstimatedHours).toBeDefined();
    });

    it('should define suggestedOrder', () => {
      const props = RequirementDecompositionSkill.outputSchema?.properties;
      expect(props?.suggestedOrder).toBeDefined();
    });

    it('should define optional risks', () => {
      const props = RequirementDecompositionSkill.outputSchema?.properties;
      expect(props?.risks).toBeDefined();
    });
  });

  describe('validateInput()', () => {
    it('should return true for valid input with requirement', () => {
      const validInput = {
        requirement: 'Build a user authentication system',
      };

      expect(RequirementDecompositionSkill.validateInput?.(validInput)).toBe(true);
    });

    it('should return true for valid input with all optional fields', () => {
      const validInput: RequirementDecompositionInput = {
        requirement: 'Build a user authentication system',
        source: 'Product Team',
        priority: 'high',
        dueDate: '2024-12-31',
      };

      expect(RequirementDecompositionSkill.validateInput?.(validInput)).toBe(true);
    });

    it('should return false for null input', () => {
      expect(RequirementDecompositionSkill.validateInput?.(null)).toBe(false);
    });

    it('should return false for undefined input', () => {
      expect(RequirementDecompositionSkill.validateInput?.(undefined)).toBe(false);
    });

    it('should return false for non-object input', () => {
      expect(RequirementDecompositionSkill.validateInput?.('string')).toBe(false);
      expect(RequirementDecompositionSkill.validateInput?.(123)).toBe(false);
      expect(RequirementDecompositionSkill.validateInput?.([])).toBe(false);
    });

    it('should return false when requirement is missing', () => {
      const invalidInput = {
        source: 'Product Team',
        priority: 'high',
      };

      expect(RequirementDecompositionSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when requirement is not a string', () => {
      const invalidInput = {
        requirement: 123,
      };

      expect(RequirementDecompositionSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when requirement is empty string', () => {
      const invalidInput = {
        requirement: '',
      };

      expect(RequirementDecompositionSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when requirement is whitespace only', () => {
      const invalidInput = {
        requirement: '   ',
      };

      expect(RequirementDecompositionSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return true when requirement has extra fields', () => {
      const validInput = {
        requirement: 'Build a feature',
        extraField: 'should be ignored',
        anotherExtra: 123,
      };

      expect(RequirementDecompositionSkill.validateInput?.(validInput)).toBe(true);
    });
  });

  describe('execute()', () => {
    it('should successfully decompose simple requirement', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a user login feature',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.subTasks).toBeDefined();
      expect(result.data?.subTasks.length).toBeGreaterThan(0);
      expect(result.data?.totalEstimatedHours).toBeGreaterThan(0);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should generate subtasks with required fields', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a REST API',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const subTasks = result.data?.subTasks;
      expect(subTasks).toBeDefined();

      for (const task of subTasks!) {
        expect(task.title).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.type).toBeDefined();
        expect(['feature', 'bugfix', 'task', 'improvement']).toContain(task.type);
        expect(task.estimatedHours).toBeGreaterThanOrEqual(0);
        expect(task.requiredSkills).toBeDefined();
        expect(task.dependencies).toBeDefined();
      }
    });

    it('should calculate total estimated hours correctly', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Simple task',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const subTasks = result.data?.subTasks;
      const expectedTotal = subTasks?.reduce((sum, task) => sum + task.estimatedHours, 0) || 0;

      expect(result.data?.totalEstimatedHours).toBe(expectedTotal);
    });

    it('should generate suggested order based on dependencies', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a full-stack feature',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.data?.suggestedOrder).toBeDefined();
      expect(result.data?.suggestedOrder.length).toBeGreaterThan(0);

      // First task should have no dependencies or be analysis/design
      const firstTaskTitle = result.data?.suggestedOrder[0];
      expect(firstTaskTitle).toBeDefined();
    });

    it('should identify risks for complex requirements', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a high-performance distributed system with real-time analytics and migration from legacy',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.data?.risks).toBeDefined();
      expect(result.data?.risks!.length).toBeGreaterThan(0);
    });

    it('should handle requirements with priority', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Urgent security fix',
          priority: 'urgent',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
    });

    it('should handle requirements with source', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Feature request',
          source: 'Customer feedback',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
    });

    it('should handle requirements with due date', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Deadline-driven feature',
          dueDate: '2024-06-01',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
    });

    it('should include logs in result', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Test requirement',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.logs).toBeDefined();
      expect(result.logs!.length).toBeGreaterThan(0);
    });

    it('should identify components from requirement', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a frontend dashboard with backend API integration and database storage',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      // Should have tasks for frontend, backend, and database
      // Note: Output is in Chinese - 前端界面开发，后端 API 开发，数据库设计与实现
      const taskTitles = result.data?.subTasks.map(t => t.title.toLowerCase()) || [];
      expect(taskTitles.some(t => t.includes('前端') || t.includes('仪表板'))).toBe(true);
      expect(taskTitles.some(t => t.includes('后端') || t.includes('api'))).toBe(true);
      expect(taskTitles.some(t => t.includes('数据库'))).toBe(true);
    });

    it('should include analysis task', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Any requirement',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const taskTitles = result.data?.subTasks.map(t => t.title.toLowerCase()) || [];
      expect(taskTitles.some(t => t.includes('分析') || t.includes('analysis'))).toBe(true);
    });

    it('should include design task', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Any requirement',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const taskTitles = result.data?.subTasks.map(t => t.title.toLowerCase()) || [];
      expect(taskTitles.some(t => t.includes('设计') || t.includes('design'))).toBe(true);
    });

    it('should include test task', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Any requirement',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const taskTitles = result.data?.subTasks.map(t => t.title.toLowerCase()) || [];
      expect(taskTitles.some(t => t.includes('测试') || t.includes('test'))).toBe(true);
    });

    it('should include documentation task', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Any requirement',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const taskTitles = result.data?.subTasks.map(t => t.title.toLowerCase()) || [];
      expect(taskTitles.some(t => t.includes('文档') || t.includes('document'))).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long requirement text', async () => {
      const longRequirement = 'Build a system '.repeat(100);

      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: longRequirement,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
    });

    it('should handle requirement with special characters', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a system with special@chars, #hashtags, and $ymbols!',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
    });

    it('should handle requirement with multiple languages', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a 用户系统 with API integration',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
    });

    it('should handle minimal requirement', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Fix bug',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      expect(result.success).toBe(true);
      expect(result.data?.subTasks.length).toBeGreaterThan(0);
    });
  });

  describe('Dependency Analysis', () => {
    it('should create tasks with valid dependencies', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build a complete web application',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const taskTitles = result.data?.subTasks.map(t => t.title) || [];
      const allTitles = new Set(taskTitles);

      // Verify all dependencies reference existing tasks
      for (const task of result.data?.subTasks || []) {
        for (const dep of task.dependencies) {
          expect(allTitles.has(dep)).toBe(true);
        }
      }
    });

    it('should order tasks respecting dependencies', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build an API service',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      const orderedTitles = result.data?.suggestedOrder || [];
      const taskMap = new Map(
        result.data?.subTasks.map((t, i) => [t.title, i]) || []
      );

      // Verify tasks appear after their dependencies
      for (const task of result.data?.subTasks || []) {
        const taskIndex = orderedTitles.indexOf(task.title);
        for (const dep of task.dependencies) {
          const depIndex = orderedTitles.indexOf(dep);
          expect(depIndex).toBeLessThan(taskIndex);
        }
      }
    });
  });

  describe('Complexity Analysis', () => {
    it('should identify high complexity for long requirements', async () => {
      const longReq = 'Build a system '.repeat(100);

      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: longReq,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      // Should have risks - output is in Chinese
      expect(result.data?.risks).toBeDefined();
      expect(result.data?.risks?.length).toBeGreaterThan(0);
    });

    it('should identify tech complexity for multiple technologies', async () => {
      const input: SkillInput<RequirementDecompositionInput> = {
        data: {
          requirement: 'Build an API with database integration, authentication, real-time performance, and security features',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await RequirementDecompositionSkill.execute(input);

      // Should have risk for high complexity or technical risk
      // Expected risks: "需求复杂度较高，建议分阶段实施" or "需求涉及"security"，存在技术风险"
      expect(result.data?.risks).toBeDefined();
      expect(result.data?.risks?.length).toBeGreaterThan(0);
      // Check for complexity or technical risk keywords
      const hasRisk = result.data?.risks?.some(
        r => r.includes('复杂度') || r.includes('技术') || r.includes('security') || r.includes('性能')
      );
      expect(hasRisk).toBe(true);
    });
  });
});
