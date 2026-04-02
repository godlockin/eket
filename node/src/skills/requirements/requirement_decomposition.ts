/**
 * EKET Framework - Requirement Decomposition Skill
 * Version: 0.9.2
 *
 * 需求拆解技能：将复杂需求拆解为可执行的子任务
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

/**
 * 需求拆解输入
 */
export interface RequirementDecompositionInput {
  /** 需求描述 */
  requirement: string;
  /** 需求来源（可选） */
  source?: string;
  /** 优先级（可选） */
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  /** 期望完成时间（可选） */
  dueDate?: string;
}

/**
 * 需求拆解输出
 */
export interface RequirementDecompositionOutput {
  /** 拆解后的子任务列表 */
  subTasks: Array<{
    /** 任务标题 */
    title: string;
    /** 任务描述 */
    description: string;
    /** 任务类型 */
    type: 'feature' | 'bugfix' | 'task' | 'improvement';
    /** 预估工作量（小时） */
    estimatedHours: number;
    /** 所需技能标签 */
    requiredSkills: string[];
    /** 依赖的其他任务 ID */
    dependencies: string[];
  }>;
  /** 总体预估工作量 */
  totalEstimatedHours: number;
  /** 建议的执行顺序 */
  suggestedOrder: string[];
  /** 风险提示 */
  risks?: string[];
}

/**
 * 需求拆解 Skill 实例
 */
export const RequirementDecompositionSkill: Skill<
  RequirementDecompositionInput,
  RequirementDecompositionOutput
> = {
  name: 'requirement_decomposition',
  description: '将复杂需求拆解为可执行的子任务，包括任务类型、工作量预估、依赖关系分析',
  category: SkillCategory.REQUIREMENTS,
  tags: ['requirements', 'analysis', 'decomposition', 'planning'],
  version: '1.0.0',

  inputSchema: {
    type: 'object',
    required: ['requirement'],
    properties: {
      requirement: {
        type: 'string',
        description: '需求描述',
      },
      source: {
        type: 'string',
        description: '需求来源',
      },
      priority: {
        type: 'string',
        enum: ['urgent', 'high', 'normal', 'low'],
        description: '优先级',
      },
      dueDate: {
        type: 'string',
        description: '期望完成时间',
      },
    },
  },

  outputSchema: {
    type: 'object',
    properties: {
      subTasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['feature', 'bugfix', 'task', 'improvement'] },
            estimatedHours: { type: 'number' },
            requiredSkills: { type: 'array', items: { type: 'string' } },
            dependencies: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      totalEstimatedHours: { type: 'number' },
      suggestedOrder: { type: 'array', items: { type: 'string' } },
      risks: { type: 'array', items: { type: 'string' } },
    },
  },

  validateInput(input: unknown): boolean {
    if (!input || typeof input !== 'object') {
      return false;
    }

    const req = input as Record<string, unknown>;

    // 必须有 requirement 字段
    if (!req.requirement || typeof req.requirement !== 'string') {
      return false;
    }

    // requirement 不能为空
    if (req.requirement.trim().length === 0) {
      return false;
    }

    return true;
  },

  async execute(
    input: SkillInput<RequirementDecompositionInput>
  ): Promise<SkillOutput<RequirementDecompositionOutput>> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const { requirement } = input.data;

      logs.push(`开始拆解需求：${requirement.substring(0, 100)}...`);

      // 1. 分析需求复杂度
      const complexity = analyzeComplexity(requirement);
      logs.push(`需求复杂度评分：${complexity.score}/10`);

      // 2. 识别关键组件
      const components = identifyComponents(requirement);
      logs.push(`识别到 ${components.length} 个关键组件`);

      // 3. 拆解为子任务
      const subTasks = decomposeToTasks(requirement, components);
      logs.push(`拆解为 ${subTasks.length} 个子任务`);

      // 4. 计算总工作量
      const totalEstimatedHours = subTasks.reduce((sum, task) => sum + task.estimatedHours, 0);

      // 5. 分析依赖关系
      analyzeDependencies(subTasks);

      // 6. 生成建议顺序
      const suggestedOrder = generateSuggestedOrder(subTasks);

      // 7. 识别风险
      const risks = identifyRisks(requirement, subTasks, complexity);

      logs.push(`总预估工作量：${totalEstimatedHours} 小时`);

      return {
        success: true,
        data: {
          subTasks,
          totalEstimatedHours,
          suggestedOrder,
          risks,
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
        errorCode: 'DECOMPOSITION_FAILED',
        duration: Date.now() - startTime,
        logs,
      };
    }
  },
};

