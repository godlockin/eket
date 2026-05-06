/**
 * TASK-158: Redis Queue 语义统一 — 双模式测试
 * 验证：任务类消息 → list_queue (LPUSH/BRPOP)；事件类 → pubsub
 */

import { resolveQueueMode, type QueueMode } from '../src/core/message-queue.js';

describe('TASK-158: resolveQueueMode — 消息类型 → 队列模式映射', () => {
  const taskTypes: string[] = [
    'task_assigned',
    'task_claimed',
    'task_completed',
    'task_complete',
    'task_blocked',
    'task_progress',
    'pr_review_request',
    'help_request',
    'help_response',
  ];

  const pubsubTypes: string[] = [
    'notification',
    'knowledge_share',
    'status_update',
    'system_alert',
    'custom_event',
  ];

  test.each(taskTypes)('task type "%s" → list_queue', (type) => {
    const mode: QueueMode = resolveQueueMode(type);
    expect(mode).toBe('list_queue');
  });

  test.each(pubsubTypes)('event type "%s" → pubsub', (type) => {
    const mode: QueueMode = resolveQueueMode(type);
    expect(mode).toBe('pubsub');
  });

  test('unknown type defaults to pubsub', () => {
    expect(resolveQueueMode('some_unknown_type')).toBe('pubsub');
  });
});

describe('TASK-158: QueueMode 语义描述', () => {
  test('list_queue 语义：LPUSH/BRPOP 保证单消费者', () => {
    // 核心设计：任务分发使用 list_queue，保证每条消息只被一个 Slaver 消费
    const mode = resolveQueueMode('task_assigned');
    expect(mode).toBe('list_queue');

    // 幂等验证：相同任务类型始终返回相同模式
    const modes = ['task_assigned', 'task_claimed', 'pr_review_request'].map(resolveQueueMode);
    expect(modes.every((m) => m === 'list_queue')).toBe(true);
  });

  test('pubsub 语义：PUBLISH/SUBSCRIBE fanout 多消费者', () => {
    // 事件通知使用 pubsub，允许多个订阅者同时接收
    const mode = resolveQueueMode('notification');
    expect(mode).toBe('pubsub');

    const modes = ['notification', 'knowledge_share', 'system_alert'].map(resolveQueueMode);
    expect(modes.every((m) => m === 'pubsub')).toBe(true);
  });
});
