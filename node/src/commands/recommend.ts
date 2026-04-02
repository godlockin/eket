/**
 * Recommend Command
 * 智能任务推荐系统
 *
 * Phase 5.2 - Intelligent Task Recommendation System
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';

import { createInstanceRegistry } from '../core/instance-registry.js';
import { createRecommender } from '../core/recommender.js';
import type { Ticket, Instance } from '../types/index.js';
import type { Recommendation } from '../types/recommender.js';
import { findProjectRoot } from '../utils/process-cleanup.js';

interface RecommendOptions {
  instance?: string;
  task?: string;
  limit?: number;
  detail?: boolean;
  all?: boolean;
}

/**
 * 从 Jira 目录加载任务
 */
async function loadTasks(projectRoot: string): Promise<Ticket[]> {
  const jiraPath = path.join(projectRoot, 'jira', 'tickets');
  const dirs = ['feature', 'bugfix', 'task', 'improvement'];
  const tickets: Ticket[] = [];

  for (const dir of dirs) {
    const dirPath = path.join(jiraPath, dir);
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const ticket = parseTicketFile(path.join(dirPath, file));
      if (ticket) {
        tickets.push(ticket);
      }
    }
  }

  // 按优先级排序
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3,
  };

  tickets.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));

  return tickets;
}

/**
 * 解析任务文件
 */
function parseTicketFile(filePath: string): Ticket | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    const ticket: Partial<Ticket> = {
      id: path.basename(filePath, '.md'),
      priority: 'normal',
      tags: [],
      status: 'backlog',
    };

    for (const line of lines) {
      // 解析标题
      if (line.startsWith('# ')) {
        ticket.title = line.replace(/^# /, '').trim();
      }

      // 解析优先级
      if (line.toLowerCase().includes('优先级:') || line.toLowerCase().includes('priority:')) {
        const match = line.match(/(urgent|high|normal|low)/i);
        if (match) {
          ticket.priority = match[1].toLowerCase() as Ticket['priority'];
        }
      }

      // 解析标签
      if (line.toLowerCase().includes('标签:') || line.toLowerCase().includes('tags:')) {
        const tagsPart = line.split(/标签:|tags:/i)[1];
        if (tagsPart) {
          ticket.tags = tagsPart
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean);
        }
      }

      // 解析状态
      if (line.toLowerCase().includes('状态:') || line.toLowerCase().includes('status:')) {
        const match = line.match(/状态:\s*(\w+)/i) || line.match(/status:\s*(\w+)/i);
        if (match) {
          ticket.status = match[1];
        }
      }

      // 解析所需角色
      if (line.toLowerCase().includes('角色:') || line.toLowerCase().includes('role:')) {
        const match = line.match(/角色:\s*(\w+)/i) || line.match(/role:\s*(\w+)/i);
        if (match) {
          ticket.required_role = match[1] as Ticket['required_role'];
        }
      }
    }

    // 如果没有标题，使用 ID
    if (!ticket.title) {
      ticket.title = ticket.id;
    }

    return ticket as Ticket;
  } catch {
    return null;
  }
}

/**
 * 格式化推荐结果
 */
function formatRecommendation(
  rec: Recommendation,
  tasks: Ticket[],
  instances: Instance[],
  showDetail: boolean
): string {
  const task = tasks.find((t) => t.id === rec.taskId);
  const instance = instances.find((i) => i.id === rec.instanceId);

  let output = `\n推荐 ${task?.id || rec.taskId} → ${instance?.id || rec.instanceId}`;
  output += `\n  综合分数：${(rec.score * 100).toFixed(1)}`;

  if (showDetail) {
    output += '\n  分解:';
    output += `\n    - 技能匹配：${(rec.factors.skillMatch * 100).toFixed(0)}%`;
    output += `\n    - 历史表现：${(rec.factors.historicalPerformance * 100).toFixed(0)}%`;
    output += `\n    - 负载平衡：${(rec.factors.workloadBalance * 100).toFixed(0)}%`;
    output += `\n    - 优先级加成：${(rec.factors.priorityBonus * 100).toFixed(0)}%`;

    if (rec.reasons.length > 0) {
      output += '\n  原因:';
      rec.reasons.forEach((reason) => {
        output += `\n    - ${reason}`;
      });
    }
  }

  return output;
}

/**
 * 注册 recommend 命令
 */
