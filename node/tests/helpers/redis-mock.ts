/**
 * Redis Mock 测试辅助工具
 *
 * 提供内存中的 Redis mock，用于单元测试，无需真实 Redis 服务器
 *
 * 使用场景：
 * - 单元测试：快速、隔离、可重复
 * - CI/CD：无需外部依赖
 * - 并行测试：避免测试间干扰
 *
 * @module tests/helpers/redis-mock
 */

import RedisMock from 'ioredis-mock';
import type Redis from 'ioredis';

/**
 * 创建 Redis Mock 实例
 *
 * @returns Redis mock 实例，兼容 ioredis 接口
 *
 * @example
 * ```typescript
 * const redis = createMockRedis();
 * await redis.set('key', 'value');
 * const value = await redis.get('key');
 * ```
 */
export function createMockRedis(): Redis {
  return new RedisMock() as unknown as Redis;
}

/**
 * 创建带初始数据的 Redis Mock
 *
 * @param initialData - 初始键值对
 * @returns 已填充初始数据的 Redis mock
 *
 * @example
 * ```typescript
 * const redis = createMockRedisWithData({
 *   'user:1': JSON.stringify({ name: 'Alice' }),
 *   'counter': '42'
 * });
 * ```
 */
export async function createMockRedisWithData(
  initialData: Record<string, string>
): Promise<Redis> {
  const redis = createMockRedis();

  // 批量设置初始数据
  for (const [key, value] of Object.entries(initialData)) {
    await redis.set(key, value);
  }

  return redis;
}

/**
 * 创建集群模式的 Redis Mock（多实例）
 *
 * 用于测试 Redis 集群场景
 *
 * @param nodeCount - 节点数量
 * @returns Redis mock 实例数组
 *
 * @example
 * ```typescript
 * const [node1, node2, node3] = createMockRedisCluster(3);
 * ```
 */
export function createMockRedisCluster(nodeCount: number = 3): Redis[] {
  return Array.from({ length: nodeCount }, () => createMockRedis());
}

/**
 * 清空 Redis Mock 数据
 *
 * @param redis - Redis mock 实例
 */
export async function clearMockRedis(redis: Redis): Promise<void> {
  await redis.flushall();
}

/**
 * 验证 Redis Mock 键值对
 *
 * @param redis - Redis mock 实例
 * @param expectedData - 期望的键值对
 * @returns 是否匹配
 */
export async function verifyMockRedisData(
  redis: Redis,
  expectedData: Record<string, string>
): Promise<boolean> {
  for (const [key, expectedValue] of Object.entries(expectedData)) {
    const actualValue = await redis.get(key);
    if (actualValue !== expectedValue) {
      console.error(`Mismatch for key "${key}": expected "${expectedValue}", got "${actualValue}"`);
      return false;
    }
  }
  return true;
}

/**
 * 模拟 Redis 连接失败
 *
 * 返回一个会抛出错误的 Redis mock，用于测试错误处理
 *
 * @param errorMessage - 错误消息
 * @returns 会失败的 Redis mock
 */
export function createFailingMockRedis(errorMessage: string = 'Connection refused'): Redis {
  const mock = createMockRedis();

  // 重写关键方法，使其抛出错误
  const originalMethods = ['get', 'set', 'del', 'exists', 'expire'];
  originalMethods.forEach(method => {
    (mock as any)[method] = () => {
      throw new Error(errorMessage);
    };
  });

  return mock;
}

/**
 * 模拟 Redis 慢响应
 *
 * @param delay - 延迟毫秒数
 * @returns 慢响应的 Redis mock
 */
export function createSlowMockRedis(delay: number = 1000): Redis {
  const mock = createMockRedis();
  const originalGet = mock.get.bind(mock);
  const originalSet = mock.set.bind(mock);

  // 为 get/set 添加延迟
  mock.get = async (key: string) => {
    await new Promise(resolve => setTimeout(resolve, delay));
    return originalGet(key);
  };

  mock.set = async (key: string, value: string, ...args: any[]) => {
    await new Promise(resolve => setTimeout(resolve, delay));
    return originalSet(key, value, ...args);
  };

  return mock;
}

/**
 * 创建 Redis Mock 测试环境
 *
 * 提供 setup/teardown 辅助函数
 *
 * @returns 测试环境对象
 *
 * @example
 * ```typescript
 * const testEnv = createRedisTestEnv();
 *
 * beforeEach(async () => {
 *   await testEnv.setup();
 * });
 *
 * afterEach(async () => {
 *   await testEnv.teardown();
 * });
 *
 * it('should work', async () => {
 *   await testEnv.redis.set('key', 'value');
 *   expect(await testEnv.redis.get('key')).toBe('value');
 * });
 * ```
 */
export function createRedisTestEnv() {
  let redis: Redis | null = null;

  return {
    get redis(): Redis {
      if (!redis) {
        throw new Error('Redis mock not initialized. Call setup() first.');
      }
      return redis;
    },

    async setup(): Promise<void> {
      redis = createMockRedis();
    },

    async teardown(): Promise<void> {
      if (redis) {
        await redis.quit();
        redis = null;
      }
    },

    async reset(): Promise<void> {
      if (redis) {
        await redis.flushall();
      }
    },
  };
}
