import { jest } from '@jest/globals';
import { SSEEventBus, SSEEvent } from '../../src/core/sse-event-bus.js';
import { Response } from 'express';

function mockRes(): Response {
  const res = {
    headersSent: false,
    write: jest.fn(),
    setHeader: jest.fn(),
    on: jest.fn(),
  } as unknown as Response;
  return res;
}

describe('SSEEventBus', () => {
  let bus: SSEEventBus;

  beforeEach(() => {
    bus = new SSEEventBus();
  });

  test('subscribe increases subscriber count to 1', () => {
    const res = mockRes();
    bus.subscribe('ch1', res);
    expect(bus.getSubscriberCount('ch1')).toBe(1);
  });

  test('unsubscribe decreases subscriber count to 0', () => {
    const res = mockRes();
    const unsub = bus.subscribe('ch1', res);
    unsub();
    expect(bus.getSubscriberCount('ch1')).toBe(0);
  });

  test('subscribe sends initial heartbeat', () => {
    const res = mockRes();
    bus.subscribe('ch1', res);
    expect((res.write as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    const firstCall = (res.write as jest.Mock).mock.calls[0][0] as string;
    expect(firstCall).toContain('heartbeat');
  });

  test('publish sends event to channelId subscribers', () => {
    const res = mockRes();
    bus.subscribe('ch1', res);
    (res.write as jest.Mock).mockClear();

    const event: SSEEvent = { type: 'agent_status', data: { id: '1' }, timestamp: new Date().toISOString() };
    bus.publish('ch1', event);

    expect(res.write).toHaveBeenCalledTimes(1);
    const payload = (res.write as jest.Mock).mock.calls[0][0] as string;
    expect(payload).toContain('agent_status');
  });

  test('publish also broadcasts to __dashboard__', () => {
    const dashboard = mockRes();
    bus.subscribe('__dashboard__', dashboard);
    (dashboard.write as jest.Mock).mockClear();

    const event: SSEEvent = { type: 'ticket_progress', data: {}, timestamp: new Date().toISOString() };
    bus.publish('ch1', event);

    expect(dashboard.write).toHaveBeenCalledTimes(1);
  });

  test('publish to __dashboard__ does not double-send', () => {
    const res = mockRes();
    bus.subscribe('__dashboard__', res);
    (res.write as jest.Mock).mockClear();

    const event: SSEEvent = { type: 'system_status', data: {}, timestamp: new Date().toISOString() };
    bus.publish('__dashboard__', event);

    // Only 1 send (not doubled)
    expect(res.write).toHaveBeenCalledTimes(1);
  });

  test('broadcast reaches all channel subscribers', () => {
    const res1 = mockRes();
    const res2 = mockRes();
    bus.subscribe('ch1', res1);
    bus.subscribe('ch2', res2);
    (res1.write as jest.Mock).mockClear();
    (res2.write as jest.Mock).mockClear();

    const event: SSEEvent = { type: 'heartbeat', data: {}, timestamp: new Date().toISOString() };
    bus.broadcast(event);

    expect(res1.write).toHaveBeenCalledTimes(1);
    expect(res2.write).toHaveBeenCalledTimes(1);
  });

  test('getChannelCount reflects active channels', () => {
    expect(bus.getChannelCount()).toBe(0);
    const res = mockRes();
    bus.subscribe('ch1', res);
    expect(bus.getChannelCount()).toBe(1);
  });
});
