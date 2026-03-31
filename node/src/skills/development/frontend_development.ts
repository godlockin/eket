/**
 * EKET Framework - Frontend Development Skill
 * Version: 0.9.2
 *
 * 前端开发技能：生成 React/Vue 组件代码
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 前端开发输入
 */
export interface FrontendDevelopmentInput {
  /** 组件名称 */
  componentName: string;
  /** 组件类型 */
  componentType?: 'functional' | 'class';
  /** UI 框架 */
  framework?: 'react' | 'vue' | 'angular';
  /** 组件描述 */
  description?: string;
  /** Props 定义 */
  props?: Record<string, PropDefinition>;
  /** 是否需要状态 */
  useState?: boolean;
  /** 是否需要样式 */
  useStyle?: boolean;
  /** 样式方案 */
  styleType?: 'css' | 'scss' | 'styled-components' | 'tailwind';
  /** 是否需要测试 */
  useTest?: boolean;
}

/**
 * Props 定义
 */
export interface PropDefinition {
  /** 类型 */
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'function';
  /** 是否必需 */
  required?: boolean;
  /** 默认值 */
  default?: unknown;
  /** 描述 */
  description?: string;
}

/**
 * 前端开发输出
 */
export interface FrontendDevelopmentOutput {
  /** 组件代码 */
  componentCode: string;
  /** 样式代码 */
  styleCode?: string;
  /** 测试代码 */
  testCode?: string;
  /** TypeScript 类型定义 */
  typesCode?: string;
  /** 文件列表 */
  files: {
    path: string;
    content: string;
    description: string;
  }[];
  /** 依赖项 */
  dependencies: string[];
  /** 使用示例 */
  usageExample: string;
}

/**
 * 前端开发 Skill 实例
 */
export const FrontendDevelopmentSkill: Skill<
  FrontendDevelopmentInput,
  FrontendDevelopmentOutput
