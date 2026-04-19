import yaml from 'js-yaml';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WorkflowNode {
  id: string;
  type: 'prompt' | 'bash' | 'noop';
  depends_on?: string[];
  when?: string;
  prompt?: string;
  bash?: string;
  model?: string;
  fresh_context?: boolean;
  output_format?: object;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  nodes: WorkflowNode[];
}

export type NodeStatus = 'completed' | 'skipped' | 'failed';

export interface NodeResult {
  id: string;
  status: NodeStatus;
  output?: Record<string, unknown>;
  error?: string;
}

export interface WorkflowResult {
  success: boolean;
  nodes: NodeResult[];
}

export type NodeExecutor = (
  node: WorkflowNode,
  ctx: Record<string, Record<string, unknown>>,
) => Promise<Record<string, unknown>>;

// ─── Parse ───────────────────────────────────────────────────────────────────

export function parseWorkflow(yamlContent: string): WorkflowDefinition {
  const raw = yaml.load(yamlContent) as WorkflowDefinition;
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid workflow YAML: expected object');
  }
  if (!raw.name || typeof raw.name !== 'string') {
    throw new Error('Invalid workflow YAML: missing name');
  }
  if (!Array.isArray(raw.nodes)) {
    throw new Error('Invalid workflow YAML: nodes must be array');
  }
  return raw;
}

// ─── Topological Sort (grouped by layer) ─────────────────────────────────────

export function topologicalSort(nodes: WorkflowNode[]): WorkflowNode[][] {
  const nodeMap = new Map<string, WorkflowNode>(nodes.map(n => [n.id, n]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // id → who depends on it

  for (const n of nodes) {
    if (!inDegree.has(n.id)) inDegree.set(n.id, 0);
    if (!dependents.has(n.id)) dependents.set(n.id, []);
    for (const dep of n.depends_on ?? []) {
      inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
      dependents.get(dep)?.push(n.id) ?? dependents.set(dep, [n.id]);
    }
  }

  const layers: WorkflowNode[][] = [];
  let frontier = nodes.filter(n => (inDegree.get(n.id) ?? 0) === 0);

  while (frontier.length > 0) {
    layers.push(frontier);
    const next: WorkflowNode[] = [];
    for (const n of frontier) {
      for (const depId of dependents.get(n.id) ?? []) {
        const deg = (inDegree.get(depId) ?? 0) - 1;
        inDegree.set(depId, deg);
        if (deg === 0) {
          next.push(nodeMap.get(depId)!);
        }
      }
    }
    frontier = next;
  }

  if (layers.flat().length !== nodes.length) {
    throw new Error('Workflow has cycles');
  }

  return layers;
}

// ─── Condition Evaluator ──────────────────────────────────────────────────────

/**
 * Supports: $nodeId.output.field == 'value'
 *           $nodeId.output.field != 'value'
 */
export function evaluateWhen(
  expr: string,
  ctx: Record<string, Record<string, unknown>>,
): boolean {
  const trimmed = expr.trim();

  const match = trimmed.match(/^(\$[\w.]+)\s*(==|!=)\s*'([^']*)'$/);
  if (!match) {
    throw new Error(`Unsupported when expression: ${expr}`);
  }

  const [, varPath, op, expected] = match;

  // Resolve $nodeId.output.field from ctx
  const parts = varPath.slice(1).split('.'); // remove leading $
  let value: unknown = ctx;
  for (const p of parts) {
    if (value == null || typeof value !== 'object') return false;
    value = (value as Record<string, unknown>)[p];
  }

  const actual = String(value ?? '');

  if (op === '==') return actual === expected;
  if (op === '!=') return actual !== expected;
  return false;
}

// ─── Execute ──────────────────────────────────────────────────────────────────

export async function executeWorkflow(
  def: WorkflowDefinition,
  executor: NodeExecutor,
): Promise<WorkflowResult> {
  const layers = topologicalSort(def.nodes);
  const ctx: Record<string, Record<string, unknown>> = {};
  const results: NodeResult[] = [];

  for (const layer of layers) {
    const settled = await Promise.allSettled(
      layer.map(async node => {
        // Evaluate when condition
        if (node.when !== undefined) {
          let condMet: boolean;
          try {
            condMet = evaluateWhen(node.when, ctx);
          } catch {
            condMet = false;
          }
          if (!condMet) {
            return { id: node.id, status: 'skipped' as NodeStatus };
          }
        }

        try {
          const output = await executor(node, ctx);
          ctx[node.id] = { output };
          return { id: node.id, status: 'completed' as NodeStatus, output };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { id: node.id, status: 'failed' as NodeStatus, error: msg };
        }
      }),
    );

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        results.push(s.value);
      } else {
        // Should not happen since we catch inside; just in case
        results.push({ id: 'unknown', status: 'failed', error: String(s.reason) });
      }
    }
  }

  const success = results.every(r => r.status !== 'failed');
  return { success, nodes: results };
}
