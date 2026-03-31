/**
 * EKET Framework - External AI Adapter Types
 * Version: 0.9.2
 *
 * Type definitions for OpenCLAW, Claude Code, and Codex adapters
 */

import type { SkillDefinition, SkillExecutionResult } from '../../types/index.js';

// ============================================================================
// Core Adapter Interfaces
// ============================================================================

/**
 * 适配器源类型
 */
export type AdapterSource = 'openclaw' | 'claude-code' | 'codex';

/**
 * Skill 适配器接口
 *
 * 所有外部 AI 适配器必须实现此接口
 */
export interface SkillAdapter {
  /** 适配器标识 */
  readonly source: AdapterSource;

  /** 是否已连接 */
  readonly connected: boolean;

  /**
   * 连接到外部 AI 系统
   */
  connect(): Promise<void>;

  /**
   * 断开连接
   */
  disconnect(): Promise<void>;

  /**
   * 获取 Skill 定义
   * @param name Skill 名称
   */
  fetchSkill(name: string): Promise<SkillDefinition | null>;

  /**
   * 列出可用的 Skills
   */
  listSkills(): Promise<string[]>;

  /**
   * 执行 Skill
   * @param skillName Skill 名称
   * @param params 执行参数
   */
  execute(skillName: string, params: Record<string, unknown>): Promise<SkillExecutionResult>;
}

// ============================================================================
// Remote Skill Types
// ============================================================================

/**
 * 远程 Skill 元数据
 */
export interface RemoteSkill {
  /** Skill 唯一标识 */
  id: string;
  /** Skill 名称 */
  name: string;
  /** 来源系统 */
  source: AdapterSource;
  /** 版本 */
  version: string;
  /** 描述 */
  description: string;
  /** 标签 */
  tags: string[];
  /** 输入 Schema */
  inputSchema?: Record<string, unknown>;
  /** 输出 Schema */
  outputSchema?: Record<string, unknown>;
  /** 最后更新时间 */
  updatedAt: number;
}

/**
 * 远程 Skill 列表响应
 */
export interface RemoteSkillListResponse {
  skills: RemoteSkill[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// Protocol Message Types
// ============================================================================

/**
 * 协议消息类型
 */
export type ProtocolMessageType =
  | 'skill_request'
  | 'skill_response'
  | 'skill_error'
  | 'heartbeat'
  | 'ack';

/**
 * 协议消息
 */
export interface ProtocolMessage<T = unknown> {
  /** 消息 ID */
  id: string;
  /** 消息类型 */
  type: ProtocolMessageType;
  /** 发送方 */
  from: string;
  /** 接收方 */
  to: string;
  /** 时间戳 */
  timestamp: number;
  /** 负载数据 */
  payload: T;
}

/**
 * Skill 请求负载
 */
export interface SkillRequestPayload {
  /** Skill 名称 */
  skillName: string;
  /** 执行参数 */
  params: Record<string, unknown>;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/**
 * Skill 响应负载
 */
export interface SkillResponsePayload {
  /** 是否成功 */
  success: boolean;
  /** 执行结果 */
  result?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
  /** 执行时间（毫秒） */
  duration?: number;
}

/**
 * 错误响应负载
 */
export interface ErrorPayload {
  /** 错误码 */
  code: string;
  /** 错误信息 */
  message: string;
  /** 详细上下文 */
  context?: Record<string, unknown>;
}

/**
 * 心跳负载
 */
export interface HeartbeatPayload {
  /** 适配器状态 */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** 延迟（毫秒） */
  latency?: number;
  /** 最后活跃时间 */
  lastActiveAt: number;
}

// ============================================================================
// Adapter Configuration Types
// ============================================================================

/**
 * 通用适配器配置
 */
export interface AdapterConfig {
  /** 适配器类型 */
  type: AdapterSource;
  /** 连接超时（毫秒） */
  connectionTimeout?: number;
  /** 请求超时（毫秒） */
  requestTimeout?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 启用日志 */
  enableLogging?: boolean;
  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * OpenCLAW 适配器配置
 */
export interface OpenCLAWConfig extends AdapterConfig {
  type: 'openclaw';
  /** OpenCLAW 服务器地址 */
  host: string;
  /** OpenCLAW 服务器端口 */
  port: number;
  /** API Key */
  apiKey?: string;
  /** 使用 HTTPS */
  useHttps?: boolean;
  /** 项目根目录 */
  projectRoot: string;
}

/**
 * Claude Code 适配器配置
 */
export interface ClaudeCodeConfig extends AdapterConfig {
  type: 'claude-code';
  /** Inbox 目录路径 */
  inboxDir?: string;
  /** Outbox 目录路径 */
  outboxDir?: string;
  /** 项目根目录 */
  projectRoot: string;
}

/**
 * Codex 适配器配置
 */
export interface CodexConfig extends AdapterConfig {
  type: 'codex';
  /** Codex API 基础 URL */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** 组织 ID */
  organizationId?: string;
  /** 默认模型 */
  defaultModel?: string;
}

/**
 * 适配器配置联合类型
 */
export type AnyAdapterConfig = OpenCLAWConfig | ClaudeCodeConfig | CodexConfig;

// ============================================================================
// Adapter Registry Types
// ============================================================================

/**
 * 适配器注册表条目
 */
export interface AdapterRegistryEntry {
  /** 适配器实例 */
  adapter: SkillAdapter;
  /** 配置 */
  config: AnyAdapterConfig;
  /** 注册的时间 */
  registeredAt: number;
  /** 最后使用时间 */
  lastUsedAt?: number;
  /** 使用次数 */
  usageCount: number;
}

/**
 * 适配器工厂接口
 */
export interface AdapterFactoryInterface {
  /**
   * 创建适配器实例
   * @param type 适配器类型
   * @param config 配置
   */
  createAdapter<T extends AdapterSource>(
    type: T,
    config: T extends 'openclaw' ? OpenCLAWConfig : T extends 'claude-code' ? ClaudeCodeConfig : CodexConfig
  ): SkillAdapter;
}
