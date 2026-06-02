/**
 * EKET DAG Visualizer (TASK-639)
 *
 * Visualize DAG execution progress in ASCII and Mermaid formats.
 *
 * Features:
 * - ASCII tree visualization with Unicode box drawing
 * - Mermaid flowchart generation
 * - Critical path highlighting
 * - Status indicators (done, running, pending, failed, skipped)
 */

import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { type DagSchema, type DagNode, validateDag } from '../schemas/dag.js';
import type { NodeStatus, NodeResult } from './dag-executor.js';

// ============================================================================
// Types
// ============================================================================

/** Run state input (accepts both DAGRunState and DAGRun) */
export interface RunStateInput {
  nodeResults?: Map<string, NodeResult>;
}

/** Node with computed visualization data */
export interface VisNode {
  id: string;
  deps: string[];
  description?: string;
  status: NodeStatus;
  duration?: number;
  level: number; // Topological level (0 = root)
  isCritical: boolean; // On critical path
}

/** Visualization result */
export interface VisualizationResult {
  ascii: string;
  mermaid: string;
  summary: {
    total: number;
    done: number;
    running: number;
    pending: number;
    failed: number;
    skipped: number;
  };
  criticalPath: string[];
}

/** Status display config */
const STATUS_ICONS: Record<NodeStatus, string> = {
  done: '✅',     // ✅
  running: '⏳',  // ⏳
  pending: '⏸️',  // ⏸️
  failed: '❌',   // ❌
  skipped: '⏭️',  // ⏭️
};

/** Mermaid node colors by status */
const MERMAID_COLORS: Record<NodeStatus, string> = {
  done: '#4CAF50',     // green
  running: '#FFC107',  // yellow
  pending: '#9E9E9E',  // gray
  failed: '#F44336',   // red
  skipped: '#607D8B',  // blue-gray
};

// ============================================================================
// DAG Visualizer Class
// ============================================================================

export class DAGVisualizer {
  /**
   * Load DAG from YAML file
   */
  async loadFromFile(yamlPath: string): Promise<DagSchema> {
    const content = await readFile(yamlPath, 'utf-8');
    const dag = parseYaml(content) as unknown;

    const validation = validateDag(dag);
    if (!validation.valid) {
      throw new Error(
        `Invalid DAG: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`
      );
    }

    return dag as DagSchema;
  }

  /**
   * Generate visualization from DAG schema
   *
   * @param dag - DAG schema
   * @param runState - Optional run state for status (accepts DAGRun or DAGRunState)
   */
  visualize(
    dag: DagSchema,
    runState?: RunStateInput
  ): VisualizationResult {
    // Build visualization nodes
    const visNodes = this.buildVisNodes(dag, runState);

    // Compute critical path
    const criticalPath = this.computeCriticalPath(visNodes);

    // Mark critical nodes
    for (const nodeId of criticalPath) {
      const node = visNodes.get(nodeId);
      if (node) {
        node.isCritical = true;
      }
    }

    // Generate outputs
    const ascii = this.generateAscii(dag.epic, visNodes);
    const mermaid = this.generateMermaid(dag.epic, visNodes);
    const summary = this.computeSummary(visNodes);

    return { ascii, mermaid, summary, criticalPath };
  }

  /**
   * Build visualization nodes with computed levels
   */
  private buildVisNodes(
    dag: DagSchema,
    runState?: RunStateInput
  ): Map<string, VisNode> {
    const nodeMap = new Map<string, DagNode>();
    for (const node of dag.nodes) {
      nodeMap.set(node.id, node);
    }

    const visNodes = new Map<string, VisNode>();
    const levels = this.computeLevels(dag.nodes);

    for (const node of dag.nodes) {
      const result = runState?.nodeResults?.get(node.id);
      visNodes.set(node.id, {
        id: node.id,
        deps: node.deps ?? [],
        description: node.description,
        status: result?.status ?? 'pending',
        duration: result?.duration,
        level: levels.get(node.id) ?? 0,
        isCritical: false,
      });
    }

    return visNodes;
  }

