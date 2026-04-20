/**
 * EKET Framework - DAG-based Middleware Pipeline
 * TASK-106
 *
 * 执行逻辑：
 * - 拓扑排序（Kahn's algorithm），检测环
 * - 按层执行：同层节点用 Promise.all 并行
 * - failBehavior: 'block' → 立即停止整个 pipeline
 * - failBehavior: 'warn'  → 记录警告，继续执行
 * - failBehavior: 'skip'  → 跳过，后续依赖也跳过
 */

export type FailBehavior = 'block' | 'warn' | 'skip';

export interface LoopConfig<T> {
  maxRetries: number;
  validator: (state: T) => boolean | Promise<boolean>;
}

export interface MiddlewareNode<T = Record<string, unknown>> {
  id: string;
  deps: string[];        // 依赖的其他节点 id，空数组=无依赖
  parallel: boolean;     // 同层是否可与其他节点并行
  failBehavior: FailBehavior;
  loop?: LoopConfig<T>;  // 可选：迭代细化语义 (TASK-120)
  handle: (state: T) => Promise<T>;
}

export interface PipelineResult<T> {
  state: T;
  executed: string[];    // 执行成功的节点 id
  skipped: string[];     // skip 的节点 id
  blocked?: string;      // 首个 block 节点 id（若有）
}

/**
 * 拓扑排序（Kahn's algorithm）
 * 返回按层分组的节点 id，每层内可并行执行
 * 检测到环时抛出错误
 */
function topologicalSort(nodes: MiddlewareNode[]): string[][] {
  const nodeMap = new Map<string, MiddlewareNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // 验证所有依赖引用已存在
  for (const n of nodes) {
    for (const dep of n.deps) {
      if (!nodeMap.has(dep)) {
        throw new Error(`Node "${n.id}" depends on unknown node "${dep}"`);
      }
    }
  }

  // 入度计算
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep → 依赖 dep 的节点列表
  for (const n of nodes) {
    if (!inDegree.has(n.id)) inDegree.set(n.id, 0);
    if (!dependents.has(n.id)) dependents.set(n.id, []);
  }
  for (const n of nodes) {
    for (const dep of n.deps) {
      inDegree.set(n.id, (inDegree.get(n.id) ?? 0) + 1);
      dependents.get(dep)!.push(n.id);
    }
  }

  const layers: string[][] = [];
  let remaining = new Set(nodes.map((n) => n.id));

  while (remaining.size > 0) {
    // 找出当前所有入度为 0 的节点
    const layer: string[] = [];
    for (const id of remaining) {
      if ((inDegree.get(id) ?? 0) === 0) {
        layer.push(id);
      }
    }
    if (layer.length === 0) {
      throw new Error(
        `Cycle detected in pipeline DAG. Remaining nodes: ${[...remaining].join(', ')}`
      );
    }
    layers.push(layer);
    for (const id of layer) {
      remaining.delete(id);
      for (const dependent of dependents.get(id) ?? []) {
        inDegree.set(dependent, (inDegree.get(dependent) ?? 1) - 1);
      }
    }
  }

  return layers;
}

export class PipelineExecutor<T = Record<string, unknown>> {
  private readonly nodes: Map<string, MiddlewareNode<T>>;

  constructor(nodes: MiddlewareNode<T>[]) {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
  }