/**
 * 分析需求复杂度
 */
function analyzeComplexity(requirement: string): { score: number; factors: string[] } {
  const factors: string[] = [];
  let score = 0;

  // 长度因素
  const wordCount = requirement.split(/\s+/).length;
  if (wordCount > 100) {
    score += 3;
    factors.push('需求描述较长');
  } else if (wordCount > 50) {
    score += 1;
  }

  // 技术关键词数量
  const techKeywords = [
    'API',
    'database',
    'integration',
    'authentication',
    'migration',
    'performance',
    'security',
    'real-time',
    'distributed',
    'microservice',
  ];

  const matchedKeywords = techKeywords.filter((kw) =>
    requirement.toLowerCase().includes(kw.toLowerCase())
  );

  if (matchedKeywords.length >= 3) {
    score += 3;
    factors.push(`涉及多个技术领域：${matchedKeywords.join(', ')}`);
  } else if (matchedKeywords.length >= 1) {
    score += 1;
  }

  // 数字（可能表示量化需求）
  const numbers = requirement.match(/\d+/g);
  if (numbers && numbers.length >= 3) {
    score += 1;
    factors.push('包含多个量化指标');
  }

  // 条件语句
  const conditionals = requirement.match(/if|when|unless|provided that|在.*情况下/gi);
  if (conditionals && conditionals.length >= 2) {
    score += 2;
    factors.push('包含多个条件分支');
  }

  return {
    score: Math.min(score, 10),
    factors,
  };
}

/**
 * 识别关键组件
 */
function identifyComponents(requirement: string): string[] {
  const components: string[] = [];

  // 常见组件模式
  const componentPatterns = [
    { pattern: /(?:frontend|front-end|UI|界面|前端)/gi, component: 'frontend' },
    { pattern: /(?:backend|back-end|API|服务器 | 后端)/gi, component: 'backend' },
    { pattern: /(?:database|DB|数据库 | 存储)/gi, component: 'database' },
    { pattern: /(?:auth|认证 | 登录 | 权限)/gi, component: 'authentication' },
    { pattern: /(?:report|报表 | 统计 | 分析)/gi, component: 'reporting' },
    { pattern: /(?:import|export|导入 | 导出)/gi, component: 'data-import' },
    { pattern: /(?:notification|通知 | 消息 | 提醒)/gi, component: 'notification' },
    { pattern: /(?:search|搜索 | 查询)/gi, component: 'search' },
    { pattern: /(?:dashboard|面板 | 仪表板)/gi, component: 'dashboard' },
    { pattern: /(?:integration|集成 | 对接)/gi, component: 'integration' },
  ];

  for (const { pattern, component } of componentPatterns) {
    if (pattern.test(requirement)) {
      components.push(component);
    }
  }

  return components;
}

/**
 * 拆解为子任务
 */
function decomposeToTasks(
  requirement: string,
  components: string[]
): Array<RequirementDecompositionOutput['subTasks'][number]> {
  const tasks: Array<RequirementDecompositionOutput['subTasks'][number]> = [];

  // 1. 需求分析任务
  tasks.push({
    title: '需求分析与文档编写',
    description: `分析需求"${requirement.substring(0, 50)}..."，编写详细需求文档`,
    type: 'task',
    estimatedHours: 2,
    requiredSkills: ['analysis', 'documentation'],
    dependencies: [],
  });

  // 2. 技术设计任务
  tasks.push({
    title: '技术方案设计',
    description: '根据需求和技术组件，设计技术实现方案',
    type: 'task',
    estimatedHours: 3,
    requiredSkills: ['architecture', 'design'],
    dependencies: [tasks[0].title],
  });

  // 3. 针对每个组件生成开发任务
  for (const component of components) {
    const componentTask = createComponentTask(component, requirement);
    if (componentTask) {
      tasks.push(componentTask);
    }
  }

  // 4. 测试任务
  tasks.push({
    title: '编写测试用例',
    description: '为功能编写单元测试和集成测试',
    type: 'task',
    estimatedHours: 2,
    requiredSkills: ['testing'],
    dependencies: tasks.filter((t) => t.type === 'feature').map((t) => t.title),
  });

  // 5. 文档任务
  tasks.push({
    title: '更新文档',
    description: '更新 API 文档、用户文档等相关文档',
    type: 'improvement',
    estimatedHours: 1,
    requiredSkills: ['documentation'],
    dependencies: [],
  });

  return tasks;
}

/**
 * 创建组件开发任务
 */
