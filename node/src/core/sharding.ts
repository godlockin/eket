/**
 * EKET Framework - Consistent Hash Sharding
 * v2.0.0 扩展性增强
 *
 * 基于一致性哈希的消息队列分片：
 * - 虚拟节点实现均匀分布
 * - 支持动态扩缩容
 * - 最小化数据迁移
 */

import {
  CONSISTENT_HASH_REPLICAS,
  CONSISTENT_HASH_FUNCTION,
  MQ_DEFAULT_SHARD_COUNT,
} from '../constants.js';
import type { Result, ConsistentHashConfig, MessageQueueShardingConfig } from '../types/index.js';
import { EketError } from '../types/index.js';

/**
 * 哈希环节点
 */
interface HashRingNode {
  key: string; // 实际节点标识（如 shard-0）
  hash: bigint; // 哈希值
  virtualIndex: number; // 虚拟节点索引
}

/**
 * 一致性哈希环实现
 * 使用 BigInt 避免哈希溢出，支持 2^128 空间
 */
export class ConsistentHashRing {
  private readonly ring: Map<bigint, HashRingNode>;
  private readonly sortedHashes: bigint[];
  private readonly config: Required<ConsistentHashConfig>;
  private readonly shardCount: number;

  constructor(shardCount: number = MQ_DEFAULT_SHARD_COUNT, config: ConsistentHashConfig = {}) {
    this.shardCount = shardCount;
    this.config = {
      replicas: config.replicas ?? CONSISTENT_HASH_REPLICAS,
      hashFunction: config.hashFunction ?? CONSISTENT_HASH_FUNCTION,
    };
    this.ring = new Map();
    this.sortedHashes = [];
    this.initializeRing();
  }

  /**
   * 初始化哈希环
   */
  private initializeRing(): void {
    // 为每个分片创建虚拟节点
    for (let i = 0; i < this.shardCount; i++) {
      const shardKey = `shard-${i}`;
      for (let j = 0; j < this.config.replicas; j++) {
        this.addVirtualNode(shardKey, j);
      }
    }
  }

