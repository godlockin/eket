/**
 * Tests for SSEEventBus
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import { SSEEventBus, type SSEEvent } from '../../src/core/sse-event-bus.js';
import type { Response } from 'express';

function makeMockRes(): Response {
  const writes: string[] = [];
  const res = {
    setHeader: (_name: string, _value: string) => {},
    flushHeaders: () => {},
    write: (chunk: string) => { writes.push(chunk); return true; },
    end: () => {},
    writableEnded: false,
    _writes: writes,
  } as unknown as Response;
  return res;
}

describe('SSEEventBus', () => {
  let bus: SSEEventBus;

  beforeEach(() => {
    bus = new SSEEventBus();
  });

  describe('subscribe', () => {
    it('sets SSE headers and sends initial system_status event', () => {
      const headers: Record<string, string> = {};
      const writes: string[] = [];
      let flushed = false;
      const res = {
        setHeader: (name: string, value: string) => { headers[name] = value; },
        flushHeaders: () => { flushed = true; },
        write: (chunk: string) => { writes.push(chunk); return true; },
        end: () => {},
        writableEnded: false,
        _writes: writes,
      } as unknown as Response;

      bus.subscribe('chan-1', res);

      expect(headers['Content-Type']).toBe('text/event-stream');
      expect(flushed).toBe(true);
      expect(writes.length).toBe(1);
      expect(writes[0]).toContain('system_status');
    });

    it('increments subscriber count', () => {
      const res = makeMockRes();
      bus.subscribe('chan-2', res);
      expect(bus.subscriberCount('chan-2')).toBe(1);
    });
  });

  describe('publish', () => {
    it('delivers event to channel subscriber', () => {
      const res = makeMockRes();
      bus.subscribe('chan-3', res);
      const initialWrites = (res as any)._writes.length;

      const event: SSEEvent = { type: 'heartbeat', data: { ping: true }, timestamp: new Date().toISOString() };
      bus.publish('chan-3', event);

      expect((res as any)._writes.length).toBe(initialWrites + 1);
      expect((res as any)._writes[initialWrites]).toContain('heartbeat');
    });

    it('auto-broadcasts to __dashboard__ channel', () => {
      const chanRes = makeMockRes();
      const dashRes = makeMockRes();
      bus.subscribe('chan-4', chanRes);
      bus.subscribe('__dashboard__', dashRes);

      const event: SSEEvent = { type: 'agent_status', data: { health: 'GREEN' }, timestamp: new Date().toISOString() };
      bus.publish('chan-4', event);

      // Both chan and dashboard should receive the event
      const chanWrites = (chanRes as any)._writes as string[];
      const dashWrites = (dashRes as any)._writes as string[];
      expect(chanWrites.some((w) => w.includes('agent_status'))).toBe(true);
      expect(dashWrites.some((w) => w.includes('agent_status'))).toBe(true);
    });

    it('does NOT double-broadcast when publishing directly to __dashboard__', () => {
      const dashRes = makeMockRes();
      bus.subscribe('__dashboard__', dashRes);
      const initialWrites = (dashRes as any)._writes.length;

      const event: SSEEvent = { type: 'system_status', data: {}, timestamp: new Date().toISOString() };
      bus.publish('__dashboard__', event);

      // Should receive exactly 1 event write (not 2)
      expect((dashRes as any)._writes.length).toBe(initialWrites + 1);
    });

    it('handles 9 event types without error', () => {
      const res = makeMockRes();
      bus.subscribe('chan-types', res);
      const types: SSEEvent['type'][] = [
        'text', 'agent_status', 'ticket_progress', 'heartbeat',
        'conversation_lock', 'tool_call', 'tool_result', 'error', 'system_status',
      ];
      for (const type of types) {
        expect(() => bus.publish('chan-types', { type, data: {}, timestamp: new Date().toISOString() })).not.toThrow();
      }
    });
  });

  describe('unsubscribe', () => {
    it('removes subscriber and ends response', () => {
      let ended = false;
      const res = makeMockRes();
      (res as any).end = () => { ended = true; };
      bus.subscribe('chan-5', res);
      expect(bus.subscriberCount('chan-5')).toBe(1);

      bus.unsubscribe('chan-5', res);
      expect(bus.subscriberCount('chan-5')).toBe(0);
      expect(ended).toBe(true);
    });

    it('does not publish to unsubscribed response', () => {
      const res = makeMockRes();
      bus.subscribe('chan-6', res);
      bus.unsubscribe('chan-6', res);
      const writesBefore = (res as any)._writes.length;

      bus.publish('chan-6', { type: 'text', data: 'hi', timestamp: new Date().toISOString() });
      expect((res as any)._writes.length).toBe(writesBefore); // no new writes
    });
  });

  describe('dead connection cleanup', () => {
    it('removes subscriber when writableEnded=true after publish', () => {
      const res = makeMockRes();
      bus.subscribe('chan-dead', res);
      expect(bus.subscriberCount('chan-dead')).toBe(1);

      // Mark connection as ended
      (res as any).writableEnded = true;

      bus.publish('chan-dead', { type: 'heartbeat', data: {}, timestamp: new Date().toISOString() });
      expect(bus.subscriberCount('chan-dead')).toBe(0);
    });

    it('removes subscriber when _write throws', () => {
      const res = makeMockRes();
      // Override write to throw
      (res as any).write = () => { throw new Error('socket closed'); };
      bus.subscribe('chan-throw', res);
      expect(bus.subscriberCount('chan-throw')).toBe(1);

      bus.publish('chan-throw', { type: 'heartbeat', data: {}, timestamp: new Date().toISOString() });
      expect(bus.subscriberCount('chan-throw')).toBe(0);
    });
  });
});
