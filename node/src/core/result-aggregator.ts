/**
 * EKET Framework - Result Aggregator (TASK-121)
 * Merges SlaveResult objects and detects file conflicts.
 */

import type { SlaveResult, AggregatedResult, FileConflict } from '../types/index.js';

export class ResultAggregator {
  /**
   * Aggregate multiple SlaveResults into a single AggregatedResult.
   * Files appearing in more than one result are recorded as conflicts.
   */
  aggregate(results: SlaveResult[]): AggregatedResult {
    const conflicts = this.detectConflicts(results);

    const allFilesChanged = [...new Set(results.flatMap((r) => r.filesChanged))];

    return {
      tickets: results.map((r) => r.ticketId),
      allFilesChanged,
      conflicts,
      totalTestsAdded: results.reduce((sum, r) => sum + r.testsAdded, 0),
      totalTestsPassed: results.reduce((sum, r) => sum + r.testsPassed, 0),
    };
  }

  /**
   * Detect files that appear in multiple SlaveResults (i.e., changed by multiple tickets).
   */
  detectConflicts(results: SlaveResult[]): FileConflict[] {
    const fileToTickets = new Map<string, string[]>();

    for (const result of results) {
      for (const file of result.filesChanged) {
        const existing = fileToTickets.get(file) ?? [];
        if (!existing.includes(result.ticketId)) {
          existing.push(result.ticketId);
        }
        fileToTickets.set(file, existing);
      }
    }

    const conflicts: FileConflict[] = [];
    for (const [file, tickets] of fileToTickets) {
      if (tickets.length > 1) {
        conflicts.push({ file, tickets });
      }
    }

    return conflicts;
  }
}
