/**
 * EKET Framework - Unit Test Skill
 * Version: 0.9.2
 *
 * 单元测试技能：生成单元测试代码
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 单元测试输入
 */
export interface UnitTestInput {
  /** 要测试的函数/类名称 */
  targetName: string;
  /** 目标类型 */
  targetType: 'function' | 'class' | 'module' | 'component';
  /** 编程语言 */
  language?: 'typescript' | 'javascript' | 'python' | 'java';
  /** 测试框架 */
  testFramework?: 'jest' | 'vitest' | 'pytest' | 'junit';
  /** 函数签名/类定义 */
  signature?: string;
  /** 功能描述 */
  description?: string;
  /** 测试场景列表 */
  testCases?: TestCaseConfig[];
  /** 是否需要 Mock */
  needsMock?: boolean;
  /** Mock 配置 */
  mockConfig?: MockConfig;
}

/**
 * 测试场景配置
 */
export interface TestCaseConfig {
  /** 场景描述 */
  description: string;
  /** 输入参数 */
  input?: Record<string, unknown>;
  /** 期望输出 */
  expected?: unknown;
  /** 是否应该抛出异常 */
  shouldThrow?: boolean;
  /** 期望抛出的错误类型 */
  expectedError?: string;
  /** 前置条件 */
  setup?: string;
  /** 后置条件 */
  teardown?: string;
}

/**
 * Mock 配置
 */
export interface MockConfig {
  /** 要 Mock 的模块 */
  modules: string[];
  /** Mock 实现 */
  mocks: Record<string, unknown>;
}

/**
 * 单元测试输出
 */
export interface UnitTestOutput {
  /** 测试代码 */
  testCode: string;
  /** 测试文件路径 */
  testFilePath: string;
  /** 测试用例列表 */
  testCases: {
    name: string;
    description: string;
    assertions: string[];
  }[];
  /** Mock 设置代码 */
  mockSetup?: string;
  /** 运行命令 */
  runCommand: string;
  /** 覆盖率命令 */
  coverageCommand?: string;
  /** 依赖项 */
  dependencies: string[];
}

/**
 * 单元测试 Skill 实例
 */
export const UnitTestSkill: Skill<UnitTestInput, UnitTestOutput> = {
  name: 'unit_test',
  description: '生成单元测试代码，支持多种测试框架和语言',
  category: SkillCategory.TESTING,
  tags: ['testing', 'unit-test', 'jest', 'vitest', 'pytest'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['targetName', 'targetType'],
    properties: {
      targetName: {
        type: 'string',
        description: '要测试的函数/类名称',
      },
      targetType: {
        type: 'string',
        enum: ['function', 'class', 'module', 'component'],
        description: '目标类型',
      },
      language: {
        type: 'string',
        enum: ['typescript', 'javascript', 'python', 'java'],
        description: '编程语言',
      },
      testFramework: {
        type: 'string',
        enum: ['jest', 'vitest', 'pytest', 'junit'],
        description: '测试框架',
      },
      description: {
        type: 'string',
        description: '功能描述',
      },
    },
  },

  outputSchema: {
    type: 'object',
    properties: {
      testCode: { type: 'string' },
      testFilePath: { type: 'string' },
      testCases: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            assertions: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      runCommand: { type: 'string' },
      dependencies: { type: 'array', items: { type: 'string' } },
    },
  },

  validateInput(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const req = input as Record<string, unknown>;

    if (!req.targetName || typeof req.targetName !== 'string') {
      return false;
    }

    if (!req.targetType || !['function', 'class', 'module', 'component'].includes(req.targetType as string)) {
      return false;
    }

    if (req.targetName.toString().trim().length === 0) {
      return false;
    }

    return true;
  },

  async execute(
    input: SkillInput<UnitTestInput>
  ): Promise<SkillOutput<UnitTestOutput>> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const {
        targetName,
        targetType,
        language = 'typescript',
        testFramework = 'jest',
        signature,
        description,
        testCases,
        needsMock = false,
        mockConfig,
      } = input.data;

      logs.push(`开始生成测试：${targetName}`);

      // 1. 生成测试用例
      const generatedTestCases = testCases || generateTestCases(targetName, targetType, description);
      logs.push(`生成 ${generatedTestCases.length} 个测试场景`);

      // 2. 生成 Mock 设置
      let mockSetup: string | undefined;
      if (needsMock && mockConfig) {
        mockSetup = generateMockSetup(language, testFramework, mockConfig);
        logs.push('生成 Mock 设置');
      }

      // 3. 生成测试代码
      const testCode = generateTestCode({
        targetName,
        targetType,
        language,
        testFramework,
        signature,
        description,
        testCases: generatedTestCases,
        mockSetup,
      });
      logs.push('生成测试代码');

      // 4. 生成测试文件路径
      const testFilePath = generateTestFilePath(targetName, language, testFramework);

      // 5. 生成运行命令
      const runCommand = generateRunCommand(testFramework);

      // 6. 生成覆盖率命令
      const coverageCommand = generateCoverageCommand(testFramework);

      // 7. 生成依赖项
      const dependencies = generateDependencies(language, testFramework);

      logs.push('测试生成完成');

      return {
        success: true,
        data: {
          testCode,
          testFilePath,
          testCases: generatedTestCases.map((tc) => ({
            name: tc.description.replace(/\s+/g, '_'),
            description: tc.description,
            assertions: generateAssertions(tc),
          })) as { name: string; description: string; assertions: string[] }[],
          mockSetup,
          runCommand,
          coverageCommand,
          dependencies,
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
        errorCode: 'TEST_GENERATION_FAILED',
        duration: Date.now() - startTime,
        logs,
      };
    }
  },
};

