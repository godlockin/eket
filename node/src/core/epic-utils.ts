/**
 * EPIC Utilities (TASK-644)
 *
 * Shared functions for EPIC analysis and DAG generation:
 *   - findEpicTickets() - Find all ticket files for an EPIC
 *   - parseTicketFile() - Parse ticket markdown file
 *   - topologicalSort() - Topological sort tickets by dependencies
 *   - generateDagYaml() - Generate DAG YAML from EPIC tickets
 *   - analyzeComplexity() - Analyze EPIC complexity
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface EpicTicket {
  id: string;
  title: string;
  status: string;
  priority: string;
  dependencies: string[];
  filePath: string;
  relativeModule?: string;
}

export interface ComplexityMetrics {
  subtaskCount: number;
  dependencyDepth: number;
  maxBlockedBy: number;
  crossModuleCount: number;
}

export interface ComplexityScores {
  subtaskScore: number;
  depthScore: number;
  blockedByScore: number;
  crossModuleScore: number;
}

export interface ComplexityReport {
  epicId: string;
  metrics: ComplexityMetrics;
  scores: ComplexityScores;
  totalScore: number;
  suggestDAG: boolean;
  tasks: EpicTicket[];
}

export interface DAGNode {
  id: string;
  script: string;
  deps?: string[];
  timeout?: string;
}

export interface DAGConfig {
  version: string;
  epic: string;
  settings: {
    max_parallel: number;
    retry_on_failure: boolean;
  };
  nodes: DAGNode[];
}

// ============================================================================
// Constants
// ============================================================================

export const THRESHOLDS = {
  SUBTASK_COUNT: 5,
  DEPENDENCY_DEPTH: 3,
  BLOCKED_BY: 2,
  CROSS_MODULE: 3,
} as const;

export const WEIGHTS = {
  SUBTASK_COUNT: 2,
  DEPENDENCY_DEPTH: 3,
  BLOCKED_BY: 1,
  CROSS_MODULE: 1,
} as const;

export const DAG_THRESHOLD = 4;

const MODULE_PATHS = ['node/src', 'rust/crates', 'scripts', 'confluence', 'jira', '.claude'];

// ============================================================================
// Ticket Discovery & Parsing
// ============================================================================

/**
 * Find all ticket files for an EPIC
 *
 * Searches:
 * 1. EPIC folder (e.g., jira/tickets/EPIC-007/*.md)
 * 2. Root tickets dir for files mentioning this EPIC
 *
 * @param epicId - EPIC identifier (e.g., "EPIC-017")
 * @param projectRoot - Project root directory (defaults to cwd)
 * @returns Array of absolute file paths to ticket files
 */
export async function findEpicTickets(epicId: string, projectRoot?: string): Promise<EpicTicket[]> {
  const root = projectRoot ?? process.cwd();
  const ticketsDir = path.join(root, 'jira', 'tickets');
  const files = findEpicTicketFiles(epicId, ticketsDir);

  const tickets = files
    .map(f => parseTicketFile(f))
    .filter((t): t is EpicTicket => t !== null);

  return tickets;
}

/**
 * Find ticket file paths for an EPIC (internal)
 */
function findEpicTicketFiles(epicId: string, ticketsDir: string): string[] {
  const files: string[] = [];

  // Check EPIC folder (e.g., jira/tickets/EPIC-007/*.md)
  const epicDir = path.join(ticketsDir, epicId);
  if (fs.existsSync(epicDir)) {
    const epicFiles = fs.readdirSync(epicDir)
      .filter(f => f.endsWith('.md') && f.startsWith('TASK-'))
      .map(f => path.join(epicDir, f));
    files.push(...epicFiles);
  }

  // Check root tickets dir for files mentioning this EPIC
  if (fs.existsSync(ticketsDir)) {
    const rootFiles = fs.readdirSync(ticketsDir)
      .filter(f => f.endsWith('.md') && f.startsWith('TASK-'));

    for (const f of rootFiles) {
      const filePath = path.join(ticketsDir, f);
      const content = fs.readFileSync(filePath, 'utf-8');
      if (content.includes(`EPIC**: ${epicId}`) || content.includes(`EPIC: ${epicId}`)) {
        files.push(filePath);
      }
    }
  }

  return Array.from(new Set(files)); // dedupe
}

