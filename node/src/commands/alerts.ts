/**
 * Alerts Status Command
 * 告警系统状态查询命令
 */

import { Command } from 'commander';

import { createAlertingSystem } from '../core/alerting.js';
import type { AlertStats, Alert } from '../core/alerting.js';

/**
 * 注册告警命令
 */
export function registerAlerts(program: Command): void {
  // alerts:status - 查看告警状态
  program
    .command('alerts:status')
    .description('查看告警系统状态')
    .option('-p, --project-root <path>', '项目根目录', process.cwd())
    .option('--active', '仅显示活跃告警')
    .option('--stats', '显示统计信息')
    .action(async (options) => {
      const projectRoot = options.projectRoot;
      const alertsDir = `${projectRoot}/.eket/alerts`;

      console.log('\n=== 告警系统状态 ===\n');

      // 创建告警系统
      const alerting = createAlertingSystem({
        alertsDir,
        config: {},
      });

      // 显示统计信息
      if (options.stats || !options.active) {
        const stats: AlertStats = alerting.getStats();
        console.log('【统计信息】');
        console.log(`  总告警数：${stats.total}`);
        console.log(`  过去 24 小时：${stats.last24Hours}`);
        console.log('\n  按级别:');
        console.log(`    Info: ${stats.byLevel.info}`);
        console.log(`    Warning: ${stats.byLevel.warning}`);
        console.log(`    Error: ${stats.byLevel.error}`);
        console.log(`    Critical: ${stats.byLevel.critical}`);
        console.log('\n  按状态:');
        console.log(`    New: ${stats.byStatus.new}`);
        console.log(`    Acknowledged: ${stats.byStatus.acknowledged}`);
        console.log(`    Resolved: ${stats.byStatus.resolved}`);
        console.log(`    Escalated: ${stats.byStatus.escalated}`);
        console.log('');
      }

      // 显示活跃告警
      if (options.active || !options.stats) {
        const activeAlerts: Alert[] = alerting.getActiveAlerts();
        if (activeAlerts.length === 0) {
          console.log('✓ 无活跃告警');
        } else {
          console.log('【活跃告警】');
          activeAlerts.forEach((alert) => {
            const levelIcon = getLevelIcon(alert.level);
            const statusIcon = getStatusIcon(alert.status);
            const timeAgo = formatTimeAgo(alert.createdAt);
            console.log(`  ${levelIcon} ${statusIcon} ${alert.id}`);
            console.log(`     级别：${alert.level.toUpperCase()}`);
            console.log(`     标题：${alert.title}`);
            console.log(`     时间：${timeAgo}`);
            if (alert.acknowledgedBy) {
              console.log(`     确认人：${alert.acknowledgedBy}`);
            }
            console.log('');
          });
        }
      }

      console.log('');
    });

  // alerts:acknowledge - 确认告警
  program
    .command('alerts:acknowledge <alertId>')
    .description('确认告警')
    .option('-u, --user <userId>', '用户 ID')
    .action((alertId, options) => {
      const userId = options.user || 'unknown';
      const projectRoot = process.cwd();
      const alertsDir = `${projectRoot}/.eket/alerts`;

      const alerting = createAlertingSystem({
        alertsDir,
        config: {},
      });

      const result = alerting.acknowledge(alertId, userId);
      if (result.success) {
        console.log(`✓ 告警 ${alertId} 已确认`);
      } else {
        console.error('确认失败:', result.error.message);
        process.exit(1);
      }
    });

  // alerts:resolve - 解决告警
  program
    .command('alerts:resolve <alertId>')
    .description('解决告警')
    .option('-u, --user <userId>', '用户 ID')
    .action((alertId, options) => {
      const userId = options.user || 'unknown';
      const projectRoot = process.cwd();
      const alertsDir = `${projectRoot}/.eket/alerts`;

      const alerting = createAlertingSystem({
        alertsDir,
        config: {},
      });

      const result = alerting.resolve(alertId, userId);
      if (result.success) {
        console.log(`✓ 告警 ${alertId} 已解决`);
      } else {
        console.error('解决失败:', result.error.message);
        process.exit(1);
      }
    });
}

/**
 * 获取告警级别图标
 */
function getLevelIcon(level: string): string {
  const icons: Record<string, string> = {
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
    critical: '🚨',
  };
  return icons[level] || '•';
}

/**
 * 获取告警状态图标
 */
function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    new: '🆕',
    acknowledged: '👁️',
    resolved: '✅',
    escalated: '⬆️',
  };
  return icons[status] || '•';
}

/**
 * 格式化时间
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) {
    return '刚刚';
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }
  if (hours < 24) {
    return `${hours} 小时前`;
  }
  return `${days} 天前`;
}
