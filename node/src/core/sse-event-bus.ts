import { Response } from 'express';

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

export class SSEEventBus {
  private channels = new Map<string, Set<Response>>();
  private DASHBOARD_CHANNEL = '__dashboard__';

  subscribe(channelId: string, res: Response): () => void {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
    }

    if (!this.channels.has(channelId)) {
      this.channels.set(channelId, new Set());
    }
    this.channels.get(channelId)!.add(res);

    // Send initial heartbeat
    this.sendToRes(res, { type: 'heartbeat', data: { channelId }, timestamp: new Date().toISOString() });

    const unsubscribe = () => {
      const ch = this.channels.get(channelId);
      if (ch) {
        ch.delete(res);
        if (ch.size === 0) {
          this.channels.delete(channelId);
        }
      }
    };

    res.on('close', unsubscribe);

    return unsubscribe;
  }

  private sendToRes(res: Response, event: SSEEvent): void {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      // ignore write errors (client disconnected)
    }
  }

  publish(channelId: string, event: SSEEvent): void {
    const subscribers = this.channels.get(channelId);
    if (subscribers) {
      for (const res of subscribers) {
        this.sendToRes(res, event);
      }
    }

    // Broadcast to dashboard unless this IS the dashboard
    if (channelId !== this.DASHBOARD_CHANNEL) {
      const dashboard = this.channels.get(this.DASHBOARD_CHANNEL);
      if (dashboard) {
        for (const res of dashboard) {
          this.sendToRes(res, event);
        }
      }
    }
  }

  broadcast(event: SSEEvent): void {
    for (const [, subscribers] of this.channels) {
      for (const res of subscribers) {
        this.sendToRes(res, event);
      }
    }
  }

  getChannelCount(): number {
    return this.channels.size;
  }

  getSubscriberCount(channelId: string): number {
    return this.channels.get(channelId)?.size ?? 0;
  }
}

export const globalSSEBus = new SSEEventBus();