function createComponentTask(
  component: string,
  _requirement: string
): RequirementDecompositionOutput['subTasks'][number] | null {
  const componentConfig: Record<
    string,
    {
      title: string;
      type: 'feature' | 'bugfix' | 'task' | 'improvement';
      hours: number;
      skills: string[];
    }
  > = {
    frontend: {
      title: '前端界面开发',
      type: 'feature',
      hours: 4,
      skills: ['frontend', 'react', 'css'],
    },
    backend: {
      title: '后端 API 开发',
      type: 'feature',
      hours: 4,
      skills: ['backend', 'nodejs', 'api'],
    },
    database: {
      title: '数据库设计与实现',
      type: 'feature',
      hours: 3,
      skills: ['database', 'sql'],
    },
    authentication: {
      title: '认证授权功能开发',
      type: 'feature',
      hours: 3,
      skills: ['security', 'auth'],
    },
    reporting: {
      title: '报表功能开发',
      type: 'feature',
      hours: 3,
      skills: ['backend', 'data'],
    },
    'data-import': {
      title: '数据导入导出功能',
      type: 'feature',
      hours: 2,
      skills: ['backend', 'data'],
    },
    notification: {
      title: '通知功能开发',
      type: 'feature',
      hours: 2,
      skills: ['backend', 'integration'],
    },
    search: {
      title: '搜索功能开发',
      type: 'feature',
      hours: 3,
      skills: ['backend', 'search'],
    },
    dashboard: {
      title: '仪表板功能开发',
      type: 'feature',
      hours: 4,
      skills: ['frontend', 'data-viz'],
    },
    integration: {
      title: '第三方集成开发',
      type: 'feature',
      hours: 4,
      skills: ['integration', 'api'],
    },
  };

  const config = componentConfig[component];
  if (!config) {
    return null;
  }

  return {
    title: config.title,
    description: `实现${component}相关功能`,
    type: config.type,
    estimatedHours: config.hours,
    requiredSkills: config.skills,
    dependencies: ['技术方案设计'],
  };
}

/**
 * 分析依赖关系
 */
function analyzeDependencies(
  tasks: Array<RequirementDecompositionOutput['subTasks'][number]>
): void {
  // 建立任务标题到索引的映射
  const titleToIndex = new Map<string, number>();
  tasks.forEach((task, index) => {
    titleToIndex.set(task.title, index);
  });

  // 验证依赖是否指向存在的任务
  for (const task of tasks) {
    task.dependencies = task.dependencies.filter((dep) => titleToIndex.has(dep));
  }
}

/**
 * 生成建议执行顺序
 */
function generateSuggestedOrder(
  tasks: Array<RequirementDecompositionOutput['subTasks'][number]>
): string[] {
  const order: string[] = [];
  const visited = new Set<number>();

  // 拓扑排序
  function visit(index: number): void {
    if (visited.has(index)) {
      return;
    }

    const task = tasks[index];

    // 先访问依赖
    for (const depTitle of task.dependencies) {
      const depIndex = tasks.findIndex((t) => t.title === depTitle);
      if (depIndex >= 0) {
        visit(depIndex);
      }
    }

    visited.add(index);
    order.push(task.title);
  }

  // 从没有依赖的任务开始
  tasks.forEach((_, index) => {
    if (!visited.has(index)) {
      visit(index);
    }
  });

  return order;
}

/**
 * 识别风险
 */
function identifyRisks(
  requirement: string,
  tasks: Array<RequirementDecompositionOutput['subTasks'][number]>,
  complexity: { score: number; factors: string[] }
): string[] {
  const risks: string[] = [];

  // 复杂度风险
  if (complexity.score >= 7) {
    risks.push('需求复杂度较高，建议分阶段实施');
  }

  // 工作量风险
  const totalHours = tasks.reduce((sum, t) => sum + t.estimatedHours, 0);
  if (totalHours > 20) {
    risks.push(`总工作量较大（${totalHours}小时），建议拆分为多个迭代`);
  }

  // 依赖风险
  const tasksWithDeps = tasks.filter((t) => t.dependencies.length > 0).length;
  if (tasksWithDeps > tasks.length / 2) {
    risks.push('任务间依赖较多，需要注意协调');
  }

  // 技术风险关键词
  const riskKeywords = ['migration', 'legacy', 'compatibility', '性能', '并发', '安全'];
  for (const keyword of riskKeywords) {
    if (requirement.toLowerCase().includes(keyword.toLowerCase())) {
      risks.push(`需求涉及"${keyword}"，存在技术风险`);
      break;
    }
  }

  return risks;
}

/**
 * 默认导出
 */
export default RequirementDecompositionSkill;