  async execute(initialState: T): Promise<PipelineResult<T>> {
    const layers = topologicalSort([...this.nodes.values()] as MiddlewareNode[]);

    let state = initialState;
    const executed: string[] = [];
    const skipped: string[] = [];
    let blocked: string | undefined;

    for (const layer of layers) {
      if (blocked !== undefined) break;

      // 过滤掉本层中已 skip 的节点
      const toRun = layer.filter((id) => !skipped.includes(id));

      // 执行本层节点（可能并行）
      type NodeOutcome =
        | { id: string; ok: true; state: T }
        | { id: string; ok: false; behavior: FailBehavior; error: unknown };

      const outcomes = await Promise.all(
        toRun.map(async (id): Promise<NodeOutcome> => {
          const node = this.nodes.get(id)!;
          try {
            let nextState = await node.handle(state);
            if (node.loop) {
              const { maxRetries, validator } = node.loop;
              let attempt = 0;
              while (!(await validator(nextState)) && attempt < maxRetries) {
                const stateWithCtx = { ...nextState, _loopContext: { attempt: attempt + 1, lastFailReason: `validator failed attempt ${attempt + 1}` } } as T;
                nextState = await node.handle(stateWithCtx);
                attempt++;
              }
              if (!(await validator(nextState))) {
                throw new Error(`Loop node "${id}" exceeded maxRetries (${maxRetries})`);
              }
            }
            return { id, ok: true, state: nextState };
          } catch (e: unknown) {
            return { id, ok: false, behavior: node.failBehavior, error: e };
          }
        })
      );

      // 处理结果（串行合并 state，保持确定性）
      for (const outcome of outcomes) {
        if (outcome.ok) {
          state = outcome.state;
          executed.push(outcome.id);
        } else {
          const { id, behavior, error } = outcome;
          if (behavior === 'block') {
            blocked = id;
            // 收集本层剩余未执行节点到 skipped
            for (const sid of toRun) {
              if (!executed.includes(sid) && !skipped.includes(sid) && sid !== id) {
                skipped.push(sid);
              }
            }
            break;
          } else if (behavior === 'warn') {
            console.warn(`[middleware-pipeline] WARN node "${id}" failed:`, error);
            executed.push(id); // warn = 继续，计为已执行（但 state 未变）
          } else {
            // skip
            skipped.push(id);
            // 将所有依赖此节点的后代也标记为 skip（递归）
            this._markDependentsSkipped(id, skipped);
          }
        }
      }
    }

    return { state, executed, skipped, blocked };
  }

  /** 递归将依赖 skipId 的所有后代节点标记为 skipped */
  private _markDependentsSkipped(skipId: string, skipped: string[]): void {
    for (const node of this.nodes.values()) {
      if (node.deps.includes(skipId) && !skipped.includes(node.id)) {
        skipped.push(node.id);
        this._markDependentsSkipped(node.id, skipped);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PreToolUse Hook Pipeline 工厂
// ---------------------------------------------------------------------------

export interface PreToolUseState extends Record<string, unknown> {
  tool: string;
  input: Record<string, unknown>;
  blocked?: boolean;
  warnings: string[];
  auditLog: string[];
}

/**
 * 创建 PreToolUse hook 使用的 pipeline：
 * GuardrailNode ∥ SecurityNode ∥ EnvConfigNode → AuditLogNode（串行）
 */
export function createPreToolUsePipeline(): PipelineExecutor<PreToolUseState> {
  const nodes: MiddlewareNode<PreToolUseState>[] = [
    {
      id: 'GuardrailNode',
      deps: [],
      parallel: true,
      failBehavior: 'block',
      loop: { maxRetries: 2, validator: (s) => !s.blocked },
      handle: async (state) => {
        // 示例：检查禁用工具列表
        const blockedTools = ['rm', 'dd', 'mkfs'];
        if (blockedTools.some((t) => state.tool.includes(t))) {
          throw new Error(`Guardrail: tool "${state.tool}" is blocked`);
        }
        return state;
      },
    },
    {
      id: 'SecurityNode',
      deps: [],
      parallel: true,
      failBehavior: 'warn',
      handle: async (state) => {
        // 示例：路径遍历检测
        const inputStr = JSON.stringify(state.input);
        if (inputStr.includes('../')) {
          return { ...state, warnings: [...state.warnings, 'SecurityNode: path traversal detected'] };
        }
        return state;
      },
    },
    {
      id: 'EnvConfigNode',
      deps: [],
      parallel: true,
      failBehavior: 'skip',
      handle: async (state) => {
        // 示例：注入环境配置到 state
        return { ...state, envConfig: { logLevel: process.env.EKET_LOG_LEVEL ?? 'info' } };
      },
    },
    {
      id: 'AuditLogNode',
      deps: ['GuardrailNode', 'SecurityNode', 'EnvConfigNode'],
      parallel: false,
      failBehavior: 'warn',
      handle: async (state) => {
        const entry = `[${new Date().toISOString()}] tool=${state.tool}`;
        return { ...state, auditLog: [...state.auditLog, entry] };
      },
    },
  ];

  return new PipelineExecutor<PreToolUseState>(nodes);
}
