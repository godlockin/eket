/**
 * EKET DAG Schema - TypeScript Type Definitions
 *
 * Unified DAG YAML schema for Rust/Node/Shell engines.
 * Generated from: jira/schemas/dag.schema.json
 *
 * Security limits (DoS protection):
 * - nodes.maxItems: 1000
 * - script.maxLength: 10000 (10KB)
 */

/** Security constants */
export const DAG_LIMITS = {
  /** Maximum number of nodes in a DAG */
  MAX_NODES: 1000,
  /** Maximum length of a script field (bytes) */
  MAX_SCRIPT_LENGTH: 10000,
  /** Maximum items in foreach expansion */
  MAX_FOREACH_ITEMS: 100,
} as const;

/** Node types */
export type NodeType = 'task' | 'gate' | 'foreach';

/** Node-level failure handling strategy */
export type OnFailure = 'stop' | 'continue' | 'rollback';

/** DAG execution settings */
export interface DagSettings {
  /** Max concurrent tasks (Rust/Node only, Shell ignores) */
  max_parallel?: number;
  /** Default retry count for all nodes */
  retry_count?: number;
  /** Default timeout for all nodes in seconds */
  timeout_seconds?: number;
  /** Behavior when a node fails */
  on_failure?: OnFailure;
}

/** Single task node in the DAG */
export interface DagNode {
  /** Unique node identifier (TASK-NNN or custom id like gate-check) */
  id: string;
  /** Node type: task (default), gate (conditional), foreach (dynamic expansion) */
  type?: NodeType;
  /** Command or script to execute (required for task/foreach types) */
  script?: string;
  /** Shell command for gate nodes. Exit 0 = success, non-zero = failure */
  condition?: string;
  /** Conditional execution: '<gate-id>.success' or '<gate-id>.failure' */
  when?: string;
  /** Items for foreach expansion. Each item becomes a parallel node with ${item} substituted */
  items?: string[];
  /** List of dependency node IDs */
  deps?: string[];
  /** Node-level retry count (overrides settings) */
  retry?: number;
  /** Node-level timeout in seconds (overrides settings) */
  timeout?: number;
  /** Human-readable description */
  description?: string;
}

/** Complete DAG definition */
export interface DagSchema {
  /** Schema version (e.g., '1.0') */
  version: string;
  /** Parent EPIC identifier (pattern: EPIC-NNN) */
  epic: string;
  /** List of task nodes in the DAG */
  nodes: DagNode[];
  /** Execution settings */
  settings?: DagSettings;
}

/** Validation error detail */
export interface ValidationError {
  path: string;
  message: string;
  code: 'MISSING_FIELD' | 'INVALID_FORMAT' | 'UNKNOWN_DEP' | 'CYCLE_DETECTED' | 'EMPTY_NODES' | 'LIMIT_EXCEEDED' | 'INVALID_WHEN';
}

/** Validation result */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Valid node types */
const VALID_NODE_TYPES = new Set(['task', 'gate', 'foreach']);

/**
 * Validate DAG schema
 *
 * Checks:
 * 1. Required fields (version, epic, nodes)
 * 2. Node structure based on type
 * 3. Dependency references exist
 * 4. No circular dependencies
 * 5. when conditions reference valid gate nodes
 */