> = {
  name: 'frontend_development',
  description: '生成 React/Vue 前端组件代码，包括类型定义、样式和测试',
  category: SkillCategory.DEVELOPMENT,
  tags: ['frontend', 'react', 'vue', 'component', 'typescript'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['componentName'],
    properties: {
      componentName: {
        type: 'string',
        description: '组件名称',
      },
      componentType: {
        type: 'string',
        enum: ['functional', 'class'],
        description: '组件类型',
      },
      framework: {
        type: 'string',
        enum: ['react', 'vue', 'angular'],
        description: 'UI 框架',
      },
      description: {
        type: 'string',
        description: '组件描述',
      },
      useState: {
        type: 'boolean',
        description: '是否需要状态',
      },
      useStyle: {
        type: 'boolean',
        description: '是否需要样式',
      },
      useTest: {
        type: 'boolean',
        description: '是否需要测试',
      },
    },
  },

  outputSchema: {
    type: 'object',
    properties: {
      componentCode: { type: 'string' },
      styleCode: { type: 'string' },
      testCode: { type: 'string' },
      typesCode: { type: 'string' },
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            content: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
      dependencies: { type: 'array', items: { type: 'string' } },
      usageExample: { type: 'string' },
    },
  },

  validateInput(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const req = input as Record<string, unknown>;

    if (!req.componentName || typeof req.componentName !== 'string') {
      return false;
    }

    if (req.componentName.toString().trim().length === 0) {
      return false;
    }

    return true;
  },

  async execute(
    input: SkillInput<FrontendDevelopmentInput>
  ): Promise<SkillOutput<FrontendDevelopmentOutput>> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const {
        componentName,
        componentType = 'functional',
        framework = 'react',
        description,
        props,
        useState = false,
        useStyle = true,
        styleType = 'css',
        useTest = true,
      } = input.data;

      logs.push(`开始生成组件：${componentName}`);

      // 1. 生成类型定义
      const typesCode = generateTypes(componentName, props);
      logs.push('生成 TypeScript 类型定义');

      // 2. 生成组件代码
      const componentCode = generateComponent({
        componentName,
        componentType,
        framework,
        description,
        props,
        useState,
      });
      logs.push('生成组件代码');

      // 3. 生成样式代码
      let styleCode: string | undefined;
      if (useStyle) {
        styleCode = generateStyle(componentName, styleType);
        logs.push(`生成样式代码 (${styleType})`);
      }

      // 4. 生成测试代码
      let testCode: string | undefined;
      if (useTest) {
        testCode = generateTest(componentName, framework, props);
        logs.push('生成测试代码');
      }

      // 5. 生成文件列表
      const files = generateFiles(componentName, componentCode, styleCode, testCode, typesCode);

      // 6. 生成依赖项
      const dependencies = generateDependencies(framework, styleType, useTest);

      // 7. 生成使用示例
      const usageExample = generateUsageExample(componentName, props, framework);

      logs.push('组件生成完成');

      return {
        success: true,
        data: {
          componentCode,
          styleCode,
          testCode,
          typesCode,
          files,
          dependencies,
          usageExample,
        },
        duration: Date.now() - startTime,
        logs,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logs.push(`错误：${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        errorCode: 'FRONTEND_GENERATION_FAILED',
        duration: Date.now() - startTime,
        logs,
      };
    }
  },
};

/**
 * 生成 TypeScript 类型定义
 */
function generateTypes(componentName: string, props?: Record<string, PropDefinition>): string {
  const pascalName = toPascalCase(componentName);

  let types = `// ${pascalName} Component Types\n\n`;

  if (props && Object.keys(props).length > 0) {
    types += `export interface ${pascalName}Props {\n`;

    for (const [propName, propDef] of Object.entries(props)) {
      if (propDef.description) {
        types += `  /** ${propDef.description} */\n`;
      }

      const optional = propDef.required ? '' : '?';
      types += `  ${propName}${optional}: ${propTypeToTsType(propDef.type)};\n`;

      if (propDef.default !== undefined) {
        types += `  /** @default ${JSON.stringify(propDef.default)} */\n`;
      }
    }

    types += `}\n`;
  } else {
    types += `export interface ${pascalName}Props {\n`;
    types += `  // TODO: Define props\n`;
    types += `}\n`;
  }

  return types;
}

/**
 * 生成组件代码
 */
function generateComponent(config: {
  componentName: string;
  componentType: string;
  framework: string;
  description?: string;
  props?: Record<string, PropDefinition>;
  useState: boolean;
}): string {
  const { componentName, componentType, framework, description, props, useState } = config;
  const pascalName = toPascalCase(componentName);

  if (framework === 'react') {
    return generateReactComponent(pascalName, componentType, description, props, useState);
  } else if (framework === 'vue') {
    return generateVueComponent(pascalName, description, props, useState);
  }

  return `// TODO: Implement ${framework} component for ${pascalName}`;
}

/**
 * 生成 React 组件
 */
function generateReactComponent(
  name: string,
  type: string,
  description?: string,
  props?: Record<string, PropDefinition>,
  useState?: boolean
): string {
  const hasProps = props && Object.keys(props).length > 0;

  let code = `/**\n`;
  code += ` * ${name} Component\n`;
  if (description) {
    code += ` * ${description}\n`;
  }
  code += ` */\n\n`;

  code += `import React`;
  if (useState) {
    code += `, { useState }`;
  }
  code += ` from 'react';\n`;

  if (hasProps) {
    code += `import type { ${name}Props } from './types';\n`;
  }

  code += `\n`;

  if (type === 'functional') {
    // 函数组件
    if (hasProps) {
      code += `export function ${name}({ ${generatePropDefaults(props)} }: ${name}Props) {\n`;
    } else {
      code += `export function ${name}() {\n`;
    }

    if (useState) {
      code += `  const [value, setValue] = useState<string>('');\n`;
      code += `\n`;
    }

    code += `  return (\n`;
    code += `    <div className="${name.toLowerCase()}-container">\n`;
    code += `      <h1>${name}</h1>\n`;
    code += `      {/* TODO: Implement component content */}\n`;
    code += `    </div>\n`;
    code += `  );\n`;
    code += `}\n`;
  } else {
    // 类组件
    code += `import React, { Component } from 'react';\n\n`;

    if (hasProps) {
      code += `export class ${name} extends Component<${name}Props> {\n`;
    } else {
      code += `export class ${name} extends React.Component {\n`;
    }

    if (useState) {
      code += `  state = {\n`;
      code += `    value: '',\n`;
      code += `  };\n\n`;
    }

    code += `  render() {\n`;
    code += `    return (\n`;
    code += `      <div className="${name.toLowerCase()}-container">\n`;
    code += `        <h1>${name}</h1>\n`;
    code += `        {/* TODO: Implement component content */}\n`;
    code += `      </div>\n`;
    code += `    );\n`;
    code += `  }\n`;
    code += `}\n`;
  }

  return code;
}

/**
 * 生成 Vue 组件
 */
function generateVueComponent(
  name: string,
  description?: string,
  props?: Record<string, PropDefinition>,
  useState?: boolean
): string {
  let code = `<!--\n`;
  code += `  ${name} Component\n`;
  if (description) {
    code += `  ${description}\n`;
  }
  code += `-->\n\n`;

  code += `<template>\n`;
  code += `  <div class="${name.toLowerCase()}-container">\n`;
  code += `    <h1>${name}</h1>\n`;
  code += `    <!-- TODO: Implement component content -->\n`;
  code += `  </div>\n`;
  code += `</template>\n\n`;

  code += `<script lang="ts">\n`;
  code += `import { defineComponent`;
  if (useState) {
    code += `, ref`;
  }
  code += ` } from 'vue';\n`;

  if (props && Object.keys(props).length > 0) {
    code += `\n`;
    code += `export default defineComponent({\n`;
    code += `  name: '${name}',\n`;
    code += `  props: {\n`;

    for (const [propName, propDef] of Object.entries(props)) {
      code += `    ${propName}: {\n`;
      code += `      type: ${vuePropType(propDef.type)},\n`;
      if (propDef.required) {
        code += `      required: true,\n`;
      }
      if (propDef.default !== undefined) {
        code += `      default: ${JSON.stringify(propDef.default)},\n`;
      }
      code += `    },\n`;
    }

    code += `  },\n`;
  }

  code += `  setup() {\n`;

  if (useState) {
    code += `    const value = ref('');\n`;
    code += `\n`;
  }

  code += `    return {\n`;
  if (useState) {
    code += `      value,\n`;
  }
  code += `    };\n`;
  code += `  },\n`;
  code += `});\n`;
  code += `</script>\n\n`;

  code += `<style scoped>\n`;
  code += `.${name.toLowerCase()}-container {\n`;
  code += `  /* TODO: Add styles */\n`;
  code += `}\n`;
  code += `</style>\n`;

  return code;
}

/**
 * 生成样式代码
 */
function generateStyle(componentName: string, styleType: string): string {
  const name = componentName.toLowerCase();

  switch (styleType) {
    case 'scss':
      return `// ${componentName} Styles\n\n.${name}-container {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n\n  h1 {\n    font-size: 2rem;\n    margin-bottom: 1rem;\n  }\n}\n`;

    case 'styled-components':
      return `// ${componentName} Styled Components\n\nimport styled from 'styled-components';\n\nexport const Container = styled.div\`\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  padding: 1rem;\n\n  h1 {\n    font-size: 2rem;\n    margin-bottom: 1rem;\n  }\n\`;\n`;

    case 'tailwind':
      return `// ${componentName} Tailwind Classes\n// Usage: className="flex flex-col items-center justify-center p-4"\n`;

    default: // css
      return `/* ${componentName} Styles */\n\n.${name}-container {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  padding: 1rem;\n}\n\n.${name}-container h1 {\n  font-size: 2rem;\n  margin-bottom: 1rem;\n}\n`;
  }
}

/**
 * 生成测试代码
 */
function generateTest(
  componentName: string,
  framework: string,
  _props?: Record<string, PropDefinition>
): string {
  const name = toPascalCase(componentName);

  if (framework === 'react') {
    return `/**\n * ${name} Component Tests\n */\n\nimport React from 'react';\nimport { render, screen } from '@testing-library/react';\nimport { ${name} } from './${name}';\n\ndescribe('${name}', () => {\n  it('renders without crashing', () => {\n    render(<${name} />);\n    expect(screen.getByText('${name}')).toBeInTheDocument();\n  });\n\n  // TODO: Add more tests\n});\n`;
  } else if (framework === 'vue') {
    return `/**\n * ${name} Component Tests\n */\n\nimport { mount } from '@vue/test-utils';\nimport ${name} from './${name}.vue';\n\ndescribe('${name}', () => {\n  it('renders component name', () => {\n    const wrapper = mount(${name});\n    expect(wrapper.text()).toContain('${name}');\n  });\n\n  // TODO: Add more tests\n});\n`;
  }

  return `// TODO: Implement tests for ${framework} component`;
}

/**
 * 生成文件列表
 */
function generateFiles(
  componentName: string,
  componentCode: string,
  styleCode?: string,
  testCode?: string,
  typesCode?: string
): { path: string; content: string; description: string }[] {
  const name = toPascalCase(componentName);
  const files: { path: string; content: string; description: string }[] = [];

  // 类型定义
  if (typesCode) {
    files.push({
      path: `src/components/${name}/types.ts`,
      content: typesCode,
      description: 'TypeScript 类型定义',
    });
  }

  // 组件主文件
  files.push({
    path: `src/components/${name}/index.tsx`,
    content: componentCode,
    description: '组件实现',
  });

  // 样式文件
  if (styleCode) {
    const ext = styleCode.includes('styled') ? 'ts' : styleCode.startsWith('//') ? 'scss' : 'css';
    files.push({
      path: `src/components/${name}/styles.${ext}`,
      content: styleCode,
      description: '样式文件',
    });
  }

  // 测试文件
  if (testCode) {
    files.push({
      path: `src/components/${name}/${name}.test.tsx`,
      content: testCode,
      description: '测试文件',
    });
  }

  return files;
}

/**
 * 生成依赖项
 */
function generateDependencies(framework: string, styleType: string, useTest: boolean): string[] {
  const deps: string[] = [];

  // 框架依赖
  if (framework === 'react') {
    deps.push('react', 'react-dom');
  } else if (framework === 'vue') {
    deps.push('vue');
  }

  // 样式依赖
  if (styleType === 'styled-components') {
    deps.push('styled-components');
  } else if (styleType === 'scss') {
    deps.push('sass');
  }

  // 测试依赖
  if (useTest) {
    if (framework === 'react') {
      deps.push('@testing-library/react', '@testing-library/jest-dom');
    } else if (framework === 'vue') {
      deps.push('@vue/test-utils');
    }
  }

  return deps;
}

/**
 * 生成使用示例
 */
function generateUsageExample(
  componentName: string,
  props?: Record<string, PropDefinition>,
  framework: string = 'react'
): string {
  const name = toPascalCase(componentName);

  if (framework === 'react') {
    let example = `// React Usage Example\n\n`;
    example += `import React from 'react';\n`;
    example += `import { ${name} } from './components/${name}';\n\n`;
    example += `function App() {\n`;
    example += `  return (\n`;
    example += `    <${name}`;

    if (props && Object.keys(props).length > 0) {
      example += `\n`;
      for (const [propName, propDef] of Object.entries(props)) {
        const value = propDef.type === 'string' ? `"example"` : propDef.type === 'boolean' ? `{true}` : `{${propDef.default || 'undefined'}}`;
        example += `      ${propName}={${value}}\n`;
      }
      example += `    `;
    }

    example += ` />\n`;
    example += `  );\n`;
    example += `}\n`;

    return example;
  } else if (framework === 'vue') {
    let example = `<!-- Vue Usage Example -->\n\n`;
    example += `<template>\n`;
    example += `  <div>\n`;
    example += `    <${name}`;

    if (props && Object.keys(props).length > 0) {
      example += `\n`;
      for (const [propName, propDef] of Object.entries(props)) {
        const value = `:${propName}="${propDef.default || 'value'}"`;
        example += `      ${value}\n`;
      }
      example += `    `;
    }

    example += ` />\n`;
    example += `  </div>\n`;
    example += `</template>\n\n`;
    example += `<script lang="ts">\n`;
    example += `import ${name} from './components/${name}.vue';\n\n`;
    example += `export default {\n`;
    example += `  components: { ${name} },\n`;
    example += `};\n`;
    example += `</script>\n`;

    return example;
  }

  return `// TODO: Add usage example for ${framework}`;
}

/**
 * 工具函数：转帕斯卡命名法
 */
function toPascalCase(str: string): string {
  return str
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * 工具函数：Prop 类型转 TypeScript 类型
 */
function propTypeToTsType(type: string): string {
  const typeMap: Record<string, string> = {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    array: 'unknown[]',
    object: 'Record<string, unknown>',
    function: '(...args: unknown[]) => void',
  };

  return typeMap[type] || 'unknown';
}

/**
 * 工具函数：Prop 类型转 Vue 类型
 */
function vuePropType(type: string): string {
  const typeMap: Record<string, string> = {
    string: 'String',
    number: 'Number',
    boolean: 'Boolean',
    array: 'Array',
    object: 'Object',
    function: 'Function',
  };

  return typeMap[type] || 'unknown';
}

/**
 * 工具函数：生成 Props 默认值
 */
function generatePropDefaults(props?: Record<string, PropDefinition>): string {
  if (!props) return '';

  const defaults: string[] = [];

  for (const [propName, propDef] of Object.entries(props)) {
    if (propDef.default !== undefined && !propDef.required) {
      defaults.push(`${propName} = ${JSON.stringify(propDef.default)}`);
    } else if (!propDef.required) {
      defaults.push(propName);
    }
  }

  return defaults.join(', ');
}

/**
 * 默认导出
 */
export default FrontendDevelopmentSkill;