  /**
   * Compute topological levels for all nodes
   * Level 0 = root nodes (no dependencies)
   */
  private computeLevels(nodes: DagNode[]): Map<string, number> {
    const levels = new Map<string, number>();
    const nodeMap = new Map<string, DagNode>();

    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // BFS to compute levels
    const computeLevel = (nodeId: string): number => {
      if (levels.has(nodeId)) {
        return levels.get(nodeId)!;
      }

      const node = nodeMap.get(nodeId);
      if (!node || !node.deps || node.deps.length === 0) {
        levels.set(nodeId, 0);
        return 0;
      }

      const maxDepLevel = Math.max(
        ...node.deps.map((dep) => computeLevel(dep))
      );
      const level = maxDepLevel + 1;
      levels.set(nodeId, level);
      return level;
    };

    for (const node of nodes) {
      computeLevel(node.id);
    }

    return levels;
  }

  /**
   * Compute critical path (longest path through DAG)
   * For execution visualization, critical path = longest dependency chain
   */
  private computeCriticalPath(visNodes: Map<string, VisNode>): string[] {
    // Build reverse adjacency (children -> parents)
    const children = new Map<string, string[]>();
    for (const [id, node] of visNodes) {
      for (const dep of node.deps) {
        if (!children.has(dep)) {
          children.set(dep, []);
        }
        children.get(dep)!.push(id);
      }
    }

    // Find roots (level 0)
    const roots = [...visNodes.values()].filter((n) => n.level === 0);
    if (roots.length === 0) return [];

    // DFS to find longest path
    let longestPath: string[] = [];

    const dfs = (nodeId: string, path: string[]): void => {
      const newPath = [...path, nodeId];
      const nodeChildren = children.get(nodeId) ?? [];

      if (nodeChildren.length === 0) {
        // Leaf node
        if (newPath.length > longestPath.length) {
          longestPath = newPath;
        }
      } else {
        for (const child of nodeChildren) {
          dfs(child, newPath);
        }
      }
    };

    for (const root of roots) {
      dfs(root.id, []);
    }

    return longestPath;
  }

  /**
   * Generate ASCII visualization
   */
  private generateAscii(epic: string, visNodes: Map<string, VisNode>): string {
    const lines: string[] = [];
    const summary = this.computeSummary(visNodes);

    // Header
    lines.push(`${epic} DAG Progress [${summary.done}/${summary.total}]`);
    lines.push('');

    // Group nodes by level
    const levelGroups = new Map<number, VisNode[]>();
    for (const node of visNodes.values()) {
      if (!levelGroups.has(node.level)) {
        levelGroups.set(node.level, []);
      }
      levelGroups.get(node.level)!.push(node);
    }

    // Sort levels
    const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);

    // Build edge map (parent -> children)
    const childrenMap = new Map<string, string[]>();
    for (const node of visNodes.values()) {
      for (const dep of node.deps) {
        if (!childrenMap.has(dep)) {
          childrenMap.set(dep, []);
        }
        childrenMap.get(dep)!.push(node.id);
      }
    }

    // Render each level
    for (const level of sortedLevels) {
      const nodesAtLevel = levelGroups.get(level)!;

      // Sort nodes at same level for consistent output
      nodesAtLevel.sort((a, b) => a.id.localeCompare(b.id));

      // Render nodes
      const nodeStrs: string[] = [];
      for (const node of nodesAtLevel) {
        const icon = STATUS_ICONS[node.status];
        const critical = node.isCritical ? '*' : ' ';
        const duration = node.duration ? ` (${this.formatDuration(node.duration)})` : '';
        nodeStrs.push(`${critical}${node.id} ${icon}${duration}`);
      }

      lines.push(nodeStrs.join('  '));

      // Render edges to next level
      if (level < sortedLevels[sortedLevels.length - 1]) {
        const edgeLines = this.renderEdges(nodesAtLevel, childrenMap, visNodes);
        lines.push(...edgeLines);
      }
    }

    // Legend
    lines.push('');
    lines.push('Legend: * = Critical Path');
    lines.push(`  ${STATUS_ICONS.done} done  ${STATUS_ICONS.running} running  ${STATUS_ICONS.pending} pending  ${STATUS_ICONS.failed} failed  ${STATUS_ICONS.skipped} skipped`);

