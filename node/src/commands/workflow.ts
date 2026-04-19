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
// YAML Parser (simple subset sufficient for workflow files)
// ============================================================================

/**
 * Parse a simple workflow YAML file.
 * Supports top-level keys and a `nodes:` list with nested properties.
 */
function parseWorkflowYaml(content: string): WorkflowDefinition {
  const lines = content.split('\n');
  const def: Partial<WorkflowDefinition> & { nodes: WorkflowNode[] } = { nodes: [] };

  let i = 0;

  function stripInlineComment(s: string): string {
    // Remove inline comments (but be careful with URLs)
    const idx = s.indexOf(' #');
    return idx >= 0 ? s.slice(0, idx).trim() : s.trim();
  }

  function unquote(s: string): string {
    s = s.trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    return s;
  }

  function indent(line: string): number {
    return line.match(/^(\s*)/)?.[1]?.length ?? 0;
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    // Top-level key: value
    const kvMatch = trimmed.match(/^(\w+):\s*(.*)$/);
    if (!kvMatch) {
      i++;
      continue;
    }

    const key = kvMatch[1];
    const value = stripInlineComment(kvMatch[2]);

    if (key === 'name') {
      def.name = unquote(value);
      i++;
    } else if (key === 'description') {
      def.description = unquote(value);
      i++;
    } else if (key === 'version') {
      def.version = unquote(value);
      i++;
    } else if (key === 'nodes') {
      // Parse nodes list
      i++;
      while (i < lines.length) {
        const nodeLine = lines[i];
        const nodeTrimmed = nodeLine.trim();

        if (!nodeTrimmed || nodeTrimmed.startsWith('#')) {
          i++;
          continue;
        }

        // Node list item starts with `- id:` or `- name:`
        if (!nodeLine.match(/^\s+-\s+/)) {
          break; // Back to top level
        }

        // Parse a node block
        const node: Partial<WorkflowNode> & { depends_on: string[] } = { depends_on: [] };
        const nodeIndent = indent(nodeLine);

        // Parse first property of the node (on the `-` line)
        const firstPropMatch = nodeLine.match(/^\s+-\s+(\w+):\s*(.*)$/);
        if (firstPropMatch) {
          const propKey = firstPropMatch[1];
          const propVal = stripInlineComment(firstPropMatch[2]);
          assignNodeProp(node, propKey, propVal, unquote);
        }
        i++;

        // Parse remaining properties of this node (indented deeper)
        while (i < lines.length) {
          const propLine = lines[i];
          const propTrimmed = propLine.trim();

          if (!propTrimmed || propTrimmed.startsWith('#')) {
            i++;
            continue;
          }

          const propIndent = indent(propLine);

          // Next node or top-level key
          if (propIndent <= nodeIndent && propTrimmed !== '') {
            break;
          }

          // depends_on list item
          if (propTrimmed.startsWith('- ') && node.depends_on !== undefined) {
            node.depends_on.push(unquote(propTrimmed.slice(2).trim()));
            i++;
            continue;
          }

          // args list item
          if (propTrimmed.startsWith('- ') && 'args' in node) {
            if (!node.args) node.args = [];
            node.args.push(unquote(propTrimmed.slice(2).trim()));
            i++;
            continue;
          }

          const propKvMatch = propTrimmed.match(/^(\w+):\s*(.*)$/);
          if (propKvMatch) {
            const propKey = propKvMatch[1];
            const propVal = stripInlineComment(propKvMatch[2]);

            if (propKey === 'depends_on' && !propVal) {
              // List follows
              i++;
              while (i < lines.length) {
                const listLine = lines[i].trim();
                if (listLine.startsWith('- ')) {
                  node.depends_on.push(unquote(listLine.slice(2).trim()));
                  i++;
                } else {
                  break;
                }
              }
              continue;
            }

            if (propKey === 'args' && !propVal) {
              node.args = [];
              i++;
              while (i < lines.length) {
                const listLine = lines[i].trim();
                if (listLine.startsWith('- ')) {
                  if (!node.args) node.args = [];
                  node.args.push(unquote(listLine.slice(2).trim()));
                  i++;
                } else {
                  break;
                }
              }
              continue;
            }

            assignNodeProp(node, propKey, propVal, unquote);
          }
          i++;
        }

        if (node.id) {
          def.nodes.push(node as WorkflowNode);
        }
      }
    } else {
      i++;
    }
  }

  if (!def.name) {
    throw new Error('Workflow YAML missing required field: name');
  }

  return def as WorkflowDefinition;
}

function assignNodeProp(
  node: Record<string, unknown> & { depends_on: string[] },
  key: string,
  value: string,
  unquote: (s: string) => string
): void {
  switch (key) {
    case 'id':
      node.id = unquote(value);
      break;
    case 'name':
      node.name = unquote(value);
      break;
    case 'type':
      node.type = unquote(value) as WorkflowNode['type'];
      break;
    case 'command':
      node.command = unquote(value);
      break;
    case 'on_failure':
      node.on_failure = unquote(value) as WorkflowNode['on_failure'];
      break;
    default:
      break;
  }
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
        if (node.on_failure === 'continue') {
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
        const { stdout, stderr } = await execFileAsync('bash', ['-c', node.command, ...args], {
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