/**
 * 生成测试用例
 */
function generateTestCases(
  targetName: string,
  targetType: string,
  description?: string
): TestCaseConfig[] {
  const testCases: TestCaseConfig[] = [];

  // 1. 基础功能测试
  testCases.push({
    description: `应该正确${targetName.toLowerCase()} ${description || '执行基本功能'}`,
    input: {},
    expected: undefined,
    shouldThrow: false,
  });

  // 2. 边界条件测试
  if (targetType === 'function') {
    testCases.push({
      description: '应该处理空输入',
      input: {},
      expected: undefined,
      shouldThrow: false,
    });

    testCases.push({
      description: '应该处理 null/undefined 输入',
      input: {},
      expected: undefined,
      shouldThrow: targetType === 'function',
    });
  }

  // 3. 异常测试
  testCases.push({
    description: '应该在无效输入时抛出错误',
    input: {},
    shouldThrow: true,
    expectedError: 'Error',
  });

  // 4. 返回值测试
  testCases.push({
    description: '应该返回正确的数据类型',
    input: {},
    expected: 'correct_type',
    shouldThrow: false,
  });

  return testCases;
}

/**
 * 生成 Mock 设置
 */
function generateMockSetup(
  language: string,
  _testFramework: string,
  config: MockConfig
): string {
  if (language === 'python') {
    return generatePythonMockSetup(_testFramework, config);
  }

  return generateJestMockSetup(config);
}

/**
 * 生成 Jest Mock 设置
 */
function generateJestMockSetup(config: MockConfig): string {
  let code = '// Mock Setup\n\n';

  for (const moduleName of config.modules) {
    code += `jest.mock('${moduleName}', () => ({\n`;

    const mockImpl = config.mocks[moduleName] as Record<string, unknown>;
    if (mockImpl && typeof mockImpl === 'object') {
      for (const [key, value] of Object.entries(mockImpl)) {
        code += `  ${key}: ${typeof value === 'function' ? 'jest.fn()' : JSON.stringify(value)},\n`;
      }
    } else {
      code += `  // TODO: Implement mock\n`;
    }

    code += '}));\n\n';
  }

  return code;
}

/**
 * 生成 Python Mock 设置
 */
