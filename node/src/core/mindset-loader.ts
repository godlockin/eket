/**
 * EKET Framework - Mindset Loader
 * Version: 3.0.0
 *
 * 加载 Master/Slaver 思维模板并注入到系统提示词
 * 让实例启动时自动按范式工作
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * 思维模板缓存
 */
const mindsetCache = new Map<'master' | 'slaver', string>();

/**
 * 思维模板路径
 */
const MINDSET_PATHS = {
  master: '.eket/templates/master-workflow.md',
  slaver: '.eket/templates/slaver-workflow.md',
};

/**
 * 思维模板上下文变量
 */
export interface MindsetContext {
  start_time: string;
  instance_id: string;
  agent_type?: string;
  task_id?: string;
  profile?: string;
}

/**
 * 加载思维模板
 *
 * @param role - 'master' 或 'slaver'
 * @param context - 上下文变量
 * @returns 渲染后的思维模板
 */
export async function loadMindset(
  role: 'master' | 'slaver',
  context: MindsetContext
): Promise<string> {
  // 检查缓存
  if (mindsetCache.has(role)) {
    const cached = mindsetCache.get(role)!;
    return renderTemplate(cached, context);
  }

  // 读取模板文件
  const templatePath = path.join(process.cwd(), MINDSET_PATHS[role]);

  if (!fs.existsSync(templatePath)) {
    console.warn(`Mindset template not found: ${templatePath}`);
    console.warn('Falling back to default behavior');
    return '';
  }

  const template = await fs.promises.readFile(templatePath, 'utf-8');
  mindsetCache.set(role, template);

  return renderTemplate(template, context);
}

/**
 * 渲染模板变量
 */
function renderTemplate(template: string, context: MindsetContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = (context as Record<string, unknown>)[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * 生成实例 ID
 */
export function generateInstanceId(): string {
  const hostname = process.env.HOSTNAME || 'localhost';
  const pid = process.pid;
  const timestamp = Date.now();
  return `eket_${hostname}_${pid}_${timestamp}`;
}

/**
 * 构建 Master 思维上下文
 */
export function buildMasterContext(): MindsetContext {
  return {
    start_time: new Date().toISOString(),
    instance_id: generateInstanceId(),
  };
}

/**
 * 构建 Slaver 思维上下文
 */
export function buildSlaverContext(agentType?: string, taskId?: string): MindsetContext {
  return {
    start_time: new Date().toISOString(),
    instance_id: generateInstanceId(),
    agent_type: agentType,
    task_id: taskId,
  };
}

/**
 * 注入思维模板到系统提示词
 *
 * 这个函数需要在 AI Agent 初始化时调用
 * 具体实现取决于使用的 AI 平台 API
 */
export function injectSystemPrompt(mindset: string): void {
  // 将思维模板追加到系统提示词
  // 在实际 AI 平台中，这里需要调用相应的 API
  // 例如：Anthropic API 的 system prompt 参数

  console.log('System prompt injected:');
  console.log(mindset.substring(0, 500) + '...');
}

/**
 * 预加载思维模板 (可选优化)
 *
 * 在应用启动时预加载，避免首次使用时 IO 延迟
 */
export async function preloadMindsets(): Promise<void> {
  const context = buildMasterContext();

  try {
    await loadMindset('master', context);
    await loadMindset('slaver', context);
    console.log('Mindsets preloaded successfully');
  } catch (error) {
    console.warn('Mindset preload failed:', error);
  }
}
