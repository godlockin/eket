/**
 * Dependency Analyze Command
 * 任务依赖分析命令
 */

import { Command } from 'commander';

import { createDependencyAnalyzer, type CriticalPath } from '../core/dependency-analyzer.js';

/**
 * 注册依赖分析命令
 */
export function registerDependencyAnalyze(program: Command): void {
  program
    .command('dependency:analyze')
    .description('分析任务依赖关系')
    .option('-p, --project-root <path>', '项目根目录', process.cwd())
    .option('--mermaid', '输出 Mermaid 格式图表')
    .option('--critical-path', '分析关键路径')
    .option('--check-cycles', '检测循环依赖')
    .action(async (options) => {
      const projectRoot = options.projectRoot;
      const ticketsDir = `${projectRoot}/jira/tickets`;

      console.log('\n=== 任务依赖分析 ===\n');

      // 创建分析器
      const analyzer = createDependencyAnalyzer(ticketsDir);

      // 构建依赖图
      console.log('正在构建依赖图...');
      const graphResult = await analyzer.buildDependencyGraph();

      if (!graphResult.success) {
        console.error('构建依赖图失败:', graphResult.error.message);
        process.exit(1);
      }

      const graph = graphResult.data;
      console.log(`✓ 已加载 ${graph.nodes.size} 个任务`);
      console.log(`✓ 已识别 ${graph.edges.length} 个依赖关系\n`);

      // 输出 Mermaid 图表
      if (options.mermaid) {
        const mermaidResult = await analyzer.generateMermaidDiagram();
        if (mermaidResult.success) {
          console.log('=== Mermaid 依赖图 ===\n');
          console.log(mermaidResult.data);
          console.log('\n====================\n');
        }
      }

      // 检测循环依赖
      if (options.checkCycles) {
        console.log('正在检测循环依赖...');
        const cycleResult = analyzer.detectCycle(graph);
        if (cycleResult.success) {
          if (cycleResult.data.hasCycle) {
            console.error('✗ 发现循环依赖:');
            cycleResult.data.cycle?.forEach((taskId, index) => {
              console.error(`  ${index + 1}. ${taskId}`);
            });
            process.exit(1);
          } else {
            console.log('✓ 未发现循环依赖');
          }
        }
        console.log('');
      }

      // 分析关键路径
      if (options.criticalPath) {
        console.log('正在分析关键路径...');
        // 为每个任务估算工时（默认 4 小时）
        const estimates = new Map<string, number>();
        for (const [id, node] of graph.nodes) {
          // 根据优先级估算工时
          const priority = node.priority.toLowerCase();
          const estimate =
            priority === 'urgent' ? 2 : priority === 'high' ? 4 : priority === 'low' ? 8 : 6;
          estimates.set(id, estimate);
        }

        const criticalPathResult = analyzer.analyzeCriticalPath(graph, estimates);
        if (criticalPathResult.success) {
          const criticalPath: CriticalPath = criticalPathResult.data;
          console.log('✓ 关键路径分析完成');
          console.log(`  路径长度：${criticalPath.path.length} 个任务`);
          console.log(`  预计总工时：${criticalPath.totalDuration} 小时`);
          console.log('\n  关键路径上的任务:');
          criticalPath.path.forEach((taskId, index) => {
            const node = graph.nodes.get(taskId);
            console.log(`    ${index + 1}. ${taskId} - ${node?.title || 'Unknown'}`);
          });
          console.log('\n  阻塞任务 (影响后续进度):');
          criticalPath.blockingTasks.forEach((taskId) => {
            const node = graph.nodes.get(taskId);
            console.log(`    - ${taskId} - ${node?.title || 'Unknown'}`);
          });
        } else {
          console.error('关键路径分析失败:', criticalPathResult.error.message);
        }
        console.log('');
      }

      // 显示阻塞任务
      const blockedTasks: string[] = [];
      for (const [id, node] of graph.nodes) {
        if (node.status === 'blocked' || node.status === 'in_progress') {
          const blockingResult = await analyzer.getBlockingTasks(id);
          if (blockingResult.success && blockingResult.data.length > 0) {
            blockedTasks.push(id);
            console.log(`任务 ${id} 被以下任务阻塞:`);
            blockingResult.data.forEach((blockingTaskId) => {
              const blockingNode = graph.nodes.get(blockingTaskId);
              console.log(
                `  - ${blockingTaskId}: ${blockingNode?.title || 'Unknown'} (${blockingNode?.status || 'unknown'})`
              );
            });
          }
        }
      }

      if (blockedTasks.length === 0) {
        console.log('✓ 当前无阻塞任务');
      }

      console.log('');
    });
}
