/**
 * EKET Framework - Progress Markdown Parser
 *
 * Parses progress.md files into structured ProgressSnapshot objects
 * for verification and recovery purposes.
 */

import { CheckpointMetadata, ProgressSnapshot, TaskPhase } from '../types/progress-tracker.js';

/**
 * Parsed checkpoint item from Markdown
 */
export interface ParsedCheckpoint {
  phase: string;
  timestamp: string;
  metadata: CheckpointMetadata;
}

/**
 * Parse result with errors
 */
export interface ParseResult {
  success: boolean;
  data?: ProgressSnapshot;
  error?: {
    message: string;
    line?: number;
  };
}

/**
 * Parse progress.md Markdown content into ProgressSnapshot
 */
export function parseProgressMarkdown(content: string, taskId: string): ParseResult {
  try {
    const lines = content.split('\n');
    const snapshot: Partial<ProgressSnapshot> = {
      taskId,
      slaverId: '',
      currentPhase: TaskPhase.ANALYSIS,
      lastUpdate: '',
      checkpoints: [],
      completedPhases: new Set(),
      nextSteps: [],
      blockers: [],
    };

    let section: 'header' | 'completed' | 'current' | 'next' | 'blockers' | 'notes' | 'none' = 'none';
    let lineNumber = 0;

    for (const line of lines) {
      lineNumber++;
      const trimmed = line.trim();

      // Section headers
      if (trimmed === '## Completed') {
        section = 'completed';
        continue;
      }
      if (trimmed === '## Current Work') {
        section = 'current';
        continue;
      }
      if (trimmed === '## Next Steps') {
        section = 'next';
        continue;
      }
      if (trimmed === '## Blockers') {
        section = 'blockers';
        continue;
      }
      if (trimmed === '## Recent Notes') {
        section = 'notes';
        continue;
      }
      if (trimmed.startsWith('##')) {
        section = 'none';
        continue;
      }

      // Parse header metadata
      if (trimmed.startsWith('**Last Update**:')) {
        snapshot.lastUpdate = trimmed.replace('**Last Update**:', '').trim();
        continue;
      }
      if (trimmed.startsWith('**Slaver**:')) {
        snapshot.slaverId = trimmed.replace('**Slaver**:', '').trim();
        continue;
      }
      if (trimmed.startsWith('**Current Phase**:')) {
        const phase = trimmed
          .replace('**Current Phase**:', '')
          .trim()
          .replace(/`/g, '');
        snapshot.currentPhase = phase as TaskPhase;
        continue;
      }

      // Parse completed checkpoints
      if (section === 'completed' && trimmed.startsWith('- [x]')) {
        const checkpoint = parseCompletedCheckpoint(trimmed, lines, lineNumber);
        if (checkpoint) {
          snapshot.checkpoints!.push({
            timestamp: checkpoint.timestamp,
            phase: checkpoint.phase,
            metadata: checkpoint.metadata,
          });
          // Mark phase as completed
          const phaseName = checkpoint.phase.replace(/_done$/, '');
          snapshot.completedPhases!.add(phaseName);
        }
        continue;
      }

      // Parse current work (in-progress)
      if (section === 'current' && trimmed.startsWith('- [ ]')) {
        const phaseMatch = trimmed.match(/- \[ \] (.+?)(\s+\((\d+)%\))?$/);
        if (phaseMatch) {
          const phase = phaseMatch[1].trim();
          const percentage = phaseMatch[3] ? parseInt(phaseMatch[3], 10) : 0;
          snapshot.checkpoints!.push({
            timestamp: snapshot.lastUpdate || new Date().toISOString(),
            phase: `${phase}_start`,
            metadata: { percentage },
          });
        }
        continue;
      }

      // Parse next steps
      if (section === 'next' && trimmed.startsWith('- [ ]')) {
        const step = trimmed.replace('- [ ]', '').trim();
        snapshot.nextSteps!.push(step);
        continue;
      }

      // Parse blockers
      if (section === 'blockers' && trimmed.startsWith('- ⚠️')) {
        const blocker = trimmed.replace('- ⚠️', '').trim();
        snapshot.blockers!.push(blocker);
        continue;
      }

      // Parse notes
      if (section === 'notes' && trimmed.startsWith('-')) {
        const noteMatch = trimmed.match(/- (\d{2}:\d{2}) - (.+)/);
        if (noteMatch) {
          snapshot.checkpoints!.push({
            timestamp: snapshot.lastUpdate || new Date().toISOString(),
            phase: 'note',
            metadata: { notes: noteMatch[2] },
          });
        }
        continue;
      }
    }

    // Validation
    if (!snapshot.slaverId) {
      return {
        success: false,
        error: { message: 'Missing required field: Slaver ID' },
      };
    }

    return {
      success: true,
      data: snapshot as ProgressSnapshot,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown parsing error',
      },
    };
  }
}

/**
 * Parse a completed checkpoint line with metadata
 */
function parseCompletedCheckpoint(
  line: string,
  allLines: string[],
  currentLineIndex: number
): ParsedCheckpoint | null {
  // Format: - [x] phase_name (MM/DD/YYYY, HH:MM:SS AM/PM)
  const match = line.match(/- \[x\] (.+?) \((.+?)\)/);
  if (!match) return null;

  const phase = match[1].trim();
  const timestamp = parseTimestamp(match[2]);

  const metadata: CheckpointMetadata = {};

  // Parse metadata from following lines (indented)
  let idx = currentLineIndex;
  while (idx < allLines.length - 1) {
    const nextLine = allLines[idx].trim();
    if (!nextLine.startsWith('- ')) break;

    // artifact
    const artifactMatch = nextLine.match(/- artifact: (.+)/);
    if (artifactMatch) {
      metadata.artifact = artifactMatch[1].trim();
      idx++;
      continue;
    }

    // files
    const filesMatch = nextLine.match(/- files: (.+)/);
    if (filesMatch) {
      metadata.files = filesMatch[1]
        .split(',')
        .map((f) => f.trim());
      idx++;
      continue;
    }

    // test
    const testMatch = nextLine.match(/- test: (✅|❌)/);
    if (testMatch) {
      metadata.tests = {
        passed: testMatch[1] === '✅',
      };
      idx++;
      continue;
    }

    // commit
    const commitMatch = nextLine.match(/- commit: (.+)/);
    if (commitMatch) {
      metadata.commit = commitMatch[1].trim();
      idx++;
      continue;
    }

    break;
  }

  return { phase, timestamp, metadata };
}

/**
 * Parse timestamp from various formats to ISO8601
 */
function parseTimestamp(timestampStr: string): string {
  try {
    // Try ISO format first
    if (timestampStr.match(/^\d{4}-\d{2}-\d{2}T/)) {
      return timestampStr;
    }

    // Parse "MM/DD/YYYY, HH:MM:SS AM/PM" format
    const date = new Date(timestampStr);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }

    // Fallback to current time
    return new Date().toISOString();
  } catch {
    return new Date().toISOString();
  }
}
