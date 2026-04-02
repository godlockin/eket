/**
 * Memory Monitor Module
 *
 * 内存监控模块
 *
 * 功能：
 * - 每分钟检查内存使用率
 * - >90% 时告警
 * - 可选触发 GC（如果可用）
 * - 支持内存使用趋势记录
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface MemoryStats {
  timestamp: number;
  heapUsed: number; // bytes
  heapTotal: number; // bytes
  external: number; // bytes
  rss: number; // bytes
  heapUsedPercent: number;
}

export interface MemoryConfig {
  /** 告警阈值（0-1） */
  warningThreshold: number;
  /** 严重告警阈值（0-1） */
  criticalThreshold: number;
  /** 检查间隔（毫秒） */
  checkInterval: number;
  /** 是否启用 GC */
  enableGC: boolean;
  /** GC 触发阈值（0-1） */
  gcThreshold: number;
  /** 历史数据保留数量 */
  historySize: number;
}

export interface MemoryAlert {
  level: 'warning' | 'critical';
  usagePercent: number;
  threshold: number;
  timestamp: number;
  stats: MemoryStats;
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_CONFIG: MemoryConfig = {
  warningThreshold: 0.75, // 75% 警告
  criticalThreshold: 0.9, // 90% 严重警告
  checkInterval: 60000, // 1 分钟
  enableGC: true,
  gcThreshold: 0.85, // 85% 触发 GC
  historySize: 60, // 保留 60 条记录（1 小时）
};

// ============================================================================
// Memory Monitor Class
// ============================================================================

export class MemoryMonitor extends EventEmitter {
  private config: MemoryConfig;
  private history: MemoryStats[] = [];
  private checkTimer: NodeJS.Timeout | null = null;
  private alertCount = 0;
  private lastGCTime = 0;
  private isRunning = false;

  constructor(config: Partial<MemoryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 启动内存监控
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    console.log('[MemoryMonitor] Started');

    // 立即执行一次检查
    this.checkMemory();

    // 定时检查
    this.checkTimer = setInterval(() => {
      this.checkMemory();
    }, this.config.checkInterval);
  }

  /**
   * 停止内存监控
   */
  stop(): void {
    this.isRunning = false;

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    console.log('[MemoryMonitor] Stopped');
  }

  /**
   * 获取当前内存统计
   */
  getStats(): MemoryStats {
    const memUsage = process.memoryUsage();
    const heapUsedPercent = memUsage.heapUsed / memUsage.heapTotal;

    return {
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedPercent,
    };
  }

  /**
   * 获取历史数据
   */
  getHistory(): MemoryStats[] {
    return [...this.history];
  }

  /**
   * 获取告警统计
   */
  getAlertCount(): number {
    return this.alertCount;
  }

  /**
   * 检查内存并触发告警/GC
   */
  private checkMemory(): void {
    const stats = this.getStats();

    // 添加到历史记录
    this.addToHistory(stats);

    // 检查是否需要 GC
    if (this.config.enableGC && stats.heapUsedPercent >= this.config.gcThreshold) {
      this.triggerGC(stats);
    }

    // 检查告警阈值
    this.checkThresholds(stats);
  }

  /**
   * 添加到历史记录
   */
  private addToHistory(stats: MemoryStats): void {
    this.history.push(stats);

    // 限制历史记录大小
    if (this.history.length > this.config.historySize) {
      this.history.shift();
    }
  }

  /**
   * 检查阈值并触发告警
   */
  private checkThresholds(stats: MemoryStats): void {
    const { heapUsedPercent } = stats;

    // 严重告警
    if (heapUsedPercent >= this.config.criticalThreshold) {
      this.emitAlert('critical', heapUsedPercent, this.config.criticalThreshold, stats);
      return;
    }

    // 警告
    if (heapUsedPercent >= this.config.warningThreshold) {
      this.emitAlert('warning', heapUsedPercent, this.config.warningThreshold, stats);
    }
  }

