/**
 * Dependency Analyzer Module
 * 任务依赖分析和可视化
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../types/index.js';
import { EketErrorCode, EketErrorClass } from '../types/index.js';

/**
 * 依赖关系类型
 */
export type DependencyType =
  | 'blocks'          // 阻塞：A 完成前 B 不能开始
  | 'relates'         // 关联：A 和 B 相关
  | 'duplicates'      // 重复：A 和 B 是重复任务
  | 'prerequisite'    // 前置：A 是 B 的前置条件
  | 'successor';      // 后置：A 是 B 的后置任务

/**
 * 依赖关系
 */
export interface Dependency {
  from: string;       // 源任务 ID
  to: string;         // 目标任务 ID
  type: DependencyType;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * 任务节点
 */
export interface TaskNode {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee?: string;
  dependencies: string[];  // 依赖的任务 ID 列表
  dependents: string[];    // 依赖此任务的 ID 列表
}

/**
 * 依赖图
 */
export interface DependencyGraph {
  nodes: Map<string, TaskNode>;
  edges: Dependency[];
}

/**
 * 关键路径分析结果
 */
export interface CriticalPath {
  path: string[];       // 关键路径上的任务 ID
  totalDuration: number; // 总预计时长
  blockingTasks: string[]; // 阻塞任务
}

/**
 * 依赖分析器
 */
export class DependencyAnalyzer {
  private ticketsDir: string;

  constructor(ticketsDir: string) {
    this.ticketsDir = ticketsDir;
  }

