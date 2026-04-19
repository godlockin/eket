/**
 * Workflow YAML Commands
 * TASK-080: 注册 workflow:run 和 workflow:validate CLI 命令
 *
 * 支持简单的 YAML DAG 工作流定义，节点类型为 bash
 */

import * as fs from 'fs';
import * as path from 'path';

import { Command } from 'commander';
import { execFile } from 'child_process';
import { load } from 'js-yaml';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// ============================================================================
// Types
// ============================================================================

interface WorkflowNode {
  id: string;
  name?: string;
  type: 'bash' | 'echo' | 'noop';
  command?: string;
  args?: string[];
  depends_on?: string[];
  on_failure?: 'stop' | 'continue';
}

interface WorkflowDefinition {
  name: string;
  description?: string;
  version?: string;
  nodes: WorkflowNode[];
}

interface NodeResult {
  id: string;
  status: 'completed' | 'failed' | 'skipped';
  stdout?: string;
  stderr?: string;
  error?: string;
}

// ============================================================================
// YAML Parser (using js-yaml for robust parsing)
// ============================================================================

function parseWorkflowYaml(content: string): WorkflowDefinition {
  const raw = load(content) as Record<string, unknown>;

  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid YAML: expected a mapping at top level');
  }

  if (!raw['name'] || typeof raw['name'] !== 'string') {
    throw new Error('Workflow YAML missing required field: name');
  }

  const nodes: WorkflowNode[] = [];
  const rawNodes = raw['nodes'];
  if (Array.isArray(rawNodes)) {
    for (const rawNode of rawNodes) {
      if (!rawNode || typeof rawNode !== 'object') continue;
      const n = rawNode as Record<string, unknown>;
      const node: Partial<WorkflowNode> & { id: string } = {
        id: String(n['id'] ?? ''),
      };
      if (n['type'] !== undefined) node.type = n['type'] as WorkflowNode['type'];
      if (n['name'] !== undefined) node.name = String(n['name']);
      if (n['command'] !== undefined) node.command = String(n['command']);
      if (n['on_failure'] !== undefined) {
        node.on_failure = n['on_failure'] as WorkflowNode['on_failure'];
      }
      if (Array.isArray(n['args'])) {
        node.args = (n['args'] as unknown[]).map(String);
      }
      if (Array.isArray(n['depends_on'])) {
        node.depends_on = (n['depends_on'] as unknown[]).map(String);
      }
      nodes.push(node as WorkflowNode);
    }
  }

  return {
    name: raw['name'],
    description: raw['description'] !== undefined ? String(raw['description']) : undefined,
    version: raw['version'] !== undefined ? String(raw['version']) : undefined,
    nodes,
  };
}

// ============================================================================
// Validation
// ============================================================================

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateWorkflowYaml(yamlPath: string): ValidationResult {
  const errors: string[] = [];

  if (!fs.existsSync(yamlPath)) {
    return { valid: false, errors: [`File not found: ${yamlPath}`] };
  }

  let def: WorkflowDefinition;
  try {
    const content = fs.readFileSync(yamlPath, 'utf-8');
    def = parseWorkflowYaml(content);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [`Parse error: ${msg}`] };
  }

  if (!def.name) {
    errors.push('Missing required field: name');
  }

  if (!def.nodes || def.nodes.length === 0) {
    errors.push('Workflow must have at least one node');
  } else {
    const nodeIds = new Set<string>();
    for (const node of def.nodes) {
      if (!node.id) {
        errors.push('Node missing required field: id');
        continue;
      }
      if (nodeIds.has(node.id)) {
        errors.push(`Duplicate node id: ${node.id}`);
      }
      nodeIds.add(node.id);

      if (!node.type) {
        errors.push(`Node ${node.id}: missing required field: type`);
      } else if (!['bash', 'echo', 'noop'].includes(node.type)) {
        errors.push(`Node ${node.id}: unknown type '${node.type}' (allowed: bash, echo, noop)`);
      }

      if (node.type === 'bash' && !node.command) {
        errors.push(`Node ${node.id}: bash type requires 'command' field`);
      }
    }

    // Check depends_on references
    for (const node of def.nodes) {
      for (const dep of node.depends_on ?? []) {
        if (!nodeIds.has(dep)) {
          errors.push(`Node ${node.id}: depends_on references unknown node: ${dep}`);
        }
      }
    }

    // Check for cycles (simple DFS)
    const cycleError = detectCycle(def.nodes);
    if (cycleError) {
      errors.push(cycleError);
    }
  }

  return { valid: errors.length === 0, errors };
}

function detectCycle(nodes: WorkflowNode[]): string | null {
  const graph: Map<string, string[]> = new Map();
  for (const node of nodes) {
    graph.set(node.id, node.depends_on ?? []);
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(id: string): boolean {
    visited.add(id);
    inStack.add(id);
    for (const dep of graph.get(id) ?? []) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (inStack.has(dep)) {
        return true;
      }
    }
    inStack.delete(id);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) {
        return `Cycle detected in workflow DAG`;
      }
    }
  }

  return null;
}

// ============================================================================
// Execution
// ============================================================================

