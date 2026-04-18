/**
 * EKET Protocol HTTP Server - Redis Helper
 *
 * 封装 Redis 操作，简化 eket-server.ts 中的代码
 */

import type { Redis as IoRedis } from 'ioredis';

import type { RedisClient } from '../core/redis-client.js';

export class RedisHelper {
  private redis: RedisClient;
  private client: IoRedis | null;

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.client = redis.getClient() as IoRedis | null;
  }

  isAvailable(): boolean {
    return this.client !== null && this.redis.isReady();
  }

  async hset(key: string, data: Record<string, string | number>): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.hset(key, data);
  }

  async hgetall<T extends Record<string, string> = Record<string, string>>(
    key: string
  ): Promise<T | null> {
    if (!this.client) {throw new Error('Redis client not available');}
    const result = await this.client.hgetall(key);
    if (!result || Object.keys(result).length === 0) {return null;}
    return result as T;
  }

  async del(key: string): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.del(key);
  }

  async sadd(key: string, member: string): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.sadd(key, member);
  }

  async srem(key: string, member: string): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.srem(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    if (!this.client) {throw new Error('Redis client not available');}
    return await this.client.smembers(key);
  }

  async lpush(key: string, value: string): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.lpush(key, value);
  }

  async rpush(key: string, value: string): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.rpush(key, value);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (!this.client) {throw new Error('Redis client not available');}
    return await this.client.lrange(key, start, stop);
  }

  async expire(key: string, seconds: number): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.expire(key, seconds);
  }
}
