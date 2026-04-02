/**
 * EKET Framework - Redis Types
 *
 * Type definitions for Redis client and related modules
 */

/**
 * Redis client interface (compatible with ioredis)
 */
export interface RedisClientInterface {
  // Connection management
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  quit(): Promise<void>;

  // Basic commands
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<'OK' | null>;
  setex(key: string, seconds: number, value: string): Promise<'OK' | null>;
  set(
    key: string,
    value: string,
    mode: 'NX' | 'XX',
    mode2: 'PX' | 'EX',
    ttl: number
  ): Promise<'OK' | null>;

  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;

  // Pub/Sub
  publish(channel: string, message: string): Promise<number>;
  subscribe(...channels: string[]): Promise<void>;

  // List/Set operations
  sadd(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, ...members: string[]): Promise<number>;

  // Key management
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<number>;

  // Utility
  ping(): Promise<string>;
}

/**
 * Type guard to check if a value is a Redis client
 */
export function isRedisClient(value: unknown): value is RedisClientInterface {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const client = value as Record<string, unknown>;
  return (
    typeof client.get === 'function' &&
    typeof client.set === 'function' &&
    typeof client.del === 'function' &&
    typeof client.ping === 'function' &&
    typeof client.publish === 'function' &&
    typeof client.subscribe === 'function'
  );
}