function generatePythonMockSetup(_testFramework: string, config: MockConfig): string {
  let code = '# Mock Setup\n\n';
  code += 'from unittest.mock import Mock, patch, MagicMock\n\n';

  for (const moduleName of config.modules) {
    code += `@patch('${moduleName}')\n`;
  }

  code += `def test_function(_mock):\n`;
  code += `    # Configure mocks\n`;

  for (const [_moduleName, mockImpl] of Object.entries(config.mocks)) {
    if (typeof mockImpl === 'object' && mockImpl !== null) {
      for (const [key, value] of Object.entries(mockImpl)) {
        code += `    mock.${key}.return_value = ${JSON.stringify(value)}\n`;
      }
    }
  }

  return code;
}

/**
 * 生成测试代码
 */
function generateTestCode(config: {
  targetName: string;
  targetType: string;
  language: string;
  testFramework: string;
  signature?: string;
  description?: string;
  testCases: TestCaseConfig[];
  mockSetup?: string;
}): string {
  const { language } = config;

  if (language === 'python') {
    return generatePythonTestCode(config);
  } else if (language === 'java') {
    return generateJavaTestCode(config);
  } else {
    // TypeScript/JavaScript
    return generateTypeScriptTestCode(config);
  }
}

/**
 * 生成 TypeScript 测试代码
 */
function generateTypeScriptTestCode(config: {
  targetName: string;
  targetType: string;
  testFramework: string;
  description?: string;
  testCases: TestCaseConfig[];
  mockSetup?: string;
}): string {
  const { targetName, testFramework, description, testCases } = config;
  const testName = toPascalCase(targetName);

  let code = `/**\n`;
  code += ` * ${testName} Tests\n`;
  if (description) {
    code += ` * ${description}\n`;
  }
  code += ` */\n\n`;

  // 导入
  if (testFramework === 'vitest') {
    code += `import { describe, it, expect, beforeEach, afterEach } from 'vitest';\n`;
  } else {
    code += `import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';\n`;
  }

  code += `import { ${testName} } from '../src/${targetName}';\n\n`;

  // Mock 设置
  if (config.mockSetup) {
    code += config.mockSetup;
  }

  // 测试套件
  code += `describe('${testName}', () => {\n`;

  // 生成测试用例
  testCases.forEach((tc) => {
    code += `\n`;
    code += `  it('${tc.description}', () => {\n`;

    if (tc.setup) {
      code += `    // Setup: ${tc.setup}\n`;
    }

    if (tc.input && Object.keys(tc.input).length > 0) {
      code += `    const input = ${JSON.stringify(tc.input, null, 6)};\n`;
      code += `    const result = ${testName}(input);\n`;
    } else {
      code += `    const result = ${testName}();\n`;
    }

    if (tc.shouldThrow) {
      code += `    expect(() => result).toThrow();\n`;
    } else if (tc.expected !== undefined) {
      if (tc.expected === 'correct_type') {
        code += `    expect(result).toBeDefined();\n`;
      } else {
        code += `    expect(result).toEqual(${JSON.stringify(tc.expected)});\n`;
      }
    } else {
      code += `    // TODO: Add assertions\n`;
    }

    if (tc.teardown) {
      code += `    // Teardown: ${tc.teardown}\n`;
    }

    code += `  });\n`;
  });

  code += `});\n`;

  return code;
}

/**
 * 生成 Python 测试代码
 */
function generatePythonTestCode(config: {
  targetName: string;
  targetType: string;
  testFramework: string;
  description?: string;
  testCases: TestCaseConfig[];
}): string {
  const { targetName, description, testCases } = config;

  let code = `"""\n`;
  code += `${targetName} Tests\n`;
  if (description) {
    code += `${description}\n`;
  }
  code += `"""\n\n`;

  code += `import pytest\n`;
  code += `from src.${targetName} import ${toPascalCase(targetName)}\n\n`;

  // 测试用例
  testCases.forEach((tc) => {
    code += `def test_${tc.description.replace(/\s+/g, '_')}():\n`;
    code += `    """${tc.description}"""\n`;

    if (tc.setup) {
      code += `    # Setup: ${tc.setup}\n`;
    }

    if (tc.shouldThrow) {
      code += `    with pytest.raises(Exception):\n`;
      code += `        ${toPascalCase(targetName)}()\n`;
    } else {
      code += `    result = ${toPascalCase(targetName)}()\n`;
      code += `    assert result is not None\n`;
      code += `    # TODO: Add assertions\n`;
    }

    if (tc.teardown) {
      code += `    # Teardown: ${tc.teardown}\n`;
    }

    code += `\n`;
  });

  return code;
}

