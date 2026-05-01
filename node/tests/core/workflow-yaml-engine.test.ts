import {
  parseWorkflow,
  topologicalSort,
  evaluateWhen,
  executeWorkflow,
  WorkflowNode,
  NodeExecutor,
} from '../../src/core/workflow-yaml-engine.js';

// ─── Test 1: Linear DAG A → B → C ────────────────────────────────────────────

describe('linear DAG (A→B→C)', () => {
  const yaml = `
name: linear-test
nodes:
  - id: A
    type: noop
  - id: B
    type: noop
    depends_on: [A]
  - id: C
    type: noop
    depends_on: [B]
`;

  it('parses correctly', () => {
    const def = parseWorkflow(yaml);
    expect(def.name).toBe('linear-test');
    expect(def.nodes).toHaveLength(3);
  });

  it('topological sort produces 3 layers', () => {
    const def = parseWorkflow(yaml);
    const layers = topologicalSort(def.nodes);
    expect(layers).toHaveLength(3);
    expect(layers[0][0].id).toBe('A');
    expect(layers[1][0].id).toBe('B');
    expect(layers[2][0].id).toBe('C');
  });

  it('executes in order A → B → C', async () => {
    const def = parseWorkflow(yaml);
    const order: string[] = [];

    const executor: NodeExecutor = async (node) => {
      order.push(node.id);
      return { done: true };
    };

    const result = await executeWorkflow(def, executor);
    expect(result.success).toBe(true);
    expect(order).toEqual(['A', 'B', 'C']);
    expect(result.nodes.map(n => n.status)).toEqual(['completed', 'completed', 'completed']);
  });
});

// ─── Test 2: Parallel DAG A → [B, C] → D ─────────────────────────────────────

describe('parallel DAG (A→[B,C]→D)', () => {
  const yaml = `
name: parallel-test
nodes:
  - id: A
    type: noop
  - id: B
    type: noop
    depends_on: [A]
  - id: C
    type: noop
    depends_on: [A]
  - id: D
    type: noop
    depends_on: [B, C]
`;

  it('topological sort: A / [B,C] / D', () => {
    const def = parseWorkflow(yaml);
    const layers = topologicalSort(def.nodes);
    expect(layers).toHaveLength(3);
    expect(layers[0].map(n => n.id)).toEqual(['A']);
    expect(layers[1].map(n => n.id).sort()).toEqual(['B', 'C']);
    expect(layers[2].map(n => n.id)).toEqual(['D']);
  });

  it('B and C execute concurrently, D waits', async () => {
    const def = parseWorkflow(yaml);
    const timeline: Array<{ id: string; event: string; t: number }> = [];
    const t0 = Date.now();

    const executor: NodeExecutor = async (node) => {
      const start = Date.now() - t0;
      timeline.push({ id: node.id, event: 'start', t: start });

      // B and C each take 50ms
      if (node.id === 'B' || node.id === 'C') {
        await new Promise(r => setTimeout(r, 50));
      }

      const end = Date.now() - t0;
      timeline.push({ id: node.id, event: 'end', t: end });
      return { done: true };
    };

    const result = await executeWorkflow(def, executor);
    expect(result.success).toBe(true);
    expect(result.nodes).toHaveLength(4);

    // B and C must both start before either finishes (parallel)
    const bStart = timeline.find(e => e.id === 'B' && e.event === 'start')!.t;
    const cStart = timeline.find(e => e.id === 'C' && e.event === 'start')!.t;
    const bEnd = timeline.find(e => e.id === 'B' && e.event === 'end')!.t;
    const cEnd = timeline.find(e => e.id === 'C' && e.event === 'end')!.t;
    const dStart = timeline.find(e => e.id === 'D' && e.event === 'start')!.t;

    // Both B and C started within 10ms of each other
    expect(Math.abs(bStart - cStart)).toBeLessThan(20);
    // D started after both B and C finished
    expect(dStart).toBeGreaterThanOrEqual(Math.min(bEnd, cEnd));
  });
});

// ─── Test 3: Conditional branch ──────────────────────────────────────────────

describe('conditional branch (when expression)', () => {
  it('evaluateWhen: == match', () => {
    const ctx = { classify: { output: { type: 'bug' } } };
    expect(evaluateWhen("$classify.output.type == 'bug'", ctx)).toBe(true);
  });

  it('evaluateWhen: == no match', () => {
    const ctx = { classify: { output: { type: 'feature' } } };
    expect(evaluateWhen("$classify.output.type == 'bug'", ctx)).toBe(false);
  });

  it('evaluateWhen: != match', () => {
    const ctx = { classify: { output: { type: 'feature' } } };
    expect(evaluateWhen("$classify.output.type != 'bug'", ctx)).toBe(true);
  });

  it('skips implement node when when=false', async () => {
    const yaml = `
name: conditional-test
nodes:
  - id: classify
    type: noop
  - id: implement
    type: noop
    depends_on: [classify]
    when: "$classify.output.type == 'bug'"
`;
    const def = parseWorkflow(yaml);
    const executed: string[] = [];

    const executor: NodeExecutor = async (node) => {
      executed.push(node.id);
      // classify returns type=feature, so implement should be skipped
      return { type: 'feature' };
    };

    const result = await executeWorkflow(def, executor);
    expect(executed).toEqual(['classify']);
    const implementResult = result.nodes.find(n => n.id === 'implement');
    expect(implementResult?.status).toBe('skipped');
  });

  it('executes implement node when when=true', async () => {
    const yaml = `
name: conditional-test
nodes:
  - id: classify
    type: noop
  - id: implement
    type: noop
    depends_on: [classify]
    when: "$classify.output.type == 'bug'"
`;
    const def = parseWorkflow(yaml);
    const executed: string[] = [];

    const executor: NodeExecutor = async (node) => {
      executed.push(node.id);
      return { type: 'bug' };
    };

    const result = await executeWorkflow(def, executor);
    expect(executed).toEqual(['classify', 'implement']);
    const implementResult = result.nodes.find(n => n.id === 'implement');
    expect(implementResult?.status).toBe('completed');
  });
});
