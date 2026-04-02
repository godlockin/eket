/**
 * Skill Executor Module
 * 执行 YAML 定义的 Skills
 *
 * Phase 4.3 - Core component for EKET Framework
 */

import * as fs from 'fs';
import * as path from 'path';

import type { SkillDefinition, SkillExecutionResult, Result } from '../types/index.js';
import { EketError } from '../types/index.js';
import { execFileNoThrow, type ExecResult } from '../utils/execFileNoThrow.js';
import { parseSimpleYAML } from '../utils/yaml-parser.js';

/**
 * Skill 执行上下文
 */
export interface SkillContext {
  projectId: string;
  ticketId: string;
  worktreePath: string;
  variables: Record<string, unknown>;
}

/**
 * Skill Executor
 * 负责加载和执行 YAML 定义的 Skills
 */
export class SkillExecutor {
  private skillsPath: string;
  private loadedSkills: Map<string, SkillDefinition>;

  constructor(projectRoot: string) {
    this.skillsPath = path.join(projectRoot, 'skills');
    this.loadedSkills = new Map();
  }

  /**
   * 加载 Skill 定义
   */
  async loadSkill(skillName: string): Promise<Result<SkillDefinition>> {
    // 检查缓存
    if (this.loadedSkills.has(skillName)) {
      const cached = this.loadedSkills.get(skillName)!;
      return { success: true, data: cached };
    }

    try {
      // 查找 Skill 文件
      const skillFile = await this.findSkillFile(skillName);

      if (!skillFile) {
        return {
          success: false,
          error: new EketError('SKILL_NOT_FOUND', `Skill "${skillName}" not found`),
        };
      }

      // 读取并解析 YAML
      const content = fs.readFileSync(skillFile, 'utf-8');
      const parsed = parseSimpleYAML(content);

      // 转换为 SkillDefinition
      const skill = this.parseSkillDefinition(skillName, parsed);

      if (!skill) {
        return {
          success: false,
          error: new EketError('INVALID_SKILL_FORMAT', `Invalid skill format: ${skillName}`),
        };
      }

      // 缓存
      this.loadedSkills.set(skillName, skill);

      return { success: true, data: skill };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return {
        success: false,
        error: new EketError('SKILL_LOAD_FAILED', `Failed to load skill: ${errorMessage}`),
      };
    }
  }

