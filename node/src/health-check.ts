/**
 * Health Check Script
 *
 * 用于 Docker HEALTHCHECK 指令和 HTTP 健康检查端点
 *
 * 功能：
 * - 检查 Redis 连接状态
 * - 检查 SQLite 连接状态
 * - 报告内存使用情况
 * - 报告运行时间
 * - 返回适当的退出码（0=健康，1=不健康）
 */

import { createRedisClient } from './core/redis-client.js';
import { createSQLiteManager } from './core/sqlite-manager.js';

// 服务启动时间
const startTime = Date.now();

/**
 * 获取进程运行时间（秒）
 */
export function getUptime(): number {
  return Math.floor((Date.now() - startTime) / 1000);
}

/**
 * 获取内存使用情况
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  usagePercent: number;
} {
  const memUsage = process.memoryUsage();
  return {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024), // MB
    usagePercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
  };
}

/**
 * 检查 Redis 连接
 */
export async function checkRedis(): Promise<{
  healthy: boolean;
  message: string;
  latency?: number;
}> {
  const client = createRedisClient();

  try {
    const start = Date.now();
    const connectResult = await client.connect();

    if (!connectResult.success) {
      return {
        healthy: false,
        message: `Redis 连接失败：${connectResult.error?.message}`,
      };
    }

    // Ping 测试
    await client.ping();
    const latency = Date.now() - start;

    await client.disconnect();

    return {
      healthy: true,
      message: 'Redis 连接正常',
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      message: `Redis 检查异常：${(error as Error).message}`,
    };
  }
}

/**
 * 检查 SQLite 连接
 */
export async function checkSqlite(): Promise<{
  healthy: boolean;
  message: string;
  latency?: number;
}> {
  const start = Date.now();
  const client = createSQLiteManager({ useWorker: false });

  try {
    const connectResult = await client.connect();

    if (!connectResult.success) {
      return {
        healthy: false,
        message: `SQLite 连接失败：${connectResult.error?.message}`,
      };
    }

    // 简单查询测试
    await client.execute('SELECT 1');
    const latency = Date.now() - start;

    await client.close();

    return {
      healthy: true,
      message: 'SQLite 连接正常',
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      message: `SQLite 检查异常：${(error as Error).message}`,
    };
  }
}

/**
 * 完整健康检查
 */
export async function performHealthCheck(): Promise<{
  healthy: boolean;
  timestamp: string;
  uptime: number;
  memory: ReturnType<typeof getMemoryUsage>;
  redis: Awaited<ReturnType<typeof checkRedis>>;
  sqlite: Awaited<ReturnType<typeof checkSqlite>>;
}> {
  const [redis, sqlite] = await Promise.all([checkRedis(), checkSqlite()]);

  // 如果依赖不健康，整体不健康
  const healthy = redis.healthy && sqlite.healthy;

  return {
    healthy,
    timestamp: new Date().toISOString(),
    uptime: getUptime(),
    memory: getMemoryUsage(),
    redis,
    sqlite,
  };
}

/**
 * 生成健康检查响应 JSON
 */
export function generateHealthResponse(
  health: Awaited<ReturnType<typeof performHealthCheck>>
): string {
  return JSON.stringify(
    {
      status: health.healthy ? 'healthy' : 'unhealthy',
      timestamp: health.timestamp,
      uptime: {
        seconds: health.uptime,
        formatted: formatUptime(health.uptime),
      },
      memory: {
        heapUsed: `${health.memory.heapUsed} MB`,
        heapTotal: `${health.memory.heapTotal} MB`,
        usagePercent: `${health.memory.usagePercent}%`,
        rss: `${health.memory.rss} MB`,
      },
      checks: {
        redis: {
          healthy: health.redis.healthy,
          message: health.redis.message,
          latency: health.redis.latency ? `${health.redis.latency}ms` : undefined,
        },
        sqlite: {
          healthy: health.sqlite.healthy,
          message: health.sqlite.message,
          latency: health.sqlite.latency ? `${health.sqlite.latency}ms` : undefined,
        },
      },
    },
    null,
    2
  );
}

/**
 * 格式化运行时间
 */
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`);
  }
  parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * CLI 入口点（用于 Docker HEALTHCHECK）
 */
async function main(): Promise<void> {
  const health = await performHealthCheck();

  if (!health.healthy) {
    console.error(generateHealthResponse(health));
    process.exit(1);
  }

  console.log(generateHealthResponse(health));
  process.exit(0);
}

// 如果直接运行则执行 main
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((error) => {
    console.error('Health check failed:', error);
    process.exit(1);
  });
}