export async function executeWorkflow(yamlPath: string): Promise<boolean> {
  const absPath = path.resolve(yamlPath);
  const validation = validateWorkflowYaml(absPath);

  if (!validation.valid) {
    console.error('Workflow validation failed:');
    for (const err of validation.errors) {
      console.error(`  ✗ ${err}`);
    }
    return false;
  }

  const content = fs.readFileSync(absPath, 'utf-8');
  const def = parseWorkflowYaml(content);

  console.log(`\n▶ Running workflow: ${def.name}`);
  if (def.description) {
    console.log(`  ${def.description}`);
  }
  console.log('');

  const results = new Map<string, NodeResult>();
  const completed = new Set<string>();

  // Topological execution: repeatedly pick nodes whose deps are satisfied
  const remaining = [...def.nodes];
  let progress = true;

  while (remaining.length > 0 && progress) {
    progress = false;

    const ready: WorkflowNode[] = [];
    const notReady: WorkflowNode[] = [];

    for (const node of remaining) {
      const deps = node.depends_on ?? [];
      const depsOk = deps.every((dep) => completed.has(dep));

      // If a dep failed and this node would be blocked, skip
      const depFailed = deps.some((dep) => results.get(dep)?.status === 'failed');

      if (depsOk || depFailed) {
        ready.push(node);
      } else {
        notReady.push(node);
      }
    }

    for (const node of ready) {
      remaining.splice(remaining.indexOf(node), 1);
      progress = true;

      const deps = node.depends_on ?? [];
      const depFailed = deps.some((dep) => results.get(dep)?.status === 'failed');

      if (depFailed) {
        console.log(`  ⏭  [${node.id}] skipped (dependency failed)`);
        results.set(node.id, { id: node.id, status: 'skipped' });
        completed.add(node.id);
        continue;
      }

      console.log(`  ⟳  [${node.id}] running...`);

      const result = await executeNode(node);
      results.set(node.id, result);
      completed.add(node.id);

      if (result.status === 'completed') {
        console.log(`  ✓  [${node.id}] completed`);
        if (result.stdout?.trim()) {
          console.log(`     ${result.stdout.trim().split('\n').join('\n     ')}`);
        }
      } else {
        console.log(`  ✗  [${node.id}] failed: ${result.error ?? result.stderr ?? 'unknown error'}`);
        if (node.on_failure !== 'continue') {
          // on_failure: stop (default) — mark remaining nodes as skipped and abort
          console.log(`     stopping workflow (on_failure: stop)`);
          for (const pendingNode of [...remaining, ...notReady]) {
            if (!results.has(pendingNode.id)) {
              results.set(pendingNode.id, { id: pendingNode.id, status: 'skipped' });
            }
          }
          remaining.splice(0, remaining.length);
          const failed = [...results.values()].filter((r) => r.status === 'failed');
          console.log(`\n✗ Workflow stopped due to failure: ${failed.map((r) => r.id).join(', ')}`);
          return false;
        } else {
          console.log(`     continuing (on_failure: continue)`);
        }
      }
    }

    remaining.splice(0, remaining.length, ...notReady);
  }

  if (remaining.length > 0) {
    console.error(`\n✗ Workflow stalled — unreachable nodes: ${remaining.map((n) => n.id).join(', ')}`);
    return false;
  }

  const failed = [...results.values()].filter((r) => r.status === 'failed');
  if (failed.length > 0) {
    console.log(`\n✗ Workflow completed with failures: ${failed.map((r) => r.id).join(', ')}`);
    return false;
  }

  console.log('\n✓ Workflow completed successfully\n');
  return true;
}

async function executeNode(node: WorkflowNode): Promise<NodeResult> {
  try {
    switch (node.type) {
      case 'noop':
        return { id: node.id, status: 'completed' };

      case 'echo':
        console.log(`     ${node.command ?? ''}`);
        return { id: node.id, status: 'completed', stdout: node.command };

      case 'bash': {
        if (!node.command) {
          return { id: node.id, status: 'failed', error: 'No command specified' };
        }
        const args = node.args ?? [];
        // '--' separates script from positional args ($1, $2, ...) per bash -c convention
        const bashArgs =
          args.length > 0 ? ['-c', node.command, '--', ...args] : ['-c', node.command];
        const { stdout, stderr } = await execFileAsync('bash', bashArgs, {
          timeout: 30_000,
        });
        return { id: node.id, status: 'completed', stdout, stderr };
      }

      default:
        return { id: node.id, status: 'failed', error: `Unknown node type: ${node.type}` };
    }
  } catch (e: unknown) {
    const err = e as { message?: string; stdout?: string; stderr?: string };
    return {
      id: node.id,
      status: 'failed',
      error: err.message,
      stdout: err.stdout,
      stderr: err.stderr,
    };
  }
}

// ============================================================================
// Command Registration
// ============================================================================

export function registerWorkflowCommands(program: Command): void {
  program
    .command('workflow:run <yamlFile>')
    .description('Execute a YAML workflow DAG')
    .action(async (yamlFile: string) => {
      const ok = await executeWorkflow(yamlFile);
      process.exit(ok ? 0 : 1);
    });

  program
    .command('workflow:validate <yamlFile>')
    .description('Validate a YAML workflow file without executing it')
    .action((yamlFile: string) => {
      const absPath = path.resolve(yamlFile);
      console.log(`\nValidating: ${absPath}\n`);
      const result = validateWorkflowYaml(absPath);

      if (result.valid) {
        console.log('✓ Workflow YAML is valid\n');
        process.exit(0);
      } else {
        console.error('✗ Validation failed:');
        for (const err of result.errors) {
          console.error(`  - ${err}`);
        }
        console.log('');
        process.exit(1);
      }
    });
}