  /**
   * 执行 Skill
   */
  async executeSkill(
    skillName: string,
    context: SkillContext,
    parameters?: Record<string, unknown>
  ): Promise<Result<SkillExecutionResult>> {
    const startTime = Date.now();

    // 1. 加载 Skill
    const loadResult = await this.loadSkill(skillName);
    if (!loadResult.success) {
      return loadResult;
    }

    const skill = loadResult.data;

    try {
      // 2. 合并参数
      const mergedParams = {
        ...context.variables,
        ...parameters,
      };

      // 3. 执行步骤
      const stepResults: Record<string, ExecResult> = {};
      let lastResult: ExecResult | null = null;

      for (const step of skill.steps) {
        const stepResult = await this.executeStep(step, mergedParams, context);
        stepResults[step.name] = stepResult;
        lastResult = stepResult;

        // 检查步骤是否成功
        if (stepResult.status !== 0) {
          const duration = Date.now() - startTime;
          return {
            success: true,
            data: {
              success: false,
              error: `Step "${step.name}" failed with status ${stepResult.status}`,
              output: { stepResults },
              duration,
            },
          };
        }
      }

      const duration = Date.now() - startTime;

      // 4. 返回结果
      return {
        success: true,
        data: {
          success: true,
          output: {
            stepResults,
            stdout: lastResult?.stdout,
            stderr: lastResult?.stderr,
          },
          duration,
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const duration = Date.now() - startTime;
      return {
        success: true,
        data: {
          success: false,
          error: errorMessage,
          duration,
        },
      };
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: { name: string; action: string },
    params: Record<string, unknown>,
    context: SkillContext
  ): Promise<ExecResult> {
    const { action } = step;

    // 替换参数占位符
    const resolvedAction = this.interpolateString(action, params);

    // 解析命令
    const [command, ...args] = resolvedAction.split(/\s+/);

    // 执行命令
    const result = await execFileNoThrow(command, args, {
      cwd: context.worktreePath || process.cwd(),
      timeout: 60000, // 60 秒超时
    });

    return result;
  }

  /**
   * 字符串插值（替换 ${var} 占位符）
   */
  private interpolateString(str: string, params: Record<string, unknown>): string {
    return str.replace(/\$\{(\w+)\}/g, (match, key) => {
      const value = params[key];
      if (value === undefined) {
        return match; // 保留未定义的占位符
      }
      return String(value);
    });
  }

  /**
   * 查找 Skill 文件
   */
  private async findSkillFile(skillName: string): Promise<string | null> {
    // 支持的分类
    const categories = [
      'requirements',
      'design',
      'development',
      'testing',
      'devops',
      'documentation',
    ];

    // 在分类目录中查找
    for (const category of categories) {
      const skillPath = path.join(this.skillsPath, category, `${skillName}.yml`);
      if (fs.existsSync(skillPath)) {
        return skillPath;
      }

      // 也支持子目录
      const subDirPath = path.join(this.skillsPath, category, skillName, 'skill.yml');
      if (fs.existsSync(subDirPath)) {
        return subDirPath;
      }
    }

    // 直接在 skills 目录查找
    const directPath = path.join(this.skillsPath, `${skillName}.yml`);
    if (fs.existsSync(directPath)) {
      return directPath;
    }

    return null;
  }

  /**
   * 解析 Skill 定义
   */
  private parseSkillDefinition(
    name: string,
    parsed: Record<string, unknown>
  ): SkillDefinition | null {
    const steps: Array<{ name: string; action: string; parameters?: Record<string, unknown> }> = [];

    // 解析 steps
    if (Array.isArray(parsed.steps)) {
      for (const step of parsed.steps) {
        if (typeof step === 'object' && step !== null) {
          const stepObj = step as Record<string, unknown>;
          if (typeof stepObj.name === 'string' && typeof stepObj.action === 'string') {
            steps.push({
              name: stepObj.name,
              action: stepObj.action,
              parameters: stepObj.parameters as Record<string, unknown> | undefined,
            });
          }
        }
      }
    }

    if (steps.length === 0) {
      return null;
    }

    return {
      name: (parsed.name as string) || name,
      description: (parsed.description as string) || '',
      category: (parsed.category as string) || 'unknown',
      input_schema: parsed.input_schema as Record<string, unknown> | undefined,
      output_schema: parsed.output_schema as Record<string, unknown> | undefined,
      steps,
    };
  }

  /**
   * 列出所有可用 Skills
   */
  listAvailableSkills(): string[] {
    const skills: string[] = [];

    if (!fs.existsSync(this.skillsPath)) {
      return skills;
    }

    const categories = [
      'requirements',
      'design',
      'development',
      'testing',
      'devops',
      'documentation',
    ];

    for (const category of categories) {
      const categoryPath = path.join(this.skillsPath, category);
      if (fs.existsSync(categoryPath)) {
        const files = fs.readdirSync(categoryPath);
        for (const file of files) {
          if (file.endsWith('.yml')) {
            skills.push(file.replace('.yml', ''));
          }
        }
      }
    }

    return skills;
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.loadedSkills.clear();
  }

  /**
   * 重新加载 Skill
   */
  async reloadSkill(skillName: string): Promise<Result<SkillDefinition>> {
    // 从缓存中移除
    this.loadedSkills.delete(skillName);
    // 重新加载
    return await this.loadSkill(skillName);
  }
}

/**
 * 创建 Skill Executor 实例
 */
export function createSkillExecutor(projectRoot: string): SkillExecutor {
  return new SkillExecutor(projectRoot);
}

/**
 * 便捷函数：执行 Skill
 */
export async function executeSkill(
  projectRoot: string,
  skillName: string,
  context: SkillContext,
  parameters?: Record<string, unknown>
): Promise<Result<SkillExecutionResult>> {
  const executor = createSkillExecutor(projectRoot);
  return await executor.executeSkill(skillName, context, parameters);
}

/**
 * 便捷函数：列出可用 Skills
 */
export function listSkills(projectRoot: string): string[] {
  const executor = createSkillExecutor(projectRoot);
  return executor.listAvailableSkills();
}
