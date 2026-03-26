/**
 * EKET Framework - Instance Types
 * Version: 0.7.2
 *
 * Instance 注册表类型定义，支持人类和 AI 混合控制
 */

/**
 * Instance 控制器类型
 * - ai: AI 控制的 Instance（自动执行任务）
 * - human: 人类控制的 Instance（通过 Claude Code 手动操作）
 */
export type InstanceController = 'ai' | 'human';

/**
 * Instance 角色
 * - master: 主控制节点，负责任务拆解和 Review
 * - slaver: 执行节点，负责任务执行
 */
export type InstanceRole = 'master' | 'slaver';

/**
 * Instance 状态
 * - initializing: 初始化中
 * - idle: 空闲，可领取任务
 * - busy: 忙碌，正在执行任务
 * - offline: 离线
 */
export type InstanceStatus = 'initializing' | 'idle' | 'busy' | 'offline';

/**
 * Instance 配置信息
 */
export interface InstanceConfig {
  controller: InstanceController;
  role: InstanceRole;
  agent_type: string;  // product_manager, frontend_dev, backend_dev, etc.
  skills: string[];
  auto_mode?: boolean;  // 是否启用自动模式
}

/**
 * Instance 完整信息（注册表存储）
 */
export interface InstanceInfo {
  id: string;              // 唯一标识符，如 agent_frontend_dev_001
  controller: InstanceController;
  role: InstanceRole;
  agent_type: string;      // 具体代理类型
  skills: string[];        // 技能列表
  status: InstanceStatus;
  currentTask?: string;    // 当前任务 ID
  startedAt: number;       // 启动时间戳
  lastHeartbeat: number;   // 最后心跳时间戳
}

/**
 * Instance 注册结果
 */
export interface InstanceRegistryResult {
  success: boolean;
  instanceId?: string;
  error?: string;
}

/**
 * Instance 查询选项
 */
export interface InstanceQueryOptions {
  role?: InstanceRole;
  controller?: InstanceController;
  status?: InstanceStatus;
  agent_type?: string;
}

/**
 * Instance 状态更新数据
 */
export interface InstanceStatusUpdate {
  status: InstanceStatus;
  currentTask?: string;
  timestamp?: number;
}
