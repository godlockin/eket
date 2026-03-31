/**
 * EKET Framework - Frontend Development Skill Tests
 * Version: 0.9.2
 *
 * Tests for Frontend Development Skill: component generation,
 * API integration, test generation
 */

import {
  FrontendDevelopmentSkill,
  FrontendDevelopmentInput,
} from '@/skills/development/frontend_development.js';
import type { SkillInput } from '@/skills/types.js';

describe('FrontendDevelopmentSkill', () => {
  describe('Metadata', () => {
    it('should have correct name', () => {
      expect(FrontendDevelopmentSkill.name).toBe('frontend_development');
    });

    it('should have description', () => {
      expect(FrontendDevelopmentSkill.description).toBeDefined();
      expect(FrontendDevelopmentSkill.description.length).toBeGreaterThan(0);
    });

    it('should be in development category', () => {
      expect(FrontendDevelopmentSkill.category).toBe('development');
    });

    it('should have version', () => {
      expect(FrontendDevelopmentSkill.version).toBe('1.0.0');
    });

    it('should have relevant tags', () => {
      expect(FrontendDevelopmentSkill.tags).toContain('frontend');
      expect(FrontendDevelopmentSkill.tags).toContain('react');
      expect(FrontendDevelopmentSkill.tags).toContain('component');
    });
  });

  describe('Input Schema', () => {
    it('should have input schema defined', () => {
      expect(FrontendDevelopmentSkill.inputSchema).toBeDefined();
      expect(FrontendDevelopmentSkill.inputSchema?.required).toContain('componentName');
    });

    it('should define required fields', () => {
      const props = FrontendDevelopmentSkill.inputSchema?.properties;
      expect(props?.componentName).toBeDefined();
    });

    it('should define optional fields', () => {
      const props = FrontendDevelopmentSkill.inputSchema?.properties;
      expect(props?.componentType).toBeDefined();
      expect(props?.framework).toBeDefined();
      expect(props?.description).toBeDefined();
      expect(props?.props).toBeDefined();
      expect(props?.useState).toBeDefined();
      expect(props?.useStyle).toBeDefined();
      expect(props?.useTest).toBeDefined();
    });
  });

  describe('Output Schema', () => {
    it('should have output schema defined', () => {
      expect(FrontendDevelopmentSkill.outputSchema).toBeDefined();
    });

    it('should define componentCode', () => {
      const props = FrontendDevelopmentSkill.outputSchema?.properties;
      expect(props?.componentCode).toBeDefined();
    });

    it('should define styleCode', () => {
      const props = FrontendDevelopmentSkill.outputSchema?.properties;
      expect(props?.styleCode).toBeDefined();
    });

    it('should define testCode', () => {
      const props = FrontendDevelopmentSkill.outputSchema?.properties;
      expect(props?.testCode).toBeDefined();
    });

    it('should define files array', () => {
      const props = FrontendDevelopmentSkill.outputSchema?.properties;
      expect(props?.files).toBeDefined();
    });

    it('should define dependencies', () => {
      const props = FrontendDevelopmentSkill.outputSchema?.properties;
      expect(props?.dependencies).toBeDefined();
    });

    it('should define usageExample', () => {
      const props = FrontendDevelopmentSkill.outputSchema?.properties;
      expect(props?.usageExample).toBeDefined();
    });
  });

  describe('validateInput()', () => {
    it('should return true for valid input', () => {
      const validInput: FrontendDevelopmentInput = {
        componentName: 'Button',
      };

      expect(FrontendDevelopmentSkill.validateInput?.(validInput)).toBe(true);
    });

    it('should return true with all optional fields', () => {
      const validInput: FrontendDevelopmentInput = {
        componentName: 'Modal',
        componentType: 'functional',
        framework: 'react',
        description: 'A modal dialog',
        useState: true,
        useStyle: true,
        styleType: 'scss',
        useTest: true,
      };

      expect(FrontendDevelopmentSkill.validateInput?.(validInput)).toBe(true);
    });

    it('should return false for null input', () => {
      expect(FrontendDevelopmentSkill.validateInput?.(null)).toBe(false);
    });

    it('should return false for undefined input', () => {
      expect(FrontendDevelopmentSkill.validateInput?.(undefined)).toBe(false);
    });

    it('should return false when componentName is missing', () => {
      const invalidInput = {} as FrontendDevelopmentInput;
      expect(FrontendDevelopmentSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when componentName is not a string', () => {
      const invalidInput = { componentName: 123 } as unknown as FrontendDevelopmentInput;
      expect(FrontendDevelopmentSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when componentName is empty string', () => {
      const invalidInput = { componentName: '' };
      expect(FrontendDevelopmentSkill.validateInput?.(invalidInput)).toBe(false);
    });

    it('should return false when componentName is whitespace only', () => {
      const invalidInput = { componentName: '   ' };
      expect(FrontendDevelopmentSkill.validateInput?.(invalidInput)).toBe(false);
    });
  });

  describe('execute()', () => {
    it('should successfully generate component', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Button',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.componentCode).toBeDefined();
      expect(result.data?.files).toBeDefined();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should generate component code with component name', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Card',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('Card');
    });

    it('should generate TypeScript type definitions', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Table',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.typesCode).toBeDefined();
      expect(result.data?.typesCode).toContain('TableProps');
    });

    it('should generate files array', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Form',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.files).toBeDefined();
      expect(result.data?.files.length).toBeGreaterThan(0);

      for (const file of result.data?.files || []) {
        expect(file.path).toBeDefined();
        expect(file.content).toBeDefined();
        expect(file.description).toBeDefined();
      }
    });

    it('should generate dependencies', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Dropdown',
          framework: 'react',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.dependencies).toBeDefined();
      expect(result.data?.dependencies).toContain('react');
    });

    it('should generate usage example', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Tooltip',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.usageExample).toBeDefined();
      expect(result.data?.usageExample.length).toBeGreaterThan(0);
    });

    it('should include logs in result', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Logger',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.logs).toBeDefined();
      expect(result.logs?.length).toBeGreaterThan(0);
    });
  });

  describe('Framework Support', () => {
    it('should generate React functional component by default', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'ReactComponent',
          framework: 'react',
          componentType: 'functional',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('export function ReactComponent');
      expect(result.data?.componentCode).toContain("from 'react'");
    });

    it('should generate React class component', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'ClassComponent',
          framework: 'react',
          componentType: 'class',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('extends Component');
      expect(result.data?.componentCode).toContain('render()');
    });

    it('should generate Vue component', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'VueComponent',
          framework: 'vue',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('<template>');
      expect(result.data?.componentCode).toContain('<script lang="ts">');
      expect(result.data?.componentCode).toContain('defineComponent');
    });

    it('should generate Vue component with props', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'VueWithProps',
          framework: 'vue',
          props: {
            title: { type: 'string', required: true },
            count: { type: 'number', default: 0 },
          },
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('props:');
      expect(result.data?.componentCode).toContain('title:');
      expect(result.data?.componentCode).toContain('count:');
    });
  });

  describe('State Management', () => {
    it('should include useState for React when enabled', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'StatefulComponent',
          framework: 'react',
          useState: true,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('useState');
      expect(result.data?.componentCode).toContain('const [value, setValue]');
    });

    it('should not include useState when disabled', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'StatelessComponent',
          framework: 'react',
          useState: false,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).not.toContain('useState');
    });

    it('should include ref for Vue when useState is enabled', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'VueStateful',
          framework: 'vue',
          useState: true,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('ref');
      expect(result.data?.componentCode).toContain('const value = ref');
    });
  });

  describe('Styling', () => {
    it('should generate CSS styles by default', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'StyledComponent',
          useStyle: true,
          styleType: 'css',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.styleCode).toBeDefined();
      expect(result.data?.styleCode).toContain('.styledcomponent-container');
    });

    it('should generate SCSS styles', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'ScssComponent',
          useStyle: true,
          styleType: 'scss',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.styleCode).toBeDefined();
      expect(result.data?.styleCode).toContain('.scsscomponent-container');
      expect(result.data?.styleCode).toContain('h1 {');
    });

    it('should generate styled-components', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'StyledComponentsComp',
          useStyle: true,
          styleType: 'styled-components',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.styleCode).toBeDefined();
      expect(result.data?.styleCode).toContain('styled.div');
      expect(result.data?.styleCode).toContain('styled-components');
    });

    it('should generate Tailwind comments', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'TailwindComponent',
          useStyle: true,
          styleType: 'tailwind',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.styleCode).toBeDefined();
      expect(result.data?.styleCode).toContain('tailwind');
      expect(result.data?.styleCode).toContain('flex flex-col');
    });

    it('should not generate style code when useStyle is false', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'NoStyleComponent',
          useStyle: false,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.styleCode).toBeUndefined();
    });
  });

  describe('Testing', () => {
    it('should generate React tests when enabled', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'TestedComponent',
          framework: 'react',
          useTest: true,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.testCode).toBeDefined();
      expect(result.data?.testCode).toContain('@testing-library/react');
      expect(result.data?.testCode).toContain('describe(\'TestedComponent\'');
    });

    it('should generate Vue tests when enabled', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'VueTestedComponent',
          framework: 'vue',
          useTest: true,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.testCode).toBeDefined();
      expect(result.data?.testCode).toContain('@vue/test-utils');
      expect(result.data?.testCode).toContain('describe(\'VueTestedComponent\'');
    });

    it('should not generate test code when disabled', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'UntestedComponent',
          useTest: false,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.testCode).toBeUndefined();
    });

    it('should include test dependencies when enabled', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'WithTests',
          framework: 'react',
          useTest: true,
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.dependencies).toContain('@testing-library/react');
      expect(result.data?.dependencies).toContain('@testing-library/jest-dom');
    });
  });

  describe('Props Definition', () => {
    it('should generate TypeScript interface for props', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'PropsComponent',
          props: {
            title: { type: 'string', required: true, description: 'The title' },
            count: { type: 'number', required: false, default: 0 },
          },
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.typesCode).toContain('export interface PropsComponentProps');
      expect(result.data?.typesCode).toContain('title: string');
      expect(result.data?.typesCode).toContain('count?: number');
      expect(result.data?.typesCode).toContain('The title');
    });

    it('should handle different prop types', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'TypedProps',
          props: {
            name: { type: 'string', required: true },
            age: { type: 'number', required: true },
            active: { type: 'boolean', required: true },
            items: { type: 'array', required: true },
            config: { type: 'object', required: true },
            onClick: { type: 'function', required: true },
          },
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.typesCode).toContain('name: string');
      expect(result.data?.typesCode).toContain('age: number');
      expect(result.data?.typesCode).toContain('active: boolean');
      expect(result.data?.typesCode).toContain('unknown[]');
      expect(result.data?.typesCode).toContain('Record<string, unknown>');
      expect(result.data?.typesCode).toContain('(...args: unknown[]) => void');
    });

    it('should use props in component signature', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'UseProps',
          framework: 'react',
          componentType: 'functional',
          props: {
            title: { type: 'string', required: true },
          },
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.componentCode).toContain('{ title }: UsePropsProps');
    });
  });

  describe('Dependencies', () => {
    it('should include React dependencies', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'React',
          framework: 'react',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.dependencies).toContain('react');
      expect(result.data?.dependencies).toContain('react-dom');
    });

    it('should include Vue dependencies', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Vue',
          framework: 'vue',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.dependencies).toContain('vue');
    });

    it('should include styled-components dependency', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Styled',
          framework: 'react',
          useStyle: true,
          styleType: 'styled-components',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.dependencies).toContain('styled-components');
    });

    it('should include sass dependency for SCSS', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'Scss',
          framework: 'react',
          useStyle: true,
          styleType: 'scss',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.dependencies).toContain('sass');
    });
  });

  describe('Edge Cases', () => {
    it('should handle component name with hyphens', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'my-component',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.typesCode).toContain('MyComponentProps');
      expect(result.data?.componentCode).toContain('MyComponent');
    });

    it('should handle component name with underscores', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'my_component',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.typesCode).toContain('MyComponentProps');
    });

    it('should handle component name with spaces', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'my component',
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.typesCode).toContain('MyComponentProps');
    });

    it('should handle empty props object', async () => {
      const input: SkillInput<FrontendDevelopmentInput> = {
        data: {
          componentName: 'NoProps',
          props: {},
        },
        context: {
          projectRoot: '/test/project',
          variables: {},
        },
      };

      const result = await FrontendDevelopmentSkill.execute(input);

      expect(result.data?.typesCode).toBeDefined();
    });
  });
});