export function validateDag(dag: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // Type guard
  if (typeof dag !== 'object' || dag === null) {
    return { valid: false, errors: [{ path: '', message: 'DAG must be an object', code: 'INVALID_FORMAT' }] };
  }

  const d = dag as Record<string, unknown>;

  // Required fields
  if (!d.version || typeof d.version !== 'string') {
    errors.push({ path: 'version', message: 'version is required and must be a string', code: 'MISSING_FIELD' });
  } else if (!/^[0-9]+\.[0-9]+$/.test(d.version)) {
    errors.push({ path: 'version', message: 'version must match pattern X.Y', code: 'INVALID_FORMAT' });
  }

  if (!d.epic || typeof d.epic !== 'string') {
    errors.push({ path: 'epic', message: 'epic is required and must be a string', code: 'MISSING_FIELD' });
  } else if (!/^EPIC-[0-9]+$/.test(d.epic)) {
    errors.push({ path: 'epic', message: 'epic must match pattern EPIC-NNN', code: 'INVALID_FORMAT' });
  }

  if (!Array.isArray(d.nodes)) {
    errors.push({ path: 'nodes', message: 'nodes is required and must be an array', code: 'MISSING_FIELD' });
    return { valid: false, errors };
  }

  if (d.nodes.length === 0) {
    errors.push({ path: 'nodes', message: 'nodes array must not be empty', code: 'EMPTY_NODES' });
    return { valid: false, errors };
  }

  // Security: Check max nodes limit (DoS protection)
  if (d.nodes.length > DAG_LIMITS.MAX_NODES) {
    errors.push({
      path: 'nodes',
      message: `nodes array exceeds maximum limit of ${DAG_LIMITS.MAX_NODES}`,
      code: 'LIMIT_EXCEEDED',
    });
    return { valid: false, errors };
  }

  // Collect all node IDs and gate nodes
  const nodeIds = new Set<string>();
  const gateIds = new Set<string>();
  const nodeMap = new Map<string, DagNode>();

  for (let i = 0; i < d.nodes.length; i++) {
    const node = d.nodes[i] as Record<string, unknown>;
    const path = `nodes[${i}]`;
    const nodeType = (node.type as string) ?? 'task';

    if (!node.id || typeof node.id !== 'string') {
      errors.push({ path: `${path}.id`, message: 'id is required', code: 'MISSING_FIELD' });
      continue;
    }

    // Relaxed ID pattern for custom nodes (gate-check, parallel-batch, etc.)
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(node.id)) {
      errors.push({ path: `${path}.id`, message: 'id must start with letter and contain only alphanumeric, underscore, or dash', code: 'INVALID_FORMAT' });
    }

    // Validate type
    if (node.type && !VALID_NODE_TYPES.has(nodeType)) {
      errors.push({ path: `${path}.type`, message: `type must be one of: task, gate, foreach`, code: 'INVALID_FORMAT' });
    }

    // Validate based on node type
    if (nodeType === 'task') {
      if (!node.script || typeof node.script !== 'string') {
        errors.push({ path: `${path}.script`, message: 'script is required for task nodes', code: 'MISSING_FIELD' });
      } else if (node.script.length > DAG_LIMITS.MAX_SCRIPT_LENGTH) {
        errors.push({
          path: `${path}.script`,
          message: `script exceeds maximum length of ${DAG_LIMITS.MAX_SCRIPT_LENGTH} characters`,
          code: 'LIMIT_EXCEEDED',
        });
      }
    } else if (nodeType === 'gate') {
      if (!node.condition || typeof node.condition !== 'string') {
        errors.push({ path: `${path}.condition`, message: 'condition is required for gate nodes', code: 'MISSING_FIELD' });
      }
      gateIds.add(node.id);
    } else if (nodeType === 'foreach') {
      if (!node.script || typeof node.script !== 'string') {
        errors.push({ path: `${path}.script`, message: 'script is required for foreach nodes', code: 'MISSING_FIELD' });
      }
      if (!Array.isArray(node.items) || node.items.length === 0) {
        errors.push({ path: `${path}.items`, message: 'items array is required for foreach nodes', code: 'MISSING_FIELD' });
      } else if (node.items.length > DAG_LIMITS.MAX_FOREACH_ITEMS) {
        errors.push({
          path: `${path}.items`,
          message: `items exceeds maximum limit of ${DAG_LIMITS.MAX_FOREACH_ITEMS}`,
          code: 'LIMIT_EXCEEDED',
        });
      }
    }

    nodeIds.add(node.id);
    nodeMap.set(node.id, node as unknown as DagNode);
  }

  // Check deps exist, when conditions, and detect cycles
  for (let i = 0; i < d.nodes.length; i++) {
    const node = d.nodes[i] as DagNode;
    const deps = node.deps ?? [];

    for (const dep of deps) {
      if (!nodeIds.has(dep)) {
        errors.push({
          path: `nodes[${i}].deps`,
          message: `dependency '${dep}' does not exist`,
          code: 'UNKNOWN_DEP',
        });
      }
    }

    // Validate when condition references
    if (node.when) {
      const whenMatch = node.when.match(/^([a-zA-Z][a-zA-Z0-9_-]*)\.(success|failure)$/);
      if (!whenMatch) {
        errors.push({
          path: `nodes[${i}].when`,
          message: `when must match pattern '<gate-id>.success' or '<gate-id>.failure'`,
          code: 'INVALID_WHEN',
        });
      } else {
        const gateRef = whenMatch[1];
        if (!gateIds.has(gateRef)) {
          errors.push({
            path: `nodes[${i}].when`,
            message: `when references non-existent gate '${gateRef}'`,
            code: 'INVALID_WHEN',
          });
        }
      }
    }
  }

  // Cycle detection via DFS
  const cycleError = detectCycle(nodeMap);
  if (cycleError) {
    errors.push(cycleError);
  }

  return { valid: errors.length === 0, errors };
}

/** Detect cycles using DFS */
function detectCycle(nodes: Map<string, DagNode>): ValidationError | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(nodeId: string, path: string[]): string[] | null {
    if (recursionStack.has(nodeId)) {
      return [...path, nodeId];
    }
    if (visited.has(nodeId)) {
      return null;
    }

    visited.add(nodeId);
    recursionStack.add(nodeId);

    const node = nodes.get(nodeId);
    if (node) {
      for (const dep of node.deps ?? []) {
        const cycle = dfs(dep, [...path, nodeId]);
        if (cycle) return cycle;
      }
    }

    recursionStack.delete(nodeId);
    return null;
  }

  for (const nodeId of nodes.keys()) {
    const cycle = dfs(nodeId, []);
    if (cycle) {
      return {
        path: 'nodes',
        message: `circular dependency detected: ${cycle.join(' -> ')}`,
        code: 'CYCLE_DETECTED',
      };
    }
  }

  return null;
}

/** Default settings */
export const DEFAULT_SETTINGS: Required<DagSettings> = {
  max_parallel: 3,
  retry_count: 2,
  timeout_seconds: 3600,
  on_failure: 'stop',
};

/** Resolve node settings with defaults */
export function resolveNodeSettings(
  node: DagNode,
  settings: DagSettings = {}
): { retry: number; timeout: number } {
  return {
    retry: node.retry ?? settings.retry_count ?? DEFAULT_SETTINGS.retry_count,
    timeout: node.timeout ?? settings.timeout_seconds ?? DEFAULT_SETTINGS.timeout_seconds,
  };
}