    return lines.join('\n');
  }

  /**
   * Render edges between levels
   */
  private renderEdges(
    parents: VisNode[],
    childrenMap: Map<string, string[]>,
    visNodes: Map<string, VisNode>
  ): string[] {
    const lines: string[] = [];
    const connections: Array<{ parent: string; child: string }> = [];

    for (const parent of parents) {
      const children = childrenMap.get(parent.id) ?? [];
      for (const childId of children) {
        connections.push({ parent: parent.id, child: childId });
      }
    }

    if (connections.length === 0) {
      return lines;
    }

    // Simple edge rendering
    const edgeParts: string[] = [];
    for (const conn of connections) {
      const parentNode = visNodes.get(conn.parent);
      const childNode = visNodes.get(conn.child);
      if (parentNode && childNode) {
        const arrow = parentNode.isCritical && childNode.isCritical ? '===>' : '-->';
        edgeParts.push(`  ${conn.parent} ${arrow} ${conn.child}`);
      }
    }

    // Group similar edges
    const uniqueEdges = [...new Set(edgeParts)];
    if (uniqueEdges.length <= 3) {
      lines.push(uniqueEdges.join('  '));
    } else {
      // Multi-line for complex graphs
      for (const edge of uniqueEdges) {
        lines.push(edge);
      }
    }

    return lines;
  }

  /**
   * Generate Mermaid flowchart
   */
  private generateMermaid(epic: string, visNodes: Map<string, VisNode>): string {
    const lines: string[] = [];

    // Header with title
    lines.push('```mermaid');
    lines.push('flowchart TD');
    lines.push(`    subgraph ${epic}["${epic} DAG"]`);

    // Node definitions with status
    const sortedNodes = [...visNodes.values()].sort((a, b) =>
      a.level - b.level || a.id.localeCompare(b.id)
    );

    for (const node of sortedNodes) {
      const icon = STATUS_ICONS[node.status];
      const label = node.description
        ? `${node.id} ${icon}<br/>${this.escapeHtml(node.description)}`
        : `${node.id} ${icon}`;
      const shape = node.isCritical ? `([${label}])` : `[${label}]`;
      lines.push(`    ${node.id}${shape}`);
    }

    lines.push('    end');
    lines.push('');

    // Edges
    for (const node of sortedNodes) {
      for (const dep of node.deps) {
        const depNode = visNodes.get(dep);
        if (depNode) {
          const arrow = depNode.isCritical && node.isCritical ? '==>' : '-->';
          lines.push(`    ${dep} ${arrow} ${node.id}`);
        }
      }
    }

    // Styles
    lines.push('');
    for (const node of sortedNodes) {
      const color = MERMAID_COLORS[node.status];
      lines.push(`    style ${node.id} fill:${color}`);
    }

    lines.push('```');

    return lines.join('\n');
  }

  /**
   * Compute summary statistics
   */
  private computeSummary(
    visNodes: Map<string, VisNode>
  ): VisualizationResult['summary'] {
    const summary = {
      total: 0,
      done: 0,
      running: 0,
      pending: 0,
      failed: 0,
      skipped: 0,
    };

    for (const node of visNodes.values()) {
      summary.total++;
      summary[node.status]++;
    }

    return summary;
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m${seconds}s`;
  }

  /**
   * Escape HTML special characters for Mermaid
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create DAG visualizer instance
 */
export function createDAGVisualizer(): DAGVisualizer {
  return new DAGVisualizer();
}

// ============================================================================
// Standalone Functions (for CLI use)
// ============================================================================

/**
 * Generate ASCII visualization from DAG file
 */
export async function generateAsciiFromFile(
  yamlPath: string,
  runState?: RunStateInput
): Promise<string> {
  const visualizer = createDAGVisualizer();
  const dag = await visualizer.loadFromFile(yamlPath);
  const result = visualizer.visualize(dag, runState);
  return result.ascii;
}

/**
 * Generate Mermaid visualization from DAG file
 */
export async function generateMermaidFromFile(
  yamlPath: string,
  runState?: RunStateInput
): Promise<string> {
  const visualizer = createDAGVisualizer();
  const dag = await visualizer.loadFromFile(yamlPath);
  const result = visualizer.visualize(dag, runState);
  return result.mermaid;
}
