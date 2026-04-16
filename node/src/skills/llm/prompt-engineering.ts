/**
 * EKET Framework - LLM Skill: Prompt Engineering
 * Version: 1.0.0
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface PromptEngineeringInput {
  /** 任务名称 */
  taskName: string;
  /** 任务描述 */
  taskDescription?: string;
  /** 目标模型 */
  targetModel?: string;
}

export interface PromptEngineeringOutput {
  /** 7 步 Prompt 工程流程 */
  steps: string[];
  /** Prompt 模板输出路径 */
  outputPath: string;
}

export const promptEngineeringSkill: Skill<PromptEngineeringInput, PromptEngineeringOutput> = {
  name: 'llm/prompt-engineering',
  description: 'Prompt 工程：7 步系统化流程，从任务分解到 A/B 测试版本化管理',
  category: SkillCategory.CUSTOM,
  tags: ['llm', 'prompt', 'rag', 'agent', 'engineering'],
  version: '1.0.0',

  async execute(input: SkillInput<PromptEngineeringInput>): Promise<SkillOutput<PromptEngineeringOutput>> {
    const start = Date.now();
    const { taskName, targetModel = 'GPT-4/Claude/Gemini' } = input.data as PromptEngineeringInput;
    const slug = taskName.toLowerCase().replace(/\s+/g, '-');

    const steps: string[] = [
      `[Step 1] 任务分解：明确 ${taskName} 的输入格式、期望输出格式、约束条件（长度/语言/风格）`,
      `[Step 2] 角色设定（system prompt）：为 ${targetModel} 定义专业角色，明确能力边界和行为规范`,
      '[Step 3] Few-shot 示例选取：选 3-5 个覆盖典型场景和 edge case 的高质量示例对',
      '[Step 4] Chain-of-Thought 或 ReAct 设计：复杂推理任务加 CoT，工具调用任务用 ReAct 框架',
      '[Step 5] 输出格式约束：定义 JSON schema 或 XML 结构，启用 structured output / function calling',
      '[Step 6] 边界测试：覆盖对抗输入（越狱/注入）、空输入、超长输入、多语言输入场景',
      '[Step 7] A/B 测试并版本化：对比不同 prompt 版本，记录指标差异，存档版本 diff',
    ];

    return {
      success: true,
      data: {
        steps,
        outputPath: `confluence/memory/prompts/${slug}-v1.md`,
      },
      duration: Date.now() - start,
      logs: [`Prompt engineering workflow generated for task: ${taskName}`],
    };
  },

  validateInput(input: unknown): boolean {
    return (
      typeof input === 'object' &&
      input !== null &&
      'data' in input &&
      typeof (input as Record<string, unknown>).data === 'object'
    );
  },
};

export default promptEngineeringSkill;
