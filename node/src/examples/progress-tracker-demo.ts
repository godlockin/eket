/**
 * EKET Framework - ProgressTracker Demo
 *
 * Demonstrates ProgressTracker usage in a simulated Slaver workflow.
 *
 * Run:
 *   npm run build
 *   node dist/examples/progress-tracker-demo.js
 */

import { ProgressTracker } from '../core/progress-tracker.js';
import { TaskPhase } from '../types/progress-tracker.js';

/**
 * Simulate async work
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Demo: Simulated Slaver executing TASK-DEMO-001
 */
async function demo(): Promise<void> {
  console.log('=== ProgressTracker Demo ===\n');

  const tracker = new ProgressTracker({
    taskId: 'TASK-DEMO-001',
    slaverId: 'slaver-demo',
    flushIntervalMs: 5000, // 5s for demo
    outputDir: 'jira/tickets/TASK-DEMO-001',
  });

  console.log('📝 Starting task execution...\n');

  // Phase 1: Analysis
  console.log('[1/4] Analysis phase...');
  await tracker.startPhase(TaskPhase.ANALYSIS);
  await sleep(1000);

  await tracker.addNote('Analyzing requirements from TASK-DEMO-001.md');
  await sleep(500);

  await tracker.completePhase(TaskPhase.ANALYSIS, {
    artifact: 'analysis-report.md',
  });
  console.log('✅ Analysis complete\n');

  // Phase 2: Design
  console.log('[2/4] Design phase...');
  await tracker.startPhase(TaskPhase.DESIGN);
  await sleep(1000);

  await tracker.addNote('Designed 3-tier architecture');
  await tracker.addNextStep('Implement database layer');
  await tracker.addNextStep('Implement business logic');
  await tracker.addNextStep('Implement API endpoints');
  await sleep(500);

  await tracker.completePhase(TaskPhase.DESIGN, {
    artifact: 'design-decisions.md',
  });
  console.log('✅ Design complete\n');

  // Phase 3: Implementation
  console.log('[3/4] Implementation phase...');
  await tracker.startPhase(TaskPhase.IMPLEMENTATION);

  // AC-1
  console.log('  - Implementing AC-1...');
  await sleep(800);
  await tracker.completeAC('1', {
    files: ['src/database/connection.ts', 'src/database/models.ts'],
    tests: { passed: true, command: 'npm test -- database', exitCode: 0 },
  });

  // AC-2
  console.log('  - Implementing AC-2...');
  await sleep(800);
  await tracker.completeAC('2', {
    files: ['src/services/user-service.ts', 'tests/user-service.test.ts'],
    tests: { passed: true, command: 'npm test -- user-service', exitCode: 0 },
  });

  // AC-3 with blocker
  console.log('  - Implementing AC-3...');
  await sleep(500);
  await tracker.addBlocker('Missing API credentials for external service');
  await tracker.addNote('Waiting for API key from DevOps');

  // Simulate blocker resolution
  await sleep(1000);
  console.log('  - Blocker resolved, continuing...');
  await tracker.completeAC('3', {
    files: ['src/api/routes.ts', 'src/api/middleware.ts'],
    tests: { passed: true },
  });

  await tracker.completePhase(TaskPhase.IMPLEMENTATION);
  console.log('✅ Implementation complete\n');

  // Phase 4: Testing
  console.log('[4/4] Testing phase...');
  await tracker.startPhase(TaskPhase.TESTING);
  await sleep(1000);

  await tracker.checkpoint('tests_passed', {
    tests: {
      passed: true,
      command: 'npm test',
      exitCode: 0,
    },
  });

  await tracker.completePhase(TaskPhase.TESTING);
  console.log('✅ Testing complete\n');

  // Ready for PR
  console.log('📦 Preparing PR...');
  await tracker.checkpoint(TaskPhase.READY_FOR_PR, {
    commit: 'a1b2c3d4e5f6',
  });

  // Final flush and close
  console.log('💾 Flushing progress...');
  await tracker.close();

  console.log('\n=== Demo Complete ===');
  console.log('Check: jira/tickets/TASK-DEMO-001/progress.md\n');

  // Display snapshot
  const snapshot = tracker.getSnapshot();
  console.log('Final snapshot:');
  console.log(`  Task: ${snapshot.taskId}`);
  console.log(`  Slaver: ${snapshot.slaverId}`);
  console.log(`  Current Phase: ${snapshot.currentPhase}`);
  console.log(`  Completed Phases: ${Array.from(snapshot.completedPhases).join(', ')}`);
  console.log(`  Checkpoints: ${snapshot.checkpoints.length}`);
}

// Run demo
demo().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
