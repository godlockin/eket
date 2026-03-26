/**
 * Alerting System Module
 * 异常告警和通知系统
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../types/index.js';
import { EketErrorCode, EketErrorClass } from '../types/index.js';

/**
 * 告警级别
 */
export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 告警状态
 */
export type AlertStatus = 'new' | 'acknowledged' | 'resolved' | 'escalated';

/**
 * 通知渠道
 */
export type NotificationChannel = 'email' | 'slack' | 'dingtalk' | 'webhook';

/**
 * 告警规则
 */
export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  level: AlertLevel;
  condition: string;  // 条件表达式
  channels: NotificationChannel[];
  cooldown?: number;  // 冷却时间（毫秒）
  enabled: boolean;
}

/**
 * 告警记录
 */
export interface Alert {
  id: string;
  ruleId: string;
  level: AlertLevel;
  status: AlertStatus;
  title: string;
  message: string;
  context: Record<string, unknown>;
  createdAt: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  resolvedAt?: number;
  resolvedBy?: string;
}

/**
 * 通知配置
 */
export interface NotificationConfig {
  email?: {
    smtpHost: string;
    smtpPort: number;
    from: string;
    recipients: string[];
  };
  slack?: {
    webhookUrl: string;
    channel: string;
  };
  dingtalk?: {
    webhookUrl: string;
    secret?: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

/**
 * 告警统计
 */
export interface AlertStats {
  total: number;
  byLevel: Record<AlertLevel, number>;
  byStatus: Record<AlertStatus, number>;
  last24Hours: number;
}

/**
 * 告警系统
 */
export class AlertingSystem {
  private rules: Map<string, AlertRule> = new Map();
  private alerts: Alert[] = [];
  private config: NotificationConfig;
  private alertsDir: string;
  private lastAlertTime: Map<string, number> = new Map();

  constructor(config: { alertsDir: string; config?: NotificationConfig }) {
    this.alertsDir = config.alertsDir;
    this.config = config.config || {};
    this.ensureAlertsDirectory();
    this.loadRules();
  }

  /**
   * 注册告警规则
   */
  registerRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
    console.log(`[Alerting] 注册规则：${rule.name}`);
  }

  /**
   * 触发告警
   */
  async trigger(ruleId: string, context: Record<string, unknown>): Promise<Result<Alert>> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.ALERT_RULE_NOT_FOUND,
          `告警规则不存在：${ruleId}`
        ) as EketErrorClass,
      };
    }

    if (!rule.enabled) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.ALERT_RULE_DISABLED,
          `告警规则已禁用：${ruleId}`
        ),
      };
    }

    // 检查冷却时间
    if (rule.cooldown) {
      const lastAlert = this.lastAlertTime.get(ruleId);
      if (lastAlert && Date.now() - lastAlert < rule.cooldown) {
        return {
          success: false,
          error: new EketErrorClass(
            EketErrorCode.ALERT_IN_COOLDOWN,
            `告警正在冷却期：${ruleId}`
          ),
        };
      }
    }

    // 创建告警
    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId,
      level: rule.level,
      status: 'new',
      title: rule.name,
      message: rule.description || '',
      context,
      createdAt: Date.now(),
    };

    this.alerts.push(alert);
    this.lastAlertTime.set(ruleId, Date.now());

    // 保存告警
    await this.saveAlert(alert);

    // 发送通知
    await this.sendNotification(alert, rule.channels);

    console.log(`[Alerting] 触发告警：${alert.title} (${alert.level})`);

    return {
      success: true,
      data: alert,
    };
  }

  /**
   * 确认告警
   */
  acknowledge(alertId: string, userId: string): Result<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.ALERT_NOT_FOUND,
          `告警不存在：${alertId}`
        ),
      };
    }

    alert.status = 'acknowledged';
    alert.acknowledgedAt = Date.now();
    alert.acknowledgedBy = userId;

    return { success: true, data: undefined };
  }

  /**
   * 解决告警
   */
  resolve(alertId: string, userId: string): Result<void> {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      return {
        success: false,
        error: new EketErrorClass(
          EketErrorCode.ALERT_NOT_FOUND,
          `告警不存在：${alertId}`
        ),
      };
    }

    alert.status = 'resolved';
    alert.resolvedAt = Date.now();
    alert.resolvedBy = userId;

    return { success: true, data: undefined };
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => a.status === 'new' || a.status === 'acknowledged');
  }

  /**
   * 获取告警统计
   */
  getStats(): AlertStats {
    const now = Date.now();
    const last24Hours = now - 24 * 60 * 60 * 1000;

    const stats: AlertStats = {
      total: this.alerts.length,
      byLevel: { info: 0, warning: 0, error: 0, critical: 0 },
      byStatus: { new: 0, acknowledged: 0, resolved: 0, escalated: 0 },
      last24Hours: 0,
    };

    for (const alert of this.alerts) {
      stats.byLevel[alert.level]++;
      stats.byStatus[alert.status]++;
      if (alert.createdAt > last24Hours) {
        stats.last24Hours++;
      }
    }

    return stats;
  }

  /**
   * 预定义规则：Instance 离线
   */
  registerInstanceOfflineRule(): void {
    this.registerRule({
      id: 'instance_offline',
      name: 'Instance 离线告警',
      description: 'Instance 心跳超时，可能已离线',
      level: 'warning',
      condition: 'heartbeat_timeout > 300000',
      channels: ['webhook'],
      cooldown: 600000,  // 10 分钟冷却
      enabled: true,
    });
  }

  /**
   * 预定义规则：任务阻塞
   */
  registerTaskBlockedRule(): void {
    this.registerRule({
      id: 'task_blocked',
      name: '任务阻塞告警',
      description: '任务长时间处于阻塞状态',
      level: 'warning',
      condition: 'blocked_duration > 3600000',
      channels: ['webhook'],
      cooldown: 3600000,  // 1 小时冷却
      enabled: true,
    });
  }

  /**
   * 预定义规则：关键路径延误
   */
  registerCriticalPathDelayRule(): void {
    this.registerRule({
      id: 'critical_path_delay',
      name: '关键路径延误告警',
      description: '关键路径上的任务进度落后',
      level: 'error',
      condition: 'critical_path_delay > 7200000',
      channels: ['webhook', 'email'],
      cooldown: 3600000,
      enabled: true,
    });
  }

  /**
   * 预定义规则：系统降级
   */
  registerSystemDegradedRule(): void {
    this.registerRule({
      id: 'system_degraded',
      name: '系统降级告警',
      description: '系统运行在降级模式',
      level: 'info',
      condition: 'mode != "level_1"',
      channels: ['webhook'],
      cooldown: 1800000,
      enabled: true,
    });
  }

  /**
   * 发送通知
   */
  private async sendNotification(alert: Alert, channels: NotificationChannel[]): Promise<void> {
    for (const channel of channels) {
      try {
        switch (channel) {
          case 'slack':
            await this.sendSlackNotification(alert);
            break;
          case 'email':
            await this.sendEmailNotification(alert);
            break;
          case 'dingtalk':
            await this.sendDingtalkNotification(alert);
            break;
          case 'webhook':
            await this.sendWebhookNotification(alert);
            break;
        }
      } catch (error) {
        console.error(`[Alerting] 发送${channel}通知失败:`, error);
      }
    }
  }

  /**
   * 发送 Slack 通知
   */
  private async sendSlackNotification(alert: Alert): Promise<void> {
    const config = this.config.slack;
    if (!config || !config.webhookUrl) return;

    const color = this.getSlackColor(alert.level);
    const payload = {
      channel: config.channel,
      attachments: [{
        color,
        title: alert.title,
        text: alert.message,
        fields: Object.entries(alert.context).map(([key, value]) => ({
          title: key,
          value: String(value),
          short: true,
        })),
        ts: Math.floor(alert.createdAt / 1000),
      }],
    };

    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * 发送钉钉通知
   */
  private async sendDingtalkNotification(alert: Alert): Promise<void> {
    const config = this.config.dingtalk;
    if (!config || !config.webhookUrl) return;

    const payload = {
      msgtype: 'markdown',
      markdown: {
        title: alert.title,
        text: `## ${alert.title}\n\n${alert.message}\n\n${this.formatContext(alert.context)}`,
      },
    };

    await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * 发送邮件通知
   */
  private async sendEmailNotification(alert: Alert): Promise<void> {
    const config = this.config.email;
    if (!config) return;

    // 简单实现：将告警写入文件，由外部邮件服务处理
    const emailFile = path.join(this.alertsDir, `email_${alert.id}.json`);
    const emailContent = {
      to: config.recipients,
      subject: `[EKET ${alert.level.toUpperCase()}] ${alert.title}`,
      body: `${alert.message}\n\n详情：${JSON.stringify(alert.context, null, 2)}`,
    };
    fs.writeFileSync(emailFile, JSON.stringify(emailContent, null, 2));
  }

  /**
   * 发送 Webhook 通知
   */
  private async sendWebhookNotification(alert: Alert): Promise<void> {
    const config = this.config.webhook;
    if (!config || !config.url) return;

    await fetch(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: JSON.stringify(alert),
    });
  }

  /**
   * 保存告警到文件
   */
  private async saveAlert(alert: Alert): Promise<void> {
    const date = new Date(alert.createdAt).toISOString().split('T')[0];
    const file = path.join(this.alertsDir, `alerts_${date}.json`);

    let alerts: Alert[] = [];
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      alerts = JSON.parse(content);
    }

    alerts.push(alert);
    fs.writeFileSync(file, JSON.stringify(alerts, null, 2));
  }

  /**
   * 确保告警目录存在
   */
  private ensureAlertsDirectory(): void {
    fs.mkdirSync(this.alertsDir, { recursive: true });
  }

  /**
   * 加载告警规则
   */
  private loadRules(): void {
    const rulesFile = path.join(this.alertsDir, 'rules.json');
    if (fs.existsSync(rulesFile)) {
      const content = fs.readFileSync(rulesFile, 'utf-8');
      const rules = JSON.parse(content);
      for (const rule of rules) {
        this.rules.set(rule.id, rule);
      }
    }
  }

  /**
   * 生成告警 ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取 Slack 颜色
   */
  private getSlackColor(level: AlertLevel): string {
    const colors: Record<AlertLevel, string> = {
      info: '#36a64f',
      warning: '#ff9800',
      error: '#f44336',
      critical: '#9c27b0',
    };
    return colors[level];
  }

  /**
   * 格式化上下文
   */
  private formatContext(context: Record<string, unknown>): string {
    return Object.entries(context)
      .map(([key, value]) => `- **${key}**: ${value}`)
      .join('\n');
  }
}

/**
 * 创建告警系统实例
 */
export function createAlertingSystem(config: {
  alertsDir: string;
  config?: NotificationConfig;
}): AlertingSystem {
  const system = new AlertingSystem(config);

  // 注册预定义规则
  system.registerInstanceOfflineRule();
  system.registerTaskBlockedRule();
  system.registerCriticalPathDelayRule();
  system.registerSystemDegradedRule();

  return system;
}
