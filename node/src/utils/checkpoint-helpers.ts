/**
 * TASK-X02: Checkpoint Helper Utilities
 *
 * Convenience functions for Slaver to record progress at key milestones.
 * These are lightweight wrappers around slaver-progress-integration.
 *
 * Usage in Slaver workflow:
 * ```typescript
 * // After writing analysis-report.md:
 * await recordAnalysisComplete('analysis-report.md');
 *
 * // After writing design-decisions.md:
 * await recordDesignComplete('design-decisions.md');
 *
 * // After AC implementation + tests pass:
 * await recordACComplete('1', {
 *   files: ['src/auth.ts', 'tests/auth.test.ts'],
 *   testCommand: 'npm test -- auth.test.ts',
 * });
 * ```
 */

import { safeCheckpoint, completePhase, completeAC } from '../core/slaver-progress-integration.js';
import { TaskPhase } from '../types/progress-tracker.js';

/**
 * Record analysis phase completion
 *
 * Call after writing analysis-report.md
 *
 * @param artifactPath - Relative path to analysis artifact (e.g., "jira/tickets/TASK-X02/analysis-report.md")
 */
export async function recordAnalysisComplete(artifactPath: string): Promise<void> {
  await completePhase(TaskPhase.ANALYSIS, {
    artifact: artifactPath,
    notes: 'Analysis phase complete',
  });
}

/**
 * Record design phase completion
 *
 * Call after writing design-decisions.md or architecture docs
 *
 * @param artifactPath - Relative path to design artifact
 */
export async function recordDesignComplete(artifactPath: string): Promise<void> {
  await completePhase(TaskPhase.DESIGN, {
    artifact: artifactPath,
    notes: 'Design phase complete',
  });
}

/**
 * Record AC (Acceptance Criteria) completion
 *
 * Call after AC implementation + tests pass
 *
 * @param acId - AC identifier (e.g., "1", "2", "AC-1")
 * @param metadata - Optional metadata
 * @param metadata.files - Files modified for this AC
 * @param metadata.testCommand - Test command that passed
 * @param metadata.exitCode - Test exit code (default: 0)
 */
export async function recordACComplete(
  acId: string,
  metadata?: {
    files?: string[];
    testCommand?: string;
    exitCode?: number;
  }
): Promise<void> {
  await completeAC(acId, {
    files: metadata?.files,
    tests: metadata?.testCommand
      ? {
          passed: (metadata?.exitCode ?? 0) === 0,
          command: metadata.testCommand,
          exitCode: metadata.exitCode ?? 0,
        }
      : undefined,
  });
}

/**
 * Record tests passed checkpoint
 *
 * Call after full test suite passes
 *
 * @param testCommand - Command used to run tests (e.g., "npm test")
 * @param exitCode - Test exit code (default: 0)
 */
export async function recordTestsPassedComplete(
  testCommand: string,
  exitCode: number = 0
): Promise<void> {
  await safeCheckpoint('tests_passed', {
    tests: {
      passed: exitCode === 0,
      command: testCommand,
      exitCode,
    },
    notes: 'All tests passed',
  });
}

/**
 * Record implementation phase completion
 *
 * Call after all coding is done but before final tests
 */
export async function recordImplementationComplete(): Promise<void> {
  await completePhase(TaskPhase.IMPLEMENTATION, {
    notes: 'Implementation phase complete',
  });
}
