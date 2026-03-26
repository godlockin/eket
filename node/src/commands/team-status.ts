/**
 * Team Status Command
 * 显示所有 Instance 的状态，按角色分组显示，显示负载情况
 */

import { Command } from 'commander';
import { createInstanceRegistry } from '../core/instance-registry.js';
import type { Instance } from '../types/index.js';

/**
 * 格式化 Instance 状态显示
 */
function formatInstance(instance: Instance): string {
  const statusIcon = getStatusIcon(instance.status);
  const controllerIcon = instance.type === 'human' ? '👤' : '🤖';
  const loadBar = getLoadBar(instance.currentLoad || 0);

  return `  ${statusIcon} ${controllerIcon} ${instance.id}
     角色：${instance.agent_type} | 负载：${loadBar}
     当前任务：${instance.currentTaskId || '-'}
     最后心跳：${formatTimestamp(instance.lastHeartbeat)}`;
}

/**
 * 获取状态图标
 */
function getStatusIcon(status: Instance['status']): string {
  switch (status) {
    case 'idle':
      return '🟢';
    case 'busy':
      return '🔴';
    case 'offline':
      return '⚫';
    default:
      return '🟡';
  }
}

/**
 * 获取负载条
 */
function getLoadBar(load: number): string {
  const bars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const index = Math.min(load, bars.length - 1);
  return bars[index].repeat(Math.min(load, 5)) + (load > 5 ? `+${load - 5}` : '');
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return '从未';
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return date.toLocaleString();
}

/**
 * 注册 team-status 命令
 */
export function registerTeamStatus(program: Command): void {
  program
    .command('team:status')
    .description('显示团队 Instance 状态')
    .option('-r, --role <role>', '按角色过滤')
    .option('-t, --type <type>', '按控制器类型过滤 (human/ai)')
    .option('-s, --status <status>', '按状态过滤 (idle/busy/offline)')
    .action(async (options) => {
      console.log('\n=== EKET 团队状态 ===\n');

      const registry = createInstanceRegistry();
      const connectResult = await registry.connect();

      if (!connectResult.success) {
        console.error('连接注册表失败:', connectResult.error.message);
        process.exit(1);
      }

      try {
        // 获取所有活跃 Instance
        const result = await registry.getActiveInstances();

        if (!result.success) {
          console.error('获取 Instance 列表失败:', result.error.message);
          return;
        }

        let instances = result.data;

        // 按选项过滤
        if (options.role) {
          instances = instances.filter((inst) => inst.agent_type === options.role);
        }
        if (options.type) {
          instances = instances.filter((inst) => inst.type === options.type);
        }
        if (options.status) {
          instances = instances.filter((inst) => inst.status === options.status);
        }

        if (instances.length === 0) {
          console.log('暂无活跃 Instance');
          return;
        }

        // 按角色分组
        const byRole = new Map<string, Instance[]>();
        for (const inst of instances) {
          const group = byRole.get(inst.agent_type) || [];
          group.push(inst);
          byRole.set(inst.agent_type, group);
        }

        // 显示统计
        console.log(`总实例数：${instances.length}`);
        console.log(`  - AI 控制：${instances.filter((i) => i.type === 'ai').length}`);
        console.log(`  - 人类控制：${instances.filter((i) => i.type === 'human').length}`);
        console.log();

        // 按角色显示
        for (const [role, roleInstances] of byRole.entries()) {
          console.log(`\n【${role}】(${roleInstances.length} 个实例)`);
          console.log('─'.repeat(50));

          // 按状态排序：idle > busy > offline
          const sorted = roleInstances.sort((a, b) => {
            const order = { idle: 0, busy: 1, offline: 2 };
            return order[a.status] - order[b.status];
          });

          for (const inst of sorted) {
            console.log(formatInstance(inst));
            console.log();
          }
        }

        // 负载统计
        console.log('\n=== 负载统计 ===');
        const totalLoad = instances.reduce((sum, inst) => sum + (inst.currentLoad || 0), 0);
        const avgLoad = instances.length > 0 ? (totalLoad / instances.length).toFixed(2) : '0';
        console.log(`总负载：${totalLoad}`);
        console.log(`平均负载：${avgLoad}`);
        console.log(`空闲实例：${instances.filter((i) => i.status === 'idle').length}`);
        console.log(`忙碌实例：${instances.filter((i) => i.status === 'busy').length}`);

      } finally {
        await registry.disconnect();
      }
    });
}