  /**
   * 添加虚拟节点到环
   */
  private addVirtualNode(key: string, virtualIndex: number): void {
    const hash = this.hashKey(`${key}:vn-${virtualIndex}`);

    const node: HashRingNode = {
      key,
      hash,
      virtualIndex,
    };

    this.ring.set(hash, node);
    this.sortedHashes.push(hash);
    this.sortedHashes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /**
   * 移除虚拟节点
   */
  private removeVirtualNode(key: string, virtualIndex: number): void {
    const hash = this.hashKey(`${key}:vn-${virtualIndex}`);
    this.ring.delete(hash);
    const index = this.sortedHashes.indexOf(hash);
    if (index > -1) {
      this.sortedHashes.splice(index, 1);
    }
  }

  /**
   * 添加分片
   */
  addShard(shardId: number): Result<void> {
    const shardKey = `shard-${shardId}`;

    // 检查是否已存在
    for (let j = 0; j < this.config.replicas; j++) {
      const hash = this.hashKey(`${shardKey}:vn-${j}`);
      if (this.ring.has(hash)) {
        return {
          success: false,
          error: new EketError('SHARD_ALREADY_EXISTS', `Shard ${shardId} already exists`),
        };
      }
    }

    // 添加虚拟节点
    for (let j = 0; j < this.config.replicas; j++) {
      this.addVirtualNode(shardKey, j);
    }

    return { success: true, data: undefined };
  }

  /**
   * 移除分片
   */
  removeShard(shardId: number): Result<void> {
    const shardKey = `shard-${shardId}`;

    // 移除所有虚拟节点
    for (let j = 0; j < this.config.replicas; j++) {
      this.removeVirtualNode(shardKey, j);
    }

    return { success: true, data: undefined };
  }

  /**
   * 获取键对应的分片
   */
  getShard(key: string): number {
    if (this.sortedHashes.length === 0) {
      return 0; // 默认返回第一个分片
    }

    const hash = this.hashKey(key);

    // 二分查找顺时针第一个节点
    const position = this.binarySearch(hash);
    const nodeHash = this.sortedHashes[position];
    const node = this.ring.get(nodeHash);

    if (!node) {
      // 理论上不应该发生
      return 0;
    }

    // 从 shard-X 提取 X
    const match = node.key.match(/shard-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 获取键对应的分片 ID（用于 Redis key）
   */
  getShardId(key: string): string {
    const shardNum = this.getShard(key);
    return `shard-${shardNum}`;
  }

  /**
   * 二分查找顺时针位置
   */
  private binarySearch(hash: bigint): number {
    let left = 0;
    let right = this.sortedHashes.length - 1;

    while (left < right) {
      const mid = (left + right) >>> 1;
      if (this.sortedHashes[mid] < hash) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // 如果所有节点都比 hash 小，返回第一个（环回）
    if (this.sortedHashes[left] < hash) {
      return 0;
    }

    return left;
  }

  /**
   * 哈希函数
   */
  private hashKey(key: string): bigint {
    // 默认使用 MurmurHash3（同步版本）
    // MD5 和 SHA1 需要 crypto 模块的异步 API
    return this.hashMurmur3(key);
  }

  /**
   * MurmurHash3 实现（128 位）
   * 使用 BigInt 避免溢出
   */
  private hashMurmur3(key: string): bigint {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const length = data.length;

    const c1 = 0x87c3_7b91n;
    const c2 = 0x4cf5_ad43n;
    const r1 = 31n;
    const r2 = 27n;
    const m = 5n;
    const n = 0x52dce729n;

    let h1 = 0x0000_0000n;
    let h2 = 0x0000_0000n;

    const nBlocks = length >> 4; // 除以 16

    // 处理完整块
    for (let i = 0; i < nBlocks; i++) {
      const offset = i * 16;

      let k1 = this.readUInt64LE(data, offset);
      let k2 = this.readUInt64LE(data, offset + 8);

      k1 = this.mul64(k1, c1);
      k1 = this.rotl64(k1, r1);
      k1 = this.mul64(k1, c2);
      h1 = h1 ^ k1;

      h1 = this.rotl64(h1, r2);
      h1 = this.add64(h1, h2);
      h1 = this.add64(this.mul64(h1, m), n);

      k2 = this.mul64(k2, c2);
      k2 = this.rotl64(k2, r2);
      k2 = this.mul64(k2, c1);
      h2 = h2 ^ k2;

      h2 = this.rotl64(h2, r1);
      h2 = this.add64(h2, h1);
      h2 = this.add64(this.mul64(h2, m), n);
    }

    // 处理剩余字节
    let k1 = 0n;
    let k2 = 0n;
    const remainder = length & 0x0f; // 余数

    const tailBase = nBlocks << 4;

    switch (remainder) {
      case 15:
        k2 = k2 ^ (this.bigInt(data[tailBase + 14]) << 48n);
        break;
      case 14:
        k2 = k2 ^ (this.bigInt(data[tailBase + 13]) << 40n);
        break;
      case 13:
        k2 = k2 ^ (this.bigInt(data[tailBase + 12]) << 32n);
        break;
      case 12:
        k2 = k2 ^ (this.bigInt(data[tailBase + 11]) << 24n);
        break;
      case 11:
        k2 = k2 ^ (this.bigInt(data[tailBase + 10]) << 16n);
        break;
      case 10:
        k2 = k2 ^ (this.bigInt(data[tailBase + 9]) << 8n);
        break;
      case 9:
        k2 = k2 ^ this.bigInt(data[tailBase + 8]);
        break;
      case 8:
        k1 = k1 ^ (this.bigInt(data[tailBase + 7]) << 56n);
        break;
      case 7:
        k1 = k1 ^ (this.bigInt(data[tailBase + 6]) << 48n);
        break;
      case 6:
        k1 = k1 ^ (this.bigInt(data[tailBase + 5]) << 40n);
        break;
      case 5:
        k1 = k1 ^ (this.bigInt(data[tailBase + 4]) << 32n);
        break;
      case 4:
        k1 = k1 ^ (this.bigInt(data[tailBase + 3]) << 24n);
        break;
      case 3:
        k1 = k1 ^ (this.bigInt(data[tailBase + 2]) << 16n);
        break;
      case 2:
        k1 = k1 ^ (this.bigInt(data[tailBase + 1]) << 8n);
        break;
      case 1:
        k1 = k1 ^ this.bigInt(data[tailBase]);
        break;
    }

    if (k1 !== 0n) {
      k1 = this.mul64(k1, c1);
      k1 = this.rotl64(k1, r1);
      k1 = this.mul64(k1, c2);
      h1 = h1 ^ k1;
    }

    if (k2 !== 0n) {
      k2 = this.mul64(k2, c2);
      k2 = this.rotl64(k2, r2);
      k2 = this.mul64(k2, c1);
      h2 = h2 ^ k2;
    }

    // 最终混合
    h1 = h1 ^ this.bigInt(length);
    h2 = h2 ^ this.bigInt(length);

    h1 = this.add64(h1, h2);
    h2 = this.add64(h2, h1);

    h1 = this.finalizeMurmur(h1);
    h2 = this.finalizeMurmur(h2);

    h1 = this.add64(h1, h2);
    h2 = this.add64(h2, h1);

    // 返回 64 位哈希（取高 64 位）
    return h1;
  }

  /**
   * SHA1 哈希（简化版，使用 crypto 模块）
   */
  private async hashSHA1Async(key: string): Promise<bigint> {
    try {
      const { subtle } = await import('crypto');
      const encoder = new TextEncoder();
      const data = encoder.encode(key);
      const hashBuffer = await subtle.digest('SHA-1', data);
      const hashArray = new Uint8Array(hashBuffer);
      return this.bufferToBigInt(hashArray);
    } catch {
      // Fallback to MurmurHash3
      return this.hashMurmur3(key);
    }
  }

  /**
   * MD5 哈希（简化版，使用 crypto 模块）
   */
  private async hashMD5Async(key: string): Promise<bigint> {
    try {
      const { subtle } = await import('crypto');
      const encoder = new TextEncoder();
      const data = encoder.encode(key);
      const hashBuffer = await subtle.digest('MD5', data);
      const hashArray = new Uint8Array(hashBuffer);
      return this.bufferToBigInt(hashArray);
    } catch {
      // Fallback to MurmurHash3
      return this.hashMurmur3(key);
    }
  }

  /**
   * 同步哈希（默认使用 MurmurHash3）
   */
  hash(key: string): bigint {
    return this.hashMurmur3(key);
  }

  /**
   * 异步哈希（支持 crypto 模块）
   */
  async hashAsync(key: string): Promise<bigint> {
    switch (this.config.hashFunction) {
      case 'md5':
        return await this.hashMD5Async(key);
      case 'sha1':
        return await this.hashSHA1Async(key);
      default:
        return this.hashMurmur3(key);
    }
  }

  private bigInt(value: number): bigint {
    return BigInt(value);
  }

  private readUInt64LE(data: Uint8Array, offset: number): bigint {
    const low = BigInt(
      data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)
    );
    const high = BigInt(
      data[offset + 4] |
        (data[offset + 5] << 8) |
        (data[offset + 6] << 16) |
        (data[offset + 7] << 24)
    );
    return low + (high << 32n);
  }

  private add64(a: bigint, b: bigint): bigint {
    return (a + b) & 0xffff_ffff_ffff_ffffn;
  }

  private mul64(a: bigint, b: bigint): bigint {
    return (a * b) & 0xffff_ffff_ffff_ffffn;
  }

  private rotl64(val: bigint, shift: bigint): bigint {
    shift = shift & 63n;
    const mask = 0xffff_ffff_ffff_ffffn;
    return ((val << shift) & mask) | (val >> (64n - shift));
  }

  private finalizeMurmur(k: bigint): bigint {
    k = k ^ (k >> 33n);
    k = this.mul64(k, 0xff51afd7ed558ccdn);
    k = k ^ (k >> 33n);
    k = this.mul64(k, 0xc4ceb9fe1a85ec53n);
    k = k ^ (k >> 33n);
    return k;
  }

  private bufferToBigInt(buffer: Uint8Array): bigint {
    let result = 0n;
    for (let i = 0; i < Math.min(buffer.length, 16); i++) {
      result = (result << 8n) | BigInt(buffer[i]);
    }
    return result;
  }

  /**
   * 获取哈希环统计信息
   */
  getStats(): {
    totalNodes: number;
    shardCount: number;
    replicasPerShard: number;
    distribution: Map<number, number>;
  } {
    const distribution = new Map<number, number>();

    // 统计每个分片的虚拟节点数
    for (const node of this.ring.values()) {
      const match = node.key.match(/shard-(\d+)/);
      if (match) {
        const shardId = parseInt(match[1], 10);
        distribution.set(shardId, (distribution.get(shardId) || 0) + 1);
      }
    }

    return {
      totalNodes: this.ring.size,
      shardCount: this.shardCount,
      replicasPerShard: this.config.replicas,
      distribution,
    };
  }
}

/**
 * 消息队列分片管理器
 */
export class ShardingManager {
  private readonly hashRing: ConsistentHashRing;
  private readonly config: Required<MessageQueueShardingConfig>;

  constructor(
    config: MessageQueueShardingConfig = { enabled: false, shardCount: MQ_DEFAULT_SHARD_COUNT }
  ) {
    this.config = {
      enabled: config.enabled,
      shardCount: config.shardCount || MQ_DEFAULT_SHARD_COUNT,
      consistentHash: config.consistentHash || {},
    };

    this.hashRing = new ConsistentHashRing(this.config.shardCount, this.config.consistentHash);
  }

  /**
   * 获取消息对应的分片 ID
   */
  getShardForMessage(messageKey: string): number {
    if (!this.config.enabled) {
      return 0; // 未启用分片，返回默认分片
    }
    return this.hashRing.getShard(messageKey);
  }

  /**
   * 获取消息对应的 Redis key（带分片前缀）
   */
  getShardedKey(baseKey: string, messageKey: string): string {
    if (!this.config.enabled) {
      return baseKey;
    }
    const shardId = this.getShardForMessage(messageKey);
    return `${baseKey}:${shardId}`;
  }

  /**
   * 获取 Instance 对应的分片 ID
   */
  getShardForInstance(instanceId: string): number {
    if (!this.config.enabled) {
      return 0;
    }
    return this.hashRing.getShard(`instance:${instanceId}`);
  }

  /**
   * 添加分片
   */
  addShard(shardId: number): Result<void> {
    return this.hashRing.addShard(shardId);
  }

  /**
   * 移除分片
   */
  removeShard(shardId: number): Result<void> {
    return this.hashRing.removeShard(shardId);
  }

  /**
   * 获取分片统计
   */
  getStats(): {
    enabled: boolean;
    shardCount: number;
    distribution: Map<number, number>;
  } {
    const hashStats = this.hashRing.getStats();
    return {
      enabled: this.config.enabled,
      shardCount: hashStats.shardCount,
      distribution: hashStats.distribution,
    };
  }
}

/**
 * 创建一致性哈希环
 */
export function createConsistentHashRing(
  shardCount?: number,
  config?: ConsistentHashConfig
): ConsistentHashRing {
  return new ConsistentHashRing(shardCount, config);
}

/**
 * 创建分片管理器
 */
export function createShardingManager(config?: MessageQueueShardingConfig): ShardingManager {
  return new ShardingManager(config);
}
