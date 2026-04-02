/**
 * Encryption Utilities
 *
 * 使用 AES-256-GCM 对敏感数据进行加密/解密
 *
 * @module Encryption
 */

import * as crypto from 'crypto';

// ============================================================================
// 常量定义
// ============================================================================

/**
 * AES-256-GCM 算法配置
 */
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // GCM 模式需要 12-16 字节 IV
const AUTH_TAG_LENGTH = 16; // GCM 认证标签长度
const SALT_LENGTH = 32; // 盐长度
const KEY_LENGTH = 32; // AES-256 需要 32 字节密钥

// ============================================================================
// 密钥派生
// ============================================================================

/**
 * 从密码派生加密密钥
 * 使用 PBKDF2 算法，100,000 次迭代
 *
 * @param password - 密码字符串
 * @param salt - 盐值（32 字节 hex 字符串）
 * @returns 32 字节 Buffer（AES-256 密钥）
 */
export function deriveKey(password: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * 生成随机盐值
 *
 * @returns 32 字节 hex 字符串
 */
export function generateSalt(): string {
  return crypto.randomBytes(SALT_LENGTH).toString('hex');
}

// ============================================================================
// 加密/解密接口
// ============================================================================

/**
 * 加密数据
 *
 * 加密格式：{ salt, iv, encryptedData, authTag }
 * 所有字段都是 hex 字符串，可直接 JSON 序列化
 *
 * @param plaintext - 明文数据
 * @param encryptionKey - 加密密钥（从环境变量 EKET_MAILBOX_ENCRYPTION_KEY 读取）
 * @returns 加密后的数据对象
 * @throws 如果密钥未配置或加密失败
 */
export function encrypt(plaintext: string, encryptionKey: string): EncryptedData {
  if (!encryptionKey || encryptionKey.length < 8) {
    throw new Error('Encryption key must be at least 8 characters');
  }

  // 生成随机盐和 IV
  const salt = generateSalt();
  const iv = crypto.randomBytes(IV_LENGTH);

  // 派生密钥
  const key = deriveKey(encryptionKey, salt);

  // 创建加密器
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // 加密数据
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // 获取认证标签
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    salt,
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag,
  };
}

/**
 * 解密数据
 *
 * @param encryptedData - 加密数据对象
 * @param encryptionKey - 加密密钥（必须与加密时使用相同的密钥）
 * @returns 解密后的明文
 * @throws 如果解密失败（密钥错误或数据被篡改）
 */
export function decrypt(encryptedData: EncryptedData, encryptionKey: string): string {
  // 派生密钥
  const key = deriveKey(encryptionKey, encryptedData.salt);

  // 创建解密器
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(encryptedData.iv, 'hex'), {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // 设置认证标签
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

  // 解密数据
  let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 加密数据结构
 */
export interface EncryptedData {
  /** 盐值（hex 字符串） */
  salt: string;
  /** 初始化向量（hex 字符串） */
  iv: string;
  /** 加密数据（hex 字符串） */
  encryptedData: string;
  /** GCM 认证标签（hex 字符串） */
  authTag: string;
}

// ============================================================================
// 密钥验证工具
// ============================================================================

/**
 * 验证加密密钥是否已配置
 *
 * @returns 如果密钥已配置返回 true
 */
export function isEncryptionEnabled(): boolean {
  const key = process.env.EKET_MAILBOX_ENCRYPTION_KEY;
  return !!key && key.length >= 8;
}

/**
 * 获取加密密钥（如果已配置）
 *
 * @returns 加密密钥或 undefined
 */
export function getEncryptionKey(): string | undefined {
  return process.env.EKET_MAILBOX_ENCRYPTION_KEY;
}

/**
 * 验证密钥并抛出错误（如果无效）
 *
 * @throws 如果密钥未配置或太短
 */
export function requireEncryptionKey(): void {
  const key = process.env.EKET_MAILBOX_ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      'EKET_MAILBOX_ENCRYPTION_KEY environment variable is required. ' +
        'Generate a secure key: openssl rand -hex 32'
    );
  }
  if (key.length < 16) {
    throw new Error(
      'EKET_MAILBOX_ENCRYPTION_KEY must be at least 16 characters. ' +
        'Generate a secure key: openssl rand -hex 32'
    );
  }
}