  /**
   * 解析所有任务并构建依赖图
   */
  async buildDependencyGraph(): Promise<Result<DependencyGraph>> {
    try {
      const nodes = new Map<string, TaskNode>();
      const edges: Dependency[] = [];

      // 读取所有任务文件
      const taskFiles = await this.readAllTaskFiles();

      // 解析每个任务
      for (const task of taskFiles) {
        const node: TaskNode = {
          id: String(task.id),
          title: String(task.title || ''),
          status: String(task.status || 'backlog'),
          priority: String(task.priority || 'medium'),
          assignee: task.assignee ? String(task.assignee) : undefined,
          dependencies: Array.isArray(task.dependencies) ? task.dependencies.map(String) : [],
          dependents: [],
        };
        nodes.set(node.id, node);
      }

      // 构建反向依赖（dependents）
      for (const [id, node] of nodes) {
        for (const depId of node.dependencies) {
          const depNode = nodes.get(depId);
          if (depNode) {
            depNode.dependents.push(id);
            edges.push({
              from: depId,
              to: id,
              type: 'blocks',
              createdAt: Date.now(),
            });
          }
        }
      }

      return {
        success: true,
        data: { nodes, edges },
      };
    } catch (error) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.DEPENDENCY_ANALYSIS_FAILED,
          `构建依赖图失败：${error instanceof Error ? error.message : '未知错误'}`
        ),
      };
    }
  }

  /**
   * 检测循环依赖
   */
  detectCycle(graph: DependencyGraph): Result<{ hasCycle: boolean; cycle?: string[] }> {
    try {
      const visited = new Set<string>();
      const recursionStack = new Set<string>();
      const cycle: string[] = [];

      const dfs = (nodeId: string): boolean => {
        visited.add(nodeId);
        recursionStack.add(nodeId);

        const node = graph.nodes.get(nodeId);
        if (!node) return false;

        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recursionStack.has(depId)) {
            cycle.push(depId, nodeId);
            return true;
          }
        }

        recursionStack.delete(nodeId);
        return false;
      };

      for (const nodeId of graph.nodes.keys()) {
        if (!visited.has(nodeId)) {
          if (dfs(nodeId)) {
            return {
              success: true,
              data: { hasCycle: true, cycle },
            };
          }
        }
      }

      return {
        success: true,
        data: { hasCycle: false },
      };
    } catch (error) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.DEPENDENCY_ANALYSIS_FAILED,
          `检测循环依赖失败：${error instanceof Error ? error.message : '未知错误'}`
        ),
      };
    }
  }

  /**
   * 分析关键路径
   */
  analyzeCriticalPath(graph: DependencyGraph, estimates: Map<string, number>): Result<CriticalPath> {
    try {
      // 找到所有没有依赖的任务（起点）
      const startNodes: string[] = [];
      for (const [id, node] of graph.nodes) {
        if (node.dependencies.length === 0) {
          startNodes.push(id);
        }
      }

      // 使用 DFS 找到最长路径
      const longestPath: string[] = [];
      let maxDuration = 0;

      const dfs = (nodeId: string, path: string[], duration: number) => {
        const node = graph.nodes.get(nodeId);
        if (!node) return;

        const nodeDuration = estimates.get(nodeId) || 4; // 默认 4 小时
        const newDuration = duration + nodeDuration;
        const newPath = [...path, nodeId];

        // 如果没有后置任务，更新最长路径
        if (node.dependents.length === 0) {
          if (newDuration > maxDuration) {
            maxDuration = newDuration;
            longestPath.length = 0;
            longestPath.push(...newPath);
          }
        }

        // 继续遍历后置任务
        for (const dependentId of node.dependents) {
          dfs(dependentId, newPath, newDuration);
        }
      };

      for (const startId of startNodes) {
        dfs(startId, [], 0);
      }

      // 识别阻塞任务（关键路径上的任务）
      const blockingTasks = longestPath.filter(id => {
        const node = graph.nodes.get(id);
        return node && node.dependents.length > 0;
      });

      return {
        success: true,
        data: {
          path: longestPath,
          totalDuration: maxDuration,
          blockingTasks,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.DEPENDENCY_ANALYSIS_FAILED,
          `分析关键路径失败：${error instanceof Error ? error.message : '未知错误'}`
        ),
      };
    }
  }

  /**
   * 获取阻塞当前任务的依赖
   */
  async getBlockingTasks(taskId: string): Promise<Result<string[]>> {
    try {
      const graphResult = await this.buildDependencyGraph();
      if (!graphResult.success) return graphResult;

      const graph = graphResult.data;
      const node = graph.nodes.get(taskId);

      if (!node) {
        return {
          success: false,
          error: new EketErrorClass(
            EketErrorCode.TASK_NOT_FOUND,
            `任务不存在：${taskId}`
          ),
        };
      }

      const blockingTasks: string[] = [];
      for (const depId of node.dependencies) {
        const depNode = graph.nodes.get(depId);
        if (depNode && depNode.status !== 'done') {
          blockingTasks.push(depId);
        }
      }

      return {
        success: true,
        data: blockingTasks,
      };
    } catch (error) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.DEPENDENCY_ANALYSIS_FAILED,
          `获取阻塞任务失败：${error instanceof Error ? error.message : '未知错误'}`
        ),
      };
    }
  }

  /**
   * 生成依赖可视化（Mermaid 格式）
   */
  async generateMermaidDiagram(): Promise<Result<string>> {
    try {
      const graphResult = await this.buildDependencyGraph();
      if (!graphResult.success) return graphResult;

      const graph = graphResult.data;

      let mermaid = 'graph TD\n';

      // 生成节点
      for (const [id, node] of graph.nodes) {
        const statusIcon = this.getStatusIcon(node.status);
        mermaid += `  ${id.replace(/-/g, '_')}["${id}${statusIcon}"]\n`;
      }

      // 生成边
      for (const edge of graph.edges) {
        const fromId = edge.from.replace(/-/g, '_');
        const toId = edge.to.replace(/-/g, '_');
        mermaid += `  ${fromId} --> ${toId}\n`;
      }

      return {
        success: true,
        data: mermaid,
      };
    } catch (error) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.DEPENDENCY_ANALYSIS_FAILED,
          `生成依赖图失败：${error instanceof Error ? error.message : '未知错误'}`
        ),
      };
    }
  }

  /**
   * 读取所有任务文件
   */
  private async readAllTaskFiles(): Promise<Array<Record<string, unknown>>> {
    const tasks: Array<Record<string, unknown>> = [];
    const categories = ['feature', 'task', 'bugfix', 'fix', 'improvement'];

    for (const category of categories) {
      const categoryDir = path.join(this.ticketsDir, category);
      if (!fs.existsSync(categoryDir)) continue;

      const files = fs.readdirSync(categoryDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

      for (const file of files) {
        const filePath = path.join(categoryDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const task = this.parseYaml(content);
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * 简单的 YAML 解析（用于任务文件）
   */
  private parseYaml(content: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = content.split('\n');

    let currentKey = '';
    let currentArray: string[] = [];
    let inArray = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 检查是否是数组项
      if (trimmed.startsWith('- ')) {
        if (inArray) {
          currentArray.push(trimmed.substring(2).trim());
        }
        continue;
      }

      // 保存之前的数组
      if (inArray && currentKey) {
        result[currentKey] = currentArray;
        inArray = false;
        currentArray = [];
      }

      // 解析键值对
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (value === '') {
          // 可能是数组或对象
          currentKey = key;
          inArray = true;
        } else {
          result[key] = value.replace(/["']/g, '');
        }
      }
    }

    // 保存最后一个数组
    if (inArray && currentKey) {
      result[currentKey] = currentArray;
    }

    return result;
  }

  /**
   * 获取状态图标
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      'done': ' ✓',
      'in_progress': ' ⏳',
      'review': ' 🔍',
      'ready': ' ✓',
      'blocked': ' ⛔',
    };
    return icons[status] || '';
  }
}

/**
 * 创建依赖分析器实例
 */
export function createDependencyAnalyzer(ticketsDir: string): DependencyAnalyzer {
  return new DependencyAnalyzer(ticketsDir);
}
