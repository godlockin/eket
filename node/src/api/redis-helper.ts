/**
 * EKET Protocol HTTP Server - Redis Helper
 *
 * 封装 Redis 操作，简化 eket-server.ts 中的代码
 */

import type { RedisClient } from '../core/redis-client.js';

export class RedisHelper {
  private redis: RedisClient;
  private client: any; // ioredis client

  constructor(redis: RedisClient) {
    this.redis = redis;
    this.client = redis.getClient();
  }

  isAvailable(): boolean {
    return this.client !== null && this.redis.isReady();
  }

  async hset(key: string, data: Record<string, any>): Promise<void> {
    if (!this.client) {throw new Error('Redis client not available');}
    await this.client.hset(key, data);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    if (!this.client) {throw new Error('Redis client not available');}
    return await this.client.hgetall(key);
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