/**
 * Parse a ticket markdown file
 *
 * Extracts: id, title, status, priority, dependencies, module
 *
 * @param filePath - Absolute path to ticket file
 * @returns Parsed ticket info or null if parsing fails
 */
export function parseTicketFile(filePath: string): EpicTicket | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const filename = path.basename(filePath);

    // Extract ID from filename or content
    const idMatch = filename.match(/^(TASK-\d+)/);
    const id = idMatch?.[1] || filename.replace('.md', '');

    // Extract title
    const titleMatch = content.match(/^#\s+(?:TASK-\d+[:\s]+)?(.+)$/m);
    const title = titleMatch?.[1]?.trim() || id;

    // Extract status (various formats)
    let status = 'backlog';
    const statusPatterns = [
      /\*\*Status\*\*:\s*(\S+)/i,
      /\*\*状态\*\*:\s*(\S+)/i,
      /Status:\s*(\S+)/i,
      /状态:\s*(\S+)/i,
    ];
    for (const pattern of statusPatterns) {
      const match = content.match(pattern);
      if (match) {
        status = match[1].trim().replace(/`/g, '').replace(/\*/g, '').toLowerCase();
        break;
      }
    }

    // Extract priority
    let priority = 'P2';
    const priorityPatterns = [
      /\*\*Priority\*\*:\s*(\S+)/i,
      /\*\*优先级\*\*:\s*(\S+)/i,
      /Priority:\s*(\S+)/i,
      /优先级:\s*(\S+)/i,
    ];
    for (const pattern of priorityPatterns) {
      const match = content.match(pattern);
      if (match) {
        priority = match[1].trim().replace(/`/g, '').replace(/\*/g, '');
        break;
      }
    }

    // Extract dependencies (blocked_by, depends_on)
    const dependencies: string[] = [];
    const depPatterns = [
      /\*\*Blocked By\*\*:\s*(.+)/i,
      /Blocked By:\s*(.+)/i,
      /blocked_by:\s*\[?([^\]\n]+)\]?/i,
      /\*\*依赖\*\*:\s*(.+)/i,
      /依赖:\s*(.+)/i,
      /\*\*depends_on\*\*:\s*(.+)/i,
    ];
    for (const pattern of depPatterns) {
      const match = content.match(pattern);
      if (match) {
        const depStr = match[1].trim();
        const taskMatches = depStr.match(/TASK-\d+/g);
        if (taskMatches) {
          dependencies.push(...taskMatches);
        }
      }
    }

    // Determine module from mentioned paths
    let relativeModule: string | undefined;
    for (const mod of MODULE_PATHS) {
      if (content.includes(mod)) {
        relativeModule = mod;
        break;
      }
    }

    return {
      id,
      title,
      status,
      priority,
      dependencies: Array.from(new Set(dependencies)),
      filePath,
      relativeModule,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Topological Sort
// ============================================================================

/**
 * Topological sort tasks by dependencies (Kahn's algorithm)
 *
 * Handles cycles by appending remaining tasks at end.
 *
 * @param tickets - Array of tickets to sort
 * @returns Sorted tickets array
 */
export function topologicalSort(tickets: EpicTicket[]): EpicTicket[] {
  const taskIds = new Set(tickets.map(t => t.id));
  const taskMap = new Map(tickets.map(t => [t.id, t]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const task of tickets) {
    inDegree.set(task.id, 0);
    adjacency.set(task.id, []);
  }

  // Build adjacency and in-degree
  for (const task of tickets) {
    for (const dep of task.dependencies) {
      if (taskIds.has(dep)) {
        adjacency.get(dep)?.push(task.id);
        inDegree.set(task.id, (inDegree.get(task.id) || 0) + 1);
      }
    }
  }

  // Kahn's algorithm
  const queue = tickets.filter(t => (inDegree.get(t.id) || 0) === 0).map(t => t.id);
  const sorted: EpicTicket[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const task = taskMap.get(id);
    if (task) sorted.push(task);

    for (const neighbor of (adjacency.get(id) || [])) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Handle cycles - add remaining tasks at end
  const sortedIds = new Set(sorted.map(t => t.id));
  for (const task of tickets) {
    if (!sortedIds.has(task.id)) {
      sorted.push(task);
    }
  }

  return sorted;
}

// ============================================================================
// Complexity Analysis
// ============================================================================

/**
 * Calculate dependency depth using BFS
 */
function calculateDependencyDepth(tasks: EpicTicket[]): number {
  const taskIds = new Set(tasks.map(t => t.id));
  let maxDepth = 0;

  // Build reverse adjacency (who depends on whom)
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (taskIds.has(dep)) {
        const list = dependents.get(dep) || [];
        list.push(task.id);
        dependents.set(dep, list);
      }
    }
  }

  // Find roots (tasks with no dependencies)
  const roots = tasks.filter(t => t.dependencies.length === 0);

  // BFS from each root
  for (const root of roots) {
    const queue: Array<{ id: string; depth: number }> = [{ id: root.id, depth: 1 }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      maxDepth = Math.max(maxDepth, depth);

      const children = dependents.get(id) || [];
      for (const child of children) {
        if (!visited.has(child)) {
          queue.push({ id: child, depth: depth + 1 });
        }
      }
    }
  }

  // If no roots found, try starting from any task
  if (maxDepth === 0 && tasks.length > 0) {
    maxDepth = 1;
  }

  return maxDepth;
}

/**
 * Analyze EPIC complexity
 *
 * Complexity Rules:
 * | Metric           | Threshold | Weight |
 * |------------------|-----------|--------|
 * | Sub-task count   | >= 5      | 2      |
 * | Dependency depth | >= 3      | 3      |
 * | Max blocked_by   | >= 2      | 1      |
 * | Cross-module     | >= 3      | 1      |
 *
 * Suggest DAG if score >= 4
 *
 * @param tickets - Array of parsed tickets
 * @returns Complexity report
 */
export function analyzeComplexity(tickets: EpicTicket[], epicId?: string): ComplexityReport {
  const metrics: ComplexityMetrics = {
    subtaskCount: tickets.length,
    dependencyDepth: calculateDependencyDepth(tickets),
    maxBlockedBy: Math.max(0, ...tickets.map(t => t.dependencies.length)),
    crossModuleCount: new Set(tickets.map(t => t.relativeModule).filter(Boolean)).size,
  };

  // Calculate scores
  const scores: ComplexityScores = {
    subtaskScore: metrics.subtaskCount >= THRESHOLDS.SUBTASK_COUNT ? WEIGHTS.SUBTASK_COUNT : 0,
    depthScore: metrics.dependencyDepth >= THRESHOLDS.DEPENDENCY_DEPTH ? WEIGHTS.DEPENDENCY_DEPTH : 0,
    blockedByScore: metrics.maxBlockedBy >= THRESHOLDS.BLOCKED_BY ? WEIGHTS.BLOCKED_BY : 0,
    crossModuleScore: metrics.crossModuleCount >= THRESHOLDS.CROSS_MODULE ? WEIGHTS.CROSS_MODULE : 0,
  };

  const totalScore = scores.subtaskScore + scores.depthScore + scores.blockedByScore + scores.crossModuleScore;

  return {
    epicId: epicId ?? 'unknown',
    metrics,
    scores,
    totalScore,
    suggestDAG: totalScore >= DAG_THRESHOLD,
    tasks: tickets,
  };
}

// ============================================================================
// DAG Generation
// ============================================================================

/**
 * Generate DAG config from EPIC tickets
 *
 * @param epicId - EPIC identifier
 * @param tickets - Array of parsed tickets
 * @returns DAG configuration object
 */
export function generateDAGConfig(epicId: string, tickets: EpicTicket[]): DAGConfig {
  const sortedTasks = topologicalSort(tickets);
  const taskIds = new Set(tickets.map(t => t.id));

  const nodes: DAGNode[] = sortedTasks.map(task => {
    const deps = task.dependencies.filter(d => taskIds.has(d));

    const node: DAGNode = {
      id: task.id,
      script: `eket task:claim ${task.id} && eket task:complete ${task.id}`,
    };

    if (deps.length > 0) {
      node.deps = deps;
    }

    // Add timeout based on priority
    if (task.priority === 'P0') {
      node.timeout = '2h';
    } else if (task.priority === 'P1') {
      node.timeout = '4h';
    }

    return node;
  });

  return {
    version: '1.0',
    epic: epicId,
    settings: {
      max_parallel: 3,
      retry_on_failure: true,
    },
    nodes,
  };
}

/**
 * Convert DAG config to YAML string
 *
 * @param epicId - EPIC identifier
 * @param tickets - Array of parsed tickets
 * @returns YAML string
 */
export function generateDagYaml(epicId: string, tickets: EpicTicket[]): string {
  const config = generateDAGConfig(epicId, tickets);
  return dagConfigToYaml(config);
}

/**
 * Convert DAG config object to YAML string
 *
 * @param config - DAG configuration
 * @returns YAML string
 */
export function dagConfigToYaml(config: DAGConfig): string {
  const lines: string[] = [
    '# Auto-generated DAG for EPIC execution',
    `# Generated: ${new Date().toISOString()}`,
    '',
    `version: "${config.version}"`,
    `epic: "${config.epic}"`,
    '',
    'settings:',
    `  max_parallel: ${config.settings.max_parallel}`,
    `  retry_on_failure: ${config.settings.retry_on_failure}`,
    '',
    'nodes:',
  ];

  for (const node of config.nodes) {
    lines.push(`  - id: "${node.id}"`);
    lines.push(`    script: "${node.script}"`);
    if (node.deps && node.deps.length > 0) {
      lines.push('    deps:');
      for (const dep of node.deps) {
        lines.push(`      - "${dep}"`);
      }
    }
    if (node.timeout) {
      lines.push(`    timeout: "${node.timeout}"`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format complexity report for CLI output
 */
export function formatComplexityReport(result: ComplexityReport): string {
  const { epicId, metrics, scores, totalScore, suggestDAG } = result;

  const checkMark = (value: number, threshold: number): string =>
    value >= threshold ? '\x1b[32m+\x1b[0m' : ' ';

  const scoreStr = (score: number): string =>
    score > 0 ? `\x1b[32m+${score}\x1b[0m` : '+0';

  const lines = [
    '',
    `${epicId} Complexity Analysis`,
    '='.repeat(39),
    `Sub-tasks:   ${metrics.subtaskCount.toString().padEnd(3)} (>=${THRESHOLDS.SUBTASK_COUNT} ${checkMark(metrics.subtaskCount, THRESHOLDS.SUBTASK_COUNT)})      ${scoreStr(scores.subtaskScore)}`,
    `Dep depth:   ${metrics.dependencyDepth.toString().padEnd(3)} (<${THRESHOLDS.DEPENDENCY_DEPTH})        ${scoreStr(scores.depthScore)}`,
    `blocked_by:  max=${metrics.maxBlockedBy.toString().padEnd(2)} (>=${THRESHOLDS.BLOCKED_BY} ${checkMark(metrics.maxBlockedBy, THRESHOLDS.BLOCKED_BY)})  ${scoreStr(scores.blockedByScore)}`,
    `Cross-mod:   ${metrics.crossModuleCount.toString().padEnd(3)} (>=${THRESHOLDS.CROSS_MODULE} ${checkMark(metrics.crossModuleCount, THRESHOLDS.CROSS_MODULE)})      ${scoreStr(scores.crossModuleScore)}`,
    '-'.repeat(39),
    `Total:       ${totalScore}`,
    '',
  ];

  if (suggestDAG) {
    lines.push(
      '\x1b[33mSuggestion: Use DAG mode for better efficiency\x1b[0m',
      `   Run: eket dag:generate ${epicId}`,
      ''
    );
  } else {
    lines.push(
      '\x1b[32mComplexity is manageable, DAG mode not required\x1b[0m',
      ''
    );
  }

  return lines.join('\n');
}
