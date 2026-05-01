/**
 * TASK-109: SseBus unit tests
 * ≥5 tests covering: broadcast, slaverId filter, removeClient, task:progress event
 */

import { SseBus } from '../../src/core/sse-bus.js';
import type { TaskEvent } from '../../src/types/index.js';

// ---- Mock Response ----
function makeMockRes(slaverId?: string) {
  const written: string[] = [];
  let ended = false;
  const listeners: Record<string, Array<() => void>> = {};

  return {
    writableEnded: false,
    setHeader: () => {},
    flushHeaders: () => {},
    write(chunk: string) {
      written.push(chunk);
      return true;
    },
    end() {
      ended = true;
      (this as unknown as { writableEnded: boolean }).writableEnded = true;
    },
    on(event: string, cb: () => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    emit(event: string) {
      listeners[event]?.forEach((cb) => cb());
    },
    _written: written,
    _ended: () => ended,
  };
}

function makeEvent(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    type: 'task_started',
    ticketId: 'TASK-109',
    slaverId: 'slaver-001',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe('SseBus', () => {
  let bus: SseBus;

  beforeEach(() => {
    SseBus._reset();
    bus = SseBus.getInstance();
  });

  afterEach(() => {
    SseBus._reset();
  });

  // Test 1: publish broadcasts to all clients (no filter)
  it('publishes to all clients when no slaverId filter set', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    bus.addClient(res1 as never);
    bus.addClient(res2 as never);

    const event = makeEvent({ type: 'task_running' });
    bus.publish(event);

    expect(res1._written.length).toBe(1);
    expect(res2._written.length).toBe(1);
    expect(res1._written[0]).toContain('event: task_running');
    expect(res1._written[0]).toContain('"type":"task_running"');
  });

  // Test 2: slaverId filter only sends to matching client
  it('slaverId filter only delivers to matching client', () => {
    const res1 = makeMockRes();
    const res2 = makeMockRes();
    bus.addClient(res1 as never, 'slaver-001');
    bus.addClient(res2 as never, 'slaver-999');

    bus.publish(makeEvent({ slaverId: 'slaver-001' }));

    expect(res1._written.length).toBe(1);
    expect(res2._written.length).toBe(0); // filtered out
  });

  // Test 3: unfiltered client receives all events regardless of slaverId
  it('client with no filter receives events for any slaverId', () => {
    const res = makeMockRes();
    bus.addClient(res as never); // no filter

    bus.publish(makeEvent({ slaverId: 'slaver-AAA' }));
    bus.publish(makeEvent({ slaverId: 'slaver-BBB' }));

    expect(res._written.length).toBe(2);
  });

  // Test 4: removeClient stops further delivery
  it('removeClient stops delivery', () => {
    const res = makeMockRes();
    bus.addClient(res as never);
    bus.removeClient(res as never);

    bus.publish(makeEvent());

    expect(res._written.length).toBe(0);
  });

  // Test 5: auto-remove on 'close' event
  it('auto-removes client on res close event', () => {
    const res = makeMockRes();
    bus.addClient(res as never);
    res.emit('close'); // trigger listener attached in addClient

    bus.publish(makeEvent());
    expect(res._written.length).toBe(0);
  });

  // Test 6: task:progress publishes task_running event with correct payload
  it('task_running event carries phase/todos/done payload', () => {
    const res = makeMockRes();
    bus.addClient(res as never);

    const event: TaskEvent = {
      type: 'task_running',
      ticketId: 'TASK-109',
      slaverId: 'slaver-001',
      timestamp: new Date().toISOString(),
      payload: { phase: 'implement', todos: 10, done: 5 },
    };
    bus.publish(event);

    expect(res._written.length).toBe(1);
    const raw = res._written[0];
    expect(raw).toContain('event: task_running');
    const jsonLine = raw.split('\n').find((l) => l.startsWith('data:'))!;
    const parsed = JSON.parse(jsonLine.replace('data: ', '')) as TaskEvent;
    expect(parsed.payload).toEqual({ phase: 'implement', todos: 10, done: 5 });
  });

  // Test 7: singleton getInstance returns same instance
  it('getInstance returns singleton', () => {
    const a = SseBus.getInstance();
    const b = SseBus.getInstance();
    expect(a).toBe(b);
  });
});