  /**
   * 触发告警事件
   */
  private emitAlert(
    level: 'warning' | 'critical',
    usagePercent: number,
    threshold: number,
    stats: MemoryStats
  ): void {
    const alert: MemoryAlert = {
      level,
      usagePercent: Math.round(usagePercent * 100),
      threshold: Math.round(threshold * 100),
      timestamp: Date.now(),
      stats,
    };

    this.alertCount++;
    this.emit('alert', alert);

    // 日志输出
    const logFn = level === 'critical' ? console.error : console.warn;
    logFn(
      `[MemoryMonitor] ${level.toUpperCase()}: Memory usage at ${alert.usagePercent}% (threshold: ${alert.threshold}%)`
    );
  }

  /**
   * 触发 GC（如果可用）
   */
  private triggerGC(stats: MemoryStats): void {
    const now = Date.now();

    // 防止频繁 GC（至少间隔 5 分钟）
    if (now - this.lastGCTime < 5 * 60 * 1000) {
      return;
    }

    this.lastGCTime = now;

    // 尝试触发 GC
    if (global.gc) {
      console.log('[MemoryMonitor] Triggering GC...');
      global.gc();

      // GC 后再次检查
      setTimeout(() => {
        const afterGC = this.getStats();
        const savedMB = Math.round((stats.heapUsed - afterGC.heapUsed) / 1024 / 1024);
        console.log(`[MemoryMonitor] GC complete. Freed ${savedMB} MB`);
        this.emit('gc', { before: stats, after: afterGC });
      }, 1000);
    } else {
      // Node.js 未启动 --expose-gc
      console.warn('[MemoryMonitor] GC not available. Start with --expose-gc flag.');
      this.emit('gc-unavailable', stats);
    }
  }

  /**
   * 获取内存使用报告
   */
  getReport(): {
    current: MemoryStats;
    average: {
      heapUsedPercent: number;
      rss: number;
    };
    trend: 'increasing' | 'stable' | 'decreasing';
    alertCount: number;
  } {
    const current = this.getStats();

    if (this.history.length === 0) {
      return {
        current,
        average: { heapUsedPercent: 0, rss: 0 },
        trend: 'stable',
        alertCount: this.alertCount,
      };
    }

    // 计算平均值
    const avgHeapUsedPercent =
      this.history.reduce((sum, s) => sum + s.heapUsedPercent, 0) / this.history.length;
    const avgRss = this.history.reduce((sum, s) => sum + s.rss, 0) / this.history.length;

    // 判断趋势（比较最近 5 条和之前 5 条的平均值）
    let trend: 'increasing' | 'stable' | 'decreasing' = 'stable';

    if (this.history.length >= 10) {
      const recent = this.history.slice(-5);
      const older = this.history.slice(-10, -5);

      const recentAvg = recent.reduce((sum, s) => sum + s.heapUsedPercent, 0) / 5;
      const olderAvg = older.reduce((sum, s) => sum + s.heapUsedPercent, 0) / 5;

      const diff = recentAvg - olderAvg;

      if (diff > 0.05) {
        trend = 'increasing';
      } else if (diff < -0.05) {
        trend = 'decreasing';
      }
    }

    return {
      current,
      average: {
        heapUsedPercent: Math.round(avgHeapUsedPercent * 100) / 100,
        rss: Math.round(avgRss),
      },
      trend,
      alertCount: this.alertCount,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalMonitor: MemoryMonitor | null = null;

/**
 * 获取全局内存监控实例
 */
export function getGlobalMemoryMonitor(): MemoryMonitor {
  if (!globalMonitor) {
    globalMonitor = new MemoryMonitor();
  }
  return globalMonitor;
}

/**
 * 启动全局内存监控（如果未启动）
 */
export function startGlobalMemoryMonitoring(config?: Partial<MemoryConfig>): MemoryMonitor {
  const monitor = getGlobalMemoryMonitor();

  if (!config) {
    // 使用默认配置启动
    monitor.start();
  } else {
    // 如果配置不同，重新创建
    monitor.stop();
    globalMonitor = new MemoryMonitor(config);
    globalMonitor.start();
  }

  return monitor;
}
