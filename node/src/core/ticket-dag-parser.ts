/**
 * Ticket DAG Parser
 *
 * Scans jira/tickets/*.md files and builds a DAG (nodes + edges)
 * based on blocked_by dependency declarations.
 */

import fs from 'fs';
import path from 'path';

export interface DagNode {
  id: string;
  label: string;
  status: string;
  assignee?: string;
}

export interface DagEdge {
  source: string; // ticket that depends on target
  target: string; // the dependency
}

export interface DagResponse {
  nodes: DagNode[];
  edges: DagEdge[];
}

/**
 * Parse a single ticket markdown file into a DagNode + its blocked_by list.
 */
export function parseTicketFile(content: string, ticketId: string): { node: DagNode; blockedBy: string[] } {
  // Title: "# TASK-NNN: <title>" or "**标题**: <title>"
  let label = ticketId;
  const h1Match = content.match(/^#\s+\S+:\s+(.+)$/m);
  if (h1Match) {
    label = h1Match[1].trim();
  } else {
    const titleMatch = content.match(/\*\*标题\*\*\s*:\s*(.+)/);
    if (titleMatch) {label = titleMatch[1].trim();}
  }

  // Status
  let status = 'unknown';
  const statusMatch = content.match(/\*\*状态\*\*\s*:\s*(\S+)/);
  if (statusMatch) {status = statusMatch[1].trim();}

  // Assignee
  let assignee: string | undefined;
  const assigneeMatch = content.match(/\*\*负责人\*\*\s*:\s*(.+)/);
  if (assigneeMatch) {
    const raw = assigneeMatch[1].trim();
    if (raw && raw !== '待认领') {assignee = raw;}
  }

  // blocked_by: [TASK-X, TASK-Y] or []
  const blockedBy: string[] = [];
  const blockedByMatch = content.match(/-\s*blocked_by\s*:\s*\[([^\]]*)\]/);
  if (blockedByMatch) {
    const inner = blockedByMatch[1].trim();
    if (inner) {
      inner.split(',').forEach((s) => {
        const id = s.trim();
        if (id) {blockedBy.push(id);}
      });
    }
  }

  return {
    node: { id: ticketId, label, status, assignee },
    blockedBy,
  };
}

/**
 * Scan ticketsDir for *.md files and build the full DAG.
 * Only files matching TASK-\d+.md (flat, no subdirs) are processed.
 */
export function parseTicketsDag(ticketsDir: string): DagResponse {
  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];

  let files: string[];
  try {
    files = fs.readdirSync(ticketsDir);
  } catch {
    return { nodes, edges };
  }

  const ticketFiles = files.filter((f) => /^TASK-\d+\.md$/.test(f));

  for (const file of ticketFiles) {
    const ticketId = path.basename(file, '.md');
    let content: string;
    try {
      content = fs.readFileSync(path.join(ticketsDir, file), 'utf-8');
    } catch {
      continue;
    }

    const { node, blockedBy } = parseTicketFile(content, ticketId);
    nodes.push(node);

    for (const dep of blockedBy) {
      edges.push({ source: ticketId, target: dep });
    }
  }

  // Sort nodes by id for deterministic output
  nodes.sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, edges };
}
