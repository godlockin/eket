/**
 * Task Split Command
 * TASK-608 Phase 3: Master splits large ticket into sub-tasks
 *
 * Usage: eket task:split <TASK-ID>
 *
 * Features:
 * - Validates ticket exists and is in 'in-progress' status
 * - Splits based on acceptance criteria (basic strategy)
 * - Creates sub-task files in jira/tickets/EPIC-XXX/
 * - Updates parent ticket with sub-task links
 */

import * as fs from 'fs';
import * as path from 'path';

interface SplitOptions {
  projectRoot: string;
  taskId: string;
  numSubtasks?: number; // Default: based on AC count
}

interface TicketMetadata {
  title: string;
  status: string;
  acceptanceCriteria: string[];
  epic?: string;
}

/**
 * Main entry: Split ticket into sub-tasks
 */
export async function splitTask(options: SplitOptions): Promise<void> {
  const { projectRoot, taskId } = options;

  // Step 1: Validate ticket exists
  const ticketPath = findTicketPath(projectRoot, taskId);
  if (!ticketPath) {
    throw new Error(`Ticket not found: ${taskId}`);
  }

  // Step 2: Parse ticket metadata
  const ticket = parseTicket(ticketPath);

  // Step 3: Validate status
  if (ticket.status !== 'in-progress' && ticket.status !== 'todo') {
    throw new Error(`Cannot split ticket in status: ${ticket.status} (expected in-progress or todo)`);
  }

  // Step 4: Determine split strategy (basic: 1 AC = 1 sub-task)
  const numSubtasks = options.numSubtasks || ticket.acceptanceCriteria.length;
  if (numSubtasks < 2) {
    throw new Error(`Not enough acceptance criteria to split (found ${ticket.acceptanceCriteria.length})`);
  }

  // Step 5: Create sub-task files
  const subTasks = createSubTasks(projectRoot, taskId, ticket, numSubtasks);

  // Step 6: Update parent ticket
  updateParentTicket(ticketPath, subTasks);

  console.log(`✅ Split ${taskId} into ${subTasks.length} sub-tasks`);
  subTasks.forEach((id) => console.log(`   - ${id}`));
}

/**
 * Find ticket file path (supports both flat and EPIC-based structure)
 */
function findTicketPath(projectRoot: string, taskId: string): string | null {
  const ticketsDir = path.join(projectRoot, 'jira', 'tickets');

  // Try flat structure: jira/tickets/TASK-XXX.md
  const flatPath = path.join(ticketsDir, `${taskId}.md`);
  if (fs.existsSync(flatPath)) return flatPath;

  // Try EPIC structure: jira/tickets/EPIC-XXX/TASK-XXX.md
  const epics = fs.readdirSync(ticketsDir).filter((name) => name.startsWith('EPIC-'));
  for (const epic of epics) {
    const epicPath = path.join(ticketsDir, epic, `${taskId}.md`);
    if (fs.existsSync(epicPath)) return epicPath;
  }

  return null;
}

/**
 * Parse ticket file to extract metadata
 */
function parseTicket(ticketPath: string): TicketMetadata {
  const content = fs.readFileSync(ticketPath, 'utf-8');

  // Extract title (first # header)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : 'Untitled';

  // Extract status
  const statusMatch = content.match(/\*\*Status\*\*:\s*`([^`]+)`/);
  const status = statusMatch ? statusMatch[1] : 'unknown';

  // Extract EPIC (from path or metadata)
  const epicMatch = ticketPath.match(/EPIC-\d+/);
  const epic = epicMatch ? epicMatch[0] : undefined;

  // Extract acceptance criteria (lines starting with - [ ] under ## Acceptance Criteria)
  const acSection = content.match(/## Acceptance Criteria\s*\n([\s\S]*?)(?=\n##|\n$)/);
  const acceptanceCriteria: string[] = [];
  if (acSection) {
    const lines = acSection[1].split('\n');
    lines.forEach((line) => {
      const acMatch = line.match(/^-\s+\[\s*\]\s+(.+)$/);
      if (acMatch) acceptanceCriteria.push(acMatch[1].trim());
    });
  }

  return { title, status, acceptanceCriteria, epic };
}

/**
 * Create sub-task files (basic strategy: evenly distribute ACs)
 */
function createSubTasks(
  projectRoot: string,
  parentId: string,
  ticket: TicketMetadata,
  numSubtasks: number
): string[] {
  const subTaskIds: string[] = [];
  const acsPerSubtask = Math.ceil(ticket.acceptanceCriteria.length / numSubtasks);

  // Determine output directory
  const ticketsDir = path.join(projectRoot, 'jira', 'tickets');
  const outputDir = ticket.epic
    ? path.join(ticketsDir, ticket.epic)
    : ticketsDir;

  for (let i = 0; i < numSubtasks; i++) {
    const subTaskId = `${parentId}-SUB-${i + 1}`;
    const subTaskPath = path.join(outputDir, `${subTaskId}.md`);

    // Assign ACs to this sub-task
    const startIdx = i * acsPerSubtask;
    const endIdx = Math.min(startIdx + acsPerSubtask, ticket.acceptanceCriteria.length);
    const assignedAcs = ticket.acceptanceCriteria.slice(startIdx, endIdx);

    // Generate sub-task content
    const content = `# ${subTaskId}: ${ticket.title} (Part ${i + 1})

**Parent**: ${parentId}
**Status**: \`todo\`
**Assignee**: (TBD)
**Created**: ${new Date().toISOString()}

## Description
Split from parent task ${parentId} due to context overflow risk.

This sub-task covers:
${assignedAcs.map((ac, idx) => `${idx + 1}. ${ac}`).join('\n')}

## Acceptance Criteria
${assignedAcs.map((ac) => `- [ ] ${ac}`).join('\n')}

## Implementation Notes
<!-- TODO: TASK-608 Phase 2.3 - Auto-extract context from session history -->
Refer to parent task ${parentId} for full context.

---
*Auto-generated by TASK-608 task:split command*
`;

    fs.writeFileSync(subTaskPath, content, 'utf-8');
    subTaskIds.push(subTaskId);
  }

  return subTaskIds;
}

/**
 * Update parent ticket to mark as split and link sub-tasks
 */
function updateParentTicket(ticketPath: string, subTaskIds: string[]): void {
  let content = fs.readFileSync(ticketPath, 'utf-8');

  // Update status to 'split' (or add note if status field doesn't exist)
  if (/\*\*Status\*\*:\s*`[^`]+`/.test(content)) {
    content = content.replace(/\*\*Status\*\*:\s*`[^`]+`/, `**Status**: \`split\``);
  } else {
    // Insert status after title
    content = content.replace(/^(#\s+.+$)/m, `$1\n\n**Status**: \`split\``);
  }

  // Add sub-tasks section
  const subTasksSection = `\n## Sub-Tasks\n${subTaskIds.map((id) => `- [ ] ${id}`).join('\n')}\n`;

  // Insert before ## Acceptance Criteria or at end
  if (/## Acceptance Criteria/.test(content)) {
    content = content.replace(/(## Acceptance Criteria)/, `${subTasksSection}\n$1`);
  } else {
    content = content.trimEnd() + `\n${subTasksSection}`;
  }

  fs.writeFileSync(ticketPath, content, 'utf-8');
}
