/**
 * SseBus — SSE 5-state task event bus (TASK-109)
 *
 * 单例广播总线，支持按 slaverId 过滤。
 * SSE 格式：event: <type>\ndata: <JSON>\n\n
 */
import type { Response } from 'express';
import type { TaskEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';

export class SseBus {
  /** res → optional slaverId filter */
  private clients: Map<Response, string | undefined> = new Map();

  private static _instance: SseBus | undefined;

  static getInstance(): SseBus {
    if (!SseBus._instance) {
      SseBus._instance = new SseBus();
    }
    return SseBus._instance;
  }

  addClient(res: Response, slaverId?: string): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    this.clients.set(res, slaverId);
    logger.info('sse_bus_client_added', { slaverId, total: this.clients.size });

    res.on('close', () => {
      this.removeClient(res);
    });
  }

  removeClient(res: Response): void {
    this.clients.delete(res);
    if (!res.writableEnded) {
      res.end();
    }
    logger.info('sse_bus_client_removed', { total: this.clients.size });
  }

  publish(event: TaskEvent): void {
    const dead: Response[] = [];
    for (const [res, filter] of this.clients.entries()) {
      // Filter: if client has slaverId filter, only send matching events
      if (filter !== undefined && filter !== event.slaverId) continue;

      if (res.writableEnded) {
        dead.push(res);
        continue;
      }
      try {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch (err) {
        logger.warn('sse_bus_write_error', { error: (err as Error).message });
        dead.push(res);
      }
    }
    for (const res of dead) {
      this.clients.delete(res);
    }
  }

  /** For testing: reset singleton */
  static _reset(): void {
    SseBus._instance = undefined;
  }
}

export const sseBus = SseBus.getInstance();
