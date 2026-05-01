/**
 * EKET Framework - Middleware Pipeline Tests (TASK-106)
 */

import { describe, it, expect } from '@jest/globals';
import {
  PipelineExecutor,
  MiddlewareNode,
} from '../../src/core/middleware-pipeline.js';

type S = Record<string, unknown>;

function makeNode(
  id: string,
  deps: string[],
  handler: (s: S) => Promise<S>,
  failBehavior: 'block' | 'warn' | 'skip' = 'block',
  parallel = true
): MiddlewareNode<S> {
  return { id, deps, parallel, failBehavior, handle: handler };
}

function pass(extra: S = {}): (s: S) => Promise<S> {
  return async (s) => ({ ...s, ...extra });
}

function fail(): (s: S) => Promise<S> {
  return async () => { throw new Error('node failed'); };
}

describe('middleware-pipeline', () => {
  // 1. 线性执行 A→B→C
  it('executes linear chain A→B→C in order', async () => {
    const log: string[] = [];
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', [], async (s) => { log.push('A'); return s; }),
      makeNode('B', ['A'], async (s) => { log.push('B'); return s; }),
      makeNode('C', ['B'], async (s) => { log.push('C'); return s; }),
    ];
    const result = await new PipelineExecutor(nodes).execute({});
    expect(result.executed).toEqual(['A', 'B', 'C']);
    expect(result.skipped).toEqual([]);
    expect(result.blocked).toBeUndefined();
    expect(log).toEqual(['A', 'B', 'C']);
  });

  // 2. 并行层 A∥B→C
  it('executes parallel layer A∥B then C', async () => {
    const started: string[] = [];
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', [], async (s) => { started.push('A'); return s; }),
      makeNode('B', [], async (s) => { started.push('B'); return s; }),
      makeNode('C', ['A', 'B'], async (s) => { started.push('C'); return s; }),
    ];
    const result = await new PipelineExecutor(nodes).execute({});
    expect(result.executed).toContain('A');
    expect(result.executed).toContain('B');
    expect(result.executed).toContain('C');
    // A and B executed before C
    expect(started.indexOf('C')).toBeGreaterThan(started.indexOf('A'));
    expect(started.indexOf('C')).toBeGreaterThan(started.indexOf('B'));
  });

  // 3. block 停止 pipeline
  it('stops pipeline on block failure', async () => {
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', [], pass(), 'block'),
      makeNode('B', ['A'], fail(), 'block'),
      makeNode('C', ['B'], pass(), 'block'),
    ];
    const result = await new PipelineExecutor(nodes).execute({});
    expect(result.blocked).toBe('B');
    expect(result.executed).toContain('A');
    expect(result.executed).not.toContain('C');
  });

  // 4. warn 继续执行
  it('continues pipeline on warn failure', async () => {
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', [], pass({ v: 1 }), 'warn'),
      makeNode('B', ['A'], fail(), 'warn'),
      makeNode('C', ['B'], pass({ v: 3 }), 'warn'),
    ];
    const result = await new PipelineExecutor(nodes).execute({});
    expect(result.blocked).toBeUndefined();
    expect(result.executed).toContain('A');
    expect(result.executed).toContain('B'); // warn: counted as executed
    expect(result.executed).toContain('C');
  });

  // 5. skip 传播到后续依赖节点
  it('propagates skip to downstream dependents', async () => {
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', [], pass(), 'skip'),
      makeNode('B', ['A'], fail(), 'skip'), // B fails → skip
      makeNode('C', ['B'], pass(), 'skip'), // C depends on B → also skip
      makeNode('D', [], pass(), 'skip'),    // D independent → still runs
    ];
    const result = await new PipelineExecutor(nodes).execute({});
    expect(result.skipped).toContain('B');
    expect(result.skipped).toContain('C');
    expect(result.executed).toContain('A');
    expect(result.executed).toContain('D');
  });

  // 6. 环检测抛错
  it('throws on cyclic dependency', () => {
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', ['C'], pass()),
      makeNode('B', ['A'], pass()),
      makeNode('C', ['B'], pass()),
    ];
    expect(() => new PipelineExecutor(nodes).execute({})).rejects.toThrow(/[Cc]ycle/);
  });

  // 7. state 正确传递和合并
  it('threads state through pipeline', async () => {
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', [], async (s) => ({ ...s, a: 1 })),
      makeNode('B', ['A'], async (s) => ({ ...s, b: 2 })),
    ];
    const result = await new PipelineExecutor(nodes).execute({ init: true });
    expect(result.state).toMatchObject({ init: true, a: 1, b: 2 });
  });

  // 8. 未知依赖抛错
  it('throws on unknown dependency reference', () => {
    const nodes: MiddlewareNode<S>[] = [
      makeNode('A', ['nonexistent'], pass()),
    ];
    expect(() => new PipelineExecutor(nodes).execute({})).rejects.toThrow(/unknown node/);
  });
});
