/**
 * SSE Event Bus
 *
 * 发布/订阅模式的 Server-Sent Events 事件总线。
 * 支持 9 种事件类型，__dashboard__ 为全局广播频道。
 */
import type { Response } from 'express';
import { logger } from '../utils/logger.js';

export type SSEEventType =
  | 'text'
  | 'agent_status'
  | 'ticket_progress'
  | 'heartbeat'
  | 'conversation_lock'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'system_status';

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

const DASHBOARD_CHANNEL = '__dashboard__';

export class SSEEventBus {
  /** channelId → Set of active SSE response objects */
  private subscribers: Map<string, Set<Response>> = new Map();

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Subscribe a response object to a channel.
   * Sets SSE headers and keeps the connection alive.
   */
  subscribe(channelId: string, res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    if (!this.subscribers.has(channelId)) {
      this.subscribers.set(channelId, new Set());
    }
    this.subscribers.get(channelId)!.add(res);

    logger.info('sse_subscribed', { channelId, total: this.subscribers.get(channelId)!.size });

    // Send initial connection event
    this._write(res, { type: 'system_status', data: { connected: true, channelId }, timestamp: new Date().toISOString() });
  }

  /**
   * Publish an event to a channel.
   * Always also broadcasts to __dashboard__ unless channelId IS __dashboard__.
   */
  publish(channelId: string, event: SSEEvent): void {
    this._broadcast(channelId, event);
    if (channelId !== DASHBOARD_CHANNEL) {
      this._broadcast(DASHBOARD_CHANNEL, event);
    }
  }

  /**
   * Unsubscribe a response object from a channel.
   * Ends the response if it hasn't been ended yet.
   */
  unsubscribe(channelId: string, res: Response): void {
    const subs = this.subscribers.get(channelId);
    if (subs) {
      subs.delete(res);
      if (subs.size === 0) {
        this.subscribers.delete(channelId);
      }
    }
    if (!res.writableEnded) {
      res.end();
    }
    logger.info('sse_unsubscribed', { channelId });
  }

  /** Return the number of active subscribers for a channel. */
  subscriberCount(channelId: string): number {
    return this.subscribers.get(channelId)?.size ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _broadcast(channelId: string, event: SSEEvent): void {
    const subs = this.subscribers.get(channelId);
    if (!subs || subs.size === 0) return;

    const dead: Response[] = [];
    for (const res of subs) {
      if (res.writableEnded) {
        dead.push(res);
        continue;
      }
      this._write(res, event);
    }
    // Clean up dead connections
    for (const res of dead) {
      subs.delete(res);
    }
  }

  private _write(res: Response, event: SSEEvent): void {
    try {
      const data = JSON.stringify(event);
      res.write(`event: ${event.type}\ndata: ${data}\n\n`);
    } catch (err) {
      logger.warn('sse_write_error', { error: (err as Error).message });
    }
  }
}

/** Singleton instance shared across the server process */
export const sseEventBus = new SSEEventBus();
