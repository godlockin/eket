/**
 * Master Heartbeat Manager
 * Master 定期更新心跳文件，供 Supervisor 监控
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = path.dirname(__filename);

export interface MasterHeartbeatConfig {
  heartbeatInterval?: number; // 心跳间隔（毫秒）
  heartbeatPath?: string; // 心跳文件路径
}

/**
 * Master 心跳管理器
 */
export class MasterHeartbeatManager {
  private heartbeatInterval: number;
  private heartbeatPath: string;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(config: MasterHeartbeatConfig = {}) {
    this.heartbeatInterval = config.heartbeatInterval ?? 60000; // 默认 60 秒
    this.heartbeatPath = config.heartbeatPath ?? path.resolve(
      __dirname,
      '../../../.eket/state/master-heartbeat'
    );
  }

  /**
   * 启动心跳
   */
  start(): void {
    // 确保目录存在
    const dir = path.dirname(this.heartbeatPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入初始心跳
    this.writeHeartbeat();

    // 启动定时心跳
    this.intervalId = setInterval(() => {
      this.writeHeartbeat();
    }, this.heartbeatInterval);

    console.log(`[Master Heartbeat] Started (interval: ${this.heartbeatInterval}ms)`);
  }

  /**
   * 停止心跳
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 清理心跳文件
    if (fs.existsSync(this.heartbeatPath)) {
      fs.unlinkSync(this.heartbeatPath);
    }

    console.log('[Master Heartbeat] Stopped');
  }

  /**
   * 写入心跳
   */
  private writeHeartbeat(): void {
    try {
      fs.writeFileSync(this.heartbeatPath, Date.now().toString(), 'utf8');
    } catch (error) {
      console.error('[Master Heartbeat] Write failed:', error);
    }
  }

  /**
   * 读取最后心跳时间
   */
  static readLastHeartbeat(heartbeatPath?: string): number | null {
    const filePath = heartbeatPath ?? path.resolve(
      __dirname,
      '../../../.eket/state/master-heartbeat'
    );

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const timestamp = parseInt(content.trim(), 10);
      return isNaN(timestamp) ? null : timestamp;
    } catch {
      return null;
    }
  }

  /**
   * 检查 Master 是否存活
   */
  static isAlive(heartbeatPath?: string, timeoutMs = 90000): boolean {
    const lastHeartbeat = MasterHeartbeatManager.readLastHeartbeat(heartbeatPath);
    if (lastHeartbeat === null) {
      return false;
    }

    const now = Date.now();
    return (now - lastHeartbeat) < timeoutMs;
  }
}

/**
 * 创建 Master 心跳管理器
 */
export function createMasterHeartbeat(config?: MasterHeartbeatConfig): MasterHeartbeatManager {
  return new MasterHeartbeatManager(config);
}
