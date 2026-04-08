#!/usr/bin/env ts-node
/**
 * EKET Master Agent - End-to-End Demo
 *
 * Master Agent 负责：
 * - 创建和分配任务
 * - 接收 PR Review 请求
 * - 审核并合并 PR
 * - 监控 Slaver 状态
 */

import { EketClient } from '../../../sdk/javascript/src/index.js';
import type { Message } from '../../../sdk/javascript/src/types.js';

// ============================================================================
// 配置
// ============================================================================

const CONFIG = {
  serverUrl: process.env.EKET_SERVER_URL || 'http://localhost:8080',
  heartbeatInterval: 30000, // 30 秒
  autoShutdown: false, // 是否在任务完成后自动关闭
};

// ============================================================================
// 工具函数
// ============================================================================

function log(emoji: string, message: string): void {
  const timestamp = new Date().toLocaleTimeString('zh-CN');
  console.log(`[${timestamp}] [Master] ${emoji} ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Master Agent 类
// ============================================================================

class MasterAgent {
  private client: EketClient;
  private instanceId?: string;
  private heartbeatTimer?: NodeJS.Timeout;
  private tasksCompleted = 0;
  private running = true;

  constructor() {
    this.client = new EketClient({
      serverUrl: CONFIG.serverUrl,
      enableWebSocket: true,
    });
  }

  /**
   * 启动 Master Agent
   */
  async start(): Promise<void> {
    try {
      log('🚀', 'Starting Master Agent...');

      // 1. 注册为 Master
      await this.register();

      // 2. 连接 WebSocket
      await this.connectWebSocket();

      // 3. 开始心跳
      this.startHeartbeat();

      // 4. 创建示例任务
      await this.createDemoTask();

      // 5. 监听消息
      this.listenForMessages();

      log('👂', 'Listening for messages... (Press Ctrl+C to exit)');

      // 保持运行
      await this.keepAlive();
    } catch (error) {
      log('❌', `Error: ${extractErrorMessage(error)}`);
      await this.shutdown();
      process.exit(1);
    }
  }

  /**
   * 注册为 Master
   */
  private async register(): Promise<void> {
    const response = await this.client.registerAgent({
      agent_type: 'claude_code',
      agent_version: '1.0.0',
      role: 'master',
      metadata: {
        user: 'demo',
        machine: 'localhost',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });

    this.instanceId = response.instance_id;
    log('✅', `Registered as ${this.instanceId}`);
  }

  /**
   * 连接 WebSocket
   */
  private async connectWebSocket(): Promise<void> {
    if (!this.instanceId) {
      throw new Error('Cannot connect WebSocket: not registered');
    }

    await this.client.connectWebSocket(this.instanceId);
    log('🔌', 'WebSocket connected');
  }

  /**
   * 开始心跳
   */
  private startHeartbeat(): void {
    log('💓', `Heartbeat started (every ${CONFIG.heartbeatInterval / 1000}s)`);

    this.heartbeatTimer = setInterval(async () => {
      if (!this.instanceId) return;

      try {
        await this.client.sendHeartbeat(this.instanceId, {
          status: 'active',
        });
        log('💓', 'Heartbeat sent');
      } catch (error) {
        log('⚠️', `Heartbeat failed: ${extractErrorMessage(error)}`);
      }
    }, CONFIG.heartbeatInterval);
  }

  /**
   * 创建演示任务
   */
  private async createDemoTask(): Promise<void> {
    // Note: 在实际实现中，需要通过 EKET Server API 创建任务
    // 这里我们模拟创建任务的过程

    const task = {
      id: 'FEAT-001',
      title: 'Implement user login',
      type: 'feature',
      priority: 'P0',
      status: 'ready',
      description: 'Implement user login feature with email and password authentication',
      acceptance_criteria: [
        { description: 'Users can login with email/password', completed: false },
        { description: 'Invalid credentials show error message', completed: false },
        { description: 'Successful login stores auth token', completed: false },
      ],
      tags: ['frontend', 'authentication'],
      estimate: '8h',
    };

    log('📋', `Creating task ${task.id}: ${task.title}`);
    log('ℹ️', `Task is now available for Slaver agents to claim`);

    // 实际项目中，应该调用类似这样的 API:
    // await this.client.createTask(task);
  }

  /**
   * 监听消息
   */
  private listenForMessages(): void {
    this.client.onMessage(async (message: Message) => {
      log('📬', `Received message: ${message.type} from ${message.from}`);

      if (message.type === 'pr_review_request') {
        await this.handlePRReviewRequest(message);
      } else if (message.type === 'help_request') {
        await this.handleHelpRequest(message);
      } else if (message.type === 'status_update') {
        this.handleStatusUpdate(message);
      }
    });

    this.client.onError((error: Error) => {
      log('⚠️', `WebSocket error: ${error.message}`);
    });

    this.client.onClose(() => {
      log('🔌', 'WebSocket disconnected');
      if (this.running) {
        log('🔄', 'Attempting to reconnect...');
      }
    });
  }

  /**
   * 处理 PR Review 请求
   */
  private async handlePRReviewRequest(message: Message): Promise<void> {
    const { task_id, branch, description, test_status } = message.payload;

    log('🔍', `Reviewing PR for task ${task_id}...`);
    log('ℹ️', `Branch: ${branch}`);
    log('ℹ️', `Test status: ${test_status}`);

    // 模拟 Review 过程
    await sleep(2000);

    try {
      // 审核 PR
      await this.client.reviewPR(task_id, {
        reviewer: this.instanceId!,
        status: 'approved',
        summary: 'Great work! Code looks clean and tests are comprehensive.',
        comments: [],
      });

      log('✅', 'PR approved!');

      // 合并 PR
      log('🔀', 'Merging PR to main...');
      const result = await this.client.mergePR(task_id, {
        merger: this.instanceId!,
        target_branch: 'main',
        squash: false,
      });

      log('✅', `PR merged successfully! (commit: ${result.merge_commit})`);

      this.tasksCompleted++;

      // 如果配置了自动关闭，完成任务后关闭
      if (CONFIG.autoShutdown) {
        log('🎉', 'All tasks completed!');
        await this.shutdown();
        process.exit(0);
      }
    } catch (error) {
      log('❌', `Failed to review/merge PR: ${extractErrorMessage(error)}`);
    }
  }

  /**
   * 处理帮助请求
   */
  private async handleHelpRequest(message: Message): Promise<void> {
    const { task_id, issue, description } = message.payload;

    log('🆘', `Help request for task ${task_id}`);
    log('ℹ️', `Issue: ${issue}`);
    log('ℹ️', `Description: ${description}`);

    // 实际项目中，Master 可以提供指导或重新分配任务
    log('💬', 'Providing guidance to Slaver...');
  }

  /**
   * 处理状态更新
   */
  private handleStatusUpdate(message: Message): void {
    const { task_id, status, progress, notes } = message.payload;

    log('📊', `Task ${task_id} status update:`);
    log('ℹ️', `  Status: ${status}`);
    log('ℹ️', `  Progress: ${(progress * 100).toFixed(0)}%`);
    if (notes) {
      log('ℹ️', `  Notes: ${notes}`);
    }
  }

  /**
   * 保持运行
   */
  private async keepAlive(): Promise<void> {
    while (this.running) {
      await sleep(1000);
    }
  }

  /**
   * 关闭 Master Agent
   */
  async shutdown(): Promise<void> {
    log('👋', 'Shutting down Master Agent...');

    this.running = false;

    // 停止心跳
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // 注销
    if (this.instanceId) {
      try {
        await this.client.deregisterAgent(this.instanceId);
        log('✅', 'Deregistered successfully');
      } catch (error) {
        log('⚠️', `Deregistration failed: ${extractErrorMessage(error)}`);
      }
    }

    // 关闭客户端
    await this.client.shutdown();
    log('✅', 'Master Agent stopped');
  }
}

// ============================================================================
// 辅助函数
// ============================================================================

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

// ============================================================================
// 主程序
// ============================================================================

async function main() {
  console.log('=== EKET Master Agent Demo ===\n');

  const master = new MasterAgent();

  // 处理退出信号
  process.on('SIGINT', async () => {
    console.log('\n');
    await master.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await master.shutdown();
    process.exit(0);
  });

  await master.start();
}

// 运行
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