export function registerRecommend(program: Command): void {
  program
    .command('recommend')
    .description('智能推荐任务或 Instance')
    .option('-i, --instance <id>', '为指定 Instance 推荐任务')
    .option('-t, --task <id>', '为指定任务推荐 Instance')
    .option('-l, --limit <number>', '限制推荐数量', '10')
    .option('-d, --detail', '显示详细信息', false)
    .option('-a, --all', '为所有可用 Instance 推荐', false)
    .action(async (options: RecommendOptions) => {
      console.log('\n=== 智能任务推荐 ===\n');

      // 1. 查找项目根目录
      const projectRoot = await findProjectRoot();
      if (!projectRoot) {
        console.error('错误：未找到 EKET 项目');
        process.exit(1);
      }

      // 2. 加载任务
      console.log('加载任务列表...');
      const tasks = await loadTasks(projectRoot);
      if (tasks.length === 0) {
        console.log('当前没有任务');
        return;
      }
      console.log(`已加载 ${tasks.length} 个任务`);

      // 3. 初始化组件
      const registry = createInstanceRegistry();
      const recommender = createRecommender();

      const connectResult = await recommender.initialize();
      if (!connectResult.success) {
        console.error('初始化推荐引擎失败:', connectResult.error.message);
        await registry.disconnect();
        return;
      }

      try {
        // 4. 获取 Instances
        console.log('获取 Instance 列表...');
        const instancesResult = await registry.getActiveInstances();
        if (!instancesResult.success) {
          console.error('获取 Instance 列表失败:', instancesResult.error.message);
          return;
        }

        const instances = instancesResult.data;
        console.log(`已获取 ${instances.length} 个活跃 Instance`);

        if (instances.length === 0) {
          console.log('暂无活跃 Instance');
          return;
        }

        // 5. 根据选项执行推荐
        const limit = parseInt(String(options.limit) || '10', 10);
        const showDetail = options.detail || false;

        if (options.instance) {
          // 为指定 Instance 推荐
          console.log(`\n为 Instance "${options.instance}" 推荐任务...`);
          const result = await recommender.recommendForInstance(options.instance, tasks, limit);

          if (!result.success) {
            console.error('推荐失败:', result.error.message);
            return;
          }

          console.log(formatRecommendations(result.data, tasks, instances, showDetail));
        } else if (options.task) {
          // 为指定任务推荐 Instance
          console.log(`\n为任务 "${options.task}" 推荐 Instance...`);
          const result = await recommender.recommendForTask(options.task, instances, limit);

          if (!result.success) {
            console.error('推荐失败:', result.error.message);
            return;
          }

          console.log(formatRecommendations(result.data, tasks, instances, showDetail));
        } else if (options.all) {
          // 为所有 Instance 推荐
          console.log('\n为所有 Instance 推荐任务...\n');
          const result = await recommender.recommendAll(tasks, instances);

          if (!result.success) {
            console.error('推荐失败:', result.error.message);
            return;
          }

          // 按 Instance 分组显示
          const byInstance = new Map<string, Recommendation[]>();
          for (const rec of result.data) {
            const recs = byInstance.get(rec.instanceId) || [];
            recs.push(rec);
            byInstance.set(rec.instanceId, recs);
          }

          for (const [instanceId, recs] of byInstance) {
            const instance = instances.find((i) => i.id === instanceId);
            console.log(
              `\n[${instanceId}] ${instance?.agent_type || 'unknown'} (负载：${instance?.currentLoad || 0})`
            );
            const topRecs = recs.slice(0, 5);
            console.log(formatRecommendations(topRecs, tasks, instances, showDetail));
          }
        } else {
          // 显示推荐概述
          console.log('\n=== 推荐系统概述 ===\n');
          console.log(`任务总数：${tasks.length}`);
          console.log(`Instance 总数：${instances.length}`);
          console.log(`可用 Instance: ${instances.filter((i) => i.status === 'idle').length}`);
          console.log('\n使用以下命令获取推荐:');
          console.log('  eket-cli recommend -i <instance-id>  # 为 Instance 推荐任务');
          console.log('  eket-cli recommend -t <task-id>      # 为任务推荐 Instance');
          console.log('  eket-cli recommend -a                # 为所有 Instance 推荐');
          console.log('  eket-cli recommend -d                # 显示详细信息');
        }
      } finally {
        await recommender.shutdown();
        await registry.disconnect();
      }

      console.log('\n✓ 推荐完成\n');
    });
}

/**
 * 格式化多个推荐结果
 */
function formatRecommendations(
  recommendations: Recommendation[],
  tasks: Ticket[],
  instances: Instance[],
  showDetail: boolean
): string {
  if (recommendations.length === 0) {
    return '\n暂无推荐';
  }

  let output = `\n找到 ${recommendations.length} 条推荐:`;
  output += '\n' + '='.repeat(50);

  recommendations.forEach((rec, index) => {
    output += `\n\n[${index + 1}]`;
    output += formatRecommendation(rec, tasks, instances, showDetail);
  });

  return output;
}