/**
 * 生成 Java 测试代码
 */
function generateJavaTestCode(config: {
  targetName: string;
  targetType: string;
  description?: string;
  testCases: TestCaseConfig[];
}): string {
  const { targetName, description, testCases } = config;
  const testName = toPascalCase(targetName);

  let code = `/**\n`;
  code += ` * ${testName} Tests\n`;
  if (description) {
    code += ` * ${description}\n`;
  }
  code += ` */\n\n`;

  code += `package com.example;\n\n`;
  code += `import org.junit.jupiter.api.Test;\n`;
  code += `import org.junit.jupiter.api.DisplayName;\n`;
  code += `import static org.junit.jupiter.api.Assertions.*;\n\n`;

  code += `public class ${testName}Test {\n\n`;

  testCases.forEach((tc) => {
    code += `    @Test\n`;
    code += `    @DisplayName("${tc.description}")\n`;
    code += `    void test${tc.description.replace(/\s+/g, '_').replace(/^./, (c: string) => c.toUpperCase())}() {\n`;

    if (tc.shouldThrow) {
      code += `        assertThrows(Exception.class, () -> {\n`;
      code += `            new ${testName}();\n`;
      code += `        });\n`;
    } else {
      code += `        ${testName} target = new ${testName}();\n`;
      code += `        // TODO: Add assertions\n`;
    }

    code += `    }\n\n`;
  });

  code += `}\n`;

  return code;
}

/**
 * 生成测试文件路径
 */
function generateTestFilePath(
  targetName: string,
  language: string,
  testFramework: string
): string {
  const name = targetName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  if (language === 'python') {
    return `tests/test_${name}.py`;
  } else if (language === 'java') {
    return `src/test/java/${toPascalCase(targetName)}Test.java`;
  } else {
    // TypeScript/JavaScript
    const ext = testFramework === 'vitest' ? 'ts' : 'test.tsx';
    return `src/${name}.${ext}`;
  }
}

/**
 * 生成运行命令
 */
function generateRunCommand(testFramework: string): string {
  switch (testFramework) {
    case 'jest':
      return 'npm test';
    case 'vitest':
      return 'npm run test:unit';
    case 'pytest':
      return 'pytest';
    case 'junit':
      return 'mvn test';
    default:
      return 'npm test';
  }
}

/**
 * 生成覆盖率命令
 */
function generateCoverageCommand(testFramework: string): string {
  switch (testFramework) {
    case 'jest':
      return 'npm test -- --coverage';
    case 'vitest':
      return 'npm run test:unit -- --coverage';
    case 'pytest':
      return 'pytest --cov=src';
    case 'junit':
      return 'mvn jacoco:report';
    default:
      return 'npm test -- --coverage';
  }
}

/**
 * 生成依赖项
 */
function generateDependencies(language: string, testFramework: string): string[] {
  const deps: string[] = [];

  if (language === 'python') {
    deps.push('pytest');
    if (testFramework === 'pytest') {
      deps.push('pytest-cov', 'pytest-mock');
    }
  } else if (language === 'java') {
    deps.push('junit-jupiter', 'mockito-core');
  } else {
    // TypeScript/JavaScript
    if (testFramework === 'jest') {
      deps.push('jest', '@types/jest', 'ts-jest');
    } else if (testFramework === 'vitest') {
      deps.push('vitest', '@vitest/ui');
    }
  }

  return deps;
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
 * 生成断言列表
 */
function generateAssertions(tc: TestCaseConfig): string[] {
  const assertions: string[] = [];

  if (tc.shouldThrow) {
    assertions.push('Should throw an exception');
  } else if (tc.expected !== undefined) {
    assertions.push(`Should return ${JSON.stringify(tc.expected)}`);
  } else {
    assertions.push('Should execute without errors');
  }

  return assertions;
}

/**
 * 默认导出
 */
export default UnitTestSkill;
