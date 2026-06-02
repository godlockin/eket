/**
 * Unit tests for epic-analyze command (TASK-645)
 *
 * Tests CLI command behavior for:
 *   - Complexity calculation logic
 *   - --json output format
 *   - DAG suggestion thresholds
 *   - Empty EPIC handling
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { Command } from 'commander';

import { registerEpicAnalyze } from '../../src/commands/epic-analyze.js';

describe('epic:analyze command', () => {
  let tempDir: string;
  let ticketsDir: string;
  let program: Command;
  let exitCode: number | null;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let stdoutWrite: typeof process.stdout.write;
  let stderrWrite: typeof process.stderr.write;
  let allOutput: string[];

  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;

  beforeEach(() => {
    // Create temp project structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-analyze-test-'));
    ticketsDir = path.join(tempDir, 'jira', 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });

    // Setup commander
    program = new Command();
    program.exitOverride();
    registerEpicAnalyze(program);

    // Capture console output
    exitCode = null;
    consoleOutput = [];
    consoleErrors = [];
    allOutput = [];

    console.log = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      consoleOutput.push(msg);
      allOutput.push(msg);
    };
    console.error = (...args: unknown[]) => {
      const msg = args.map(String).join(' ');
      consoleErrors.push(msg);
      allOutput.push(msg);
    };

    // Capture stdout/stderr writes (for ora spinner)
    stdoutWrite = process.stdout.write;
    stderrWrite = process.stderr.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      const msg = typeof chunk === 'string' ? chunk : chunk.toString();
      allOutput.push(msg);
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      const msg = typeof chunk === 'string' ? chunk : chunk.toString();
      allOutput.push(msg);
      return true;
    }) as typeof process.stderr.write;

    // Mock process.exit to capture exit code instead of exiting
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit called with "${code}"`);
    }) as never;
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // Helper to get all output (both log and error)
  function getAllOutput(): string {
    return allOutput.join('\n');
  }

  // Helper to create ticket files
  function createTicket(epicId: string, taskId: string, options: {
    status?: string;
    priority?: string;
    dependencies?: string[];
    module?: string;
  } = {}): void {
    const { status = 'ready', priority = 'P2', dependencies = [], module } = options;
    const epicDir = path.join(ticketsDir, epicId);
    fs.mkdirSync(epicDir, { recursive: true });

    const depsLine = dependencies.length > 0
      ? `**Blocked By**: ${dependencies.join(', ')}`
      : '';
    const moduleLine = module ? `\n## Files\n- ${module}/test.ts` : '';

    const content = `# ${taskId}: Test Task

**Status**: ${status}
**Priority**: ${priority}
${depsLine}
${moduleLine}
`;

    fs.writeFileSync(path.join(epicDir, `${taskId}.md`), content);
  }

  // ===========================================================================
  // epic:analyze - Basic Tests
  // ===========================================================================

  describe('epic:analyze', () => {
    it('should analyze simple EPIC complexity', async () => {
      createTicket('EPIC-001', 'TASK-001');
      createTicket('EPIC-001', 'TASK-002');

      await program.parseAsync(['epic:analyze', 'EPIC-001', '-p', tempDir], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('EPIC-001');
      expect(output).toContain('Sub-tasks:');
      expect(output).toContain('2');
    });

    it('should calculate complexity score correctly', async () => {
      // Create complex EPIC: 6 tasks, deep deps, cross-module
      createTicket('EPIC-017', 'TASK-001', { module: 'node/src' });
      createTicket('EPIC-017', 'TASK-002', { dependencies: ['TASK-001'], module: 'rust/crates' });
      createTicket('EPIC-017', 'TASK-003', { dependencies: ['TASK-002'], module: 'scripts' });
      createTicket('EPIC-017', 'TASK-004', { dependencies: ['TASK-003'], module: 'confluence' });
      createTicket('EPIC-017', 'TASK-005', { dependencies: ['TASK-004'] });
      createTicket('EPIC-017', 'TASK-006', { dependencies: ['TASK-001', 'TASK-002', 'TASK-005'] });

      await program.parseAsync(['epic:analyze', 'EPIC-017', '-p', tempDir], { from: 'user' });

      const output = getAllOutput();

      // Check metrics are displayed
      expect(output).toContain('Sub-tasks:');
      expect(output).toContain('6'); // 6 tasks
      expect(output).toContain('Dep depth:');
      expect(output).toContain('blocked_by:');
      expect(output).toContain('Cross-mod:');
      expect(output).toContain('Total:');
    });

    it('should suggest DAG when score >= 4', async () => {
      // Create complex EPIC that exceeds threshold
      // Need: subtaskCount >= 5 (+2) and something else to reach 4
      for (let i = 1; i <= 6; i++) {
        const deps = i > 1 ? [`TASK-${String(i - 1).padStart(3, '0')}`] : [];
        createTicket('EPIC-COMPLEX', `TASK-${String(i).padStart(3, '0')}`, {
          dependencies: deps,
          module: ['node/src', 'rust/crates', 'scripts'][i % 3],
        });
      }
      // Add task with multiple deps to increase blocked_by score
      createTicket('EPIC-COMPLEX', 'TASK-007', {
        dependencies: ['TASK-001', 'TASK-002', 'TASK-003'],
      });

      await program.parseAsync(['epic:analyze', 'EPIC-COMPLEX', '-p', tempDir], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('DAG');
      expect(output).toContain('dag:generate');
    });

    it('should not suggest DAG for simple EPIC', async () => {
      // Simple EPIC: 2 tasks, no deps
      createTicket('EPIC-SIMPLE', 'TASK-001');
      createTicket('EPIC-SIMPLE', 'TASK-002');

      await program.parseAsync(['epic:analyze', 'EPIC-SIMPLE', '-p', tempDir], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('manageable');
      expect(output).not.toContain('dag:generate');
    });

    it('should output JSON with --json flag', async () => {
      createTicket('EPIC-017', 'TASK-001');
      createTicket('EPIC-017', 'TASK-002', { dependencies: ['TASK-001'] });

      await program.parseAsync(['epic:analyze', 'EPIC-017', '-p', tempDir, '--json'], { from: 'user' });

      // JSON output goes to console.log only
      const output = consoleOutput.join('\n');

      // Should be valid JSON
      const jsonData = JSON.parse(output);

      expect(jsonData.epicId).toBe('EPIC-017');
      expect(jsonData.metrics).toBeDefined();
      expect(jsonData.metrics.subtaskCount).toBe(2);
      expect(jsonData.scores).toBeDefined();
      expect(jsonData.totalScore).toBeDefined();
      expect(typeof jsonData.suggestDAG).toBe('boolean');
      expect(jsonData.tasks).toBeDefined();
      expect(Array.isArray(jsonData.tasks)).toBe(true);
    });

    it('should handle empty EPIC', async () => {
      // Create EPIC directory but no tickets
      fs.mkdirSync(path.join(ticketsDir, 'EPIC-EMPTY'), { recursive: true });

      await expect(
        program.parseAsync(['epic:analyze', 'EPIC-EMPTY', '-p', tempDir], { from: 'user' })
      ).rejects.toThrow();

      expect(exitCode).toBe(1);
      expect(getAllOutput()).toContain('No tickets found');
    });

    it('should handle non-existent EPIC', async () => {
      await expect(
        program.parseAsync(['epic:analyze', 'EPIC-999', '-p', tempDir], { from: 'user' })
      ).rejects.toThrow();

      expect(exitCode).toBe(1);
      expect(getAllOutput()).toContain('No tickets found');
    });
  });

  // ===========================================================================
  // dag:generate Tests
  // ===========================================================================

  describe('dag:generate', () => {
    it('should generate dag.yml from EPIC tickets', async () => {
      createTicket('EPIC-017', 'TASK-001', { priority: 'P0' });
      createTicket('EPIC-017', 'TASK-002', { priority: 'P1', dependencies: ['TASK-001'] });
      createTicket('EPIC-017', 'TASK-003', { priority: 'P2', dependencies: ['TASK-001'] });

      await program.parseAsync(['dag:generate', 'EPIC-017', '-p', tempDir], { from: 'user' });

      // Check output file
      const dagPath = path.join(tempDir, 'dag.yml');
      expect(fs.existsSync(dagPath)).toBe(true);

      const dagContent = fs.readFileSync(dagPath, 'utf-8');
      expect(dagContent).toContain('version: "1.0"');
      expect(dagContent).toContain('epic: "EPIC-017"');
      expect(dagContent).toContain('TASK-001');
      expect(dagContent).toContain('TASK-002');
      expect(dagContent).toContain('TASK-003');
      expect(dagContent).toContain('deps:');
    });

    it('should support custom output path with -o flag', async () => {
      createTicket('EPIC-017', 'TASK-001');

      const customPath = path.join(tempDir, 'custom', 'epic017.yml');
      fs.mkdirSync(path.dirname(customPath), { recursive: true });

      await program.parseAsync(['dag:generate', 'EPIC-017', '-p', tempDir, '-o', customPath], { from: 'user' });

      expect(fs.existsSync(customPath)).toBe(true);
    });

    it('should preview DAG with --dry-run', async () => {
      createTicket('EPIC-017', 'TASK-001');
      createTicket('EPIC-017', 'TASK-002', { dependencies: ['TASK-001'] });

      await program.parseAsync(['dag:generate', 'EPIC-017', '-p', tempDir, '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('Preview');
      expect(output).toContain('TASK-001');
      expect(output).toContain('TASK-002');

      // File should NOT be written
      const dagPath = path.join(tempDir, 'dag.yml');
      expect(fs.existsSync(dagPath)).toBe(false);
    });

    it('should include timeout based on priority', async () => {
      createTicket('EPIC-017', 'TASK-P0', { priority: 'P0' });
      createTicket('EPIC-017', 'TASK-P1', { priority: 'P1' });
      createTicket('EPIC-017', 'TASK-P2', { priority: 'P2' });

      await program.parseAsync(['dag:generate', 'EPIC-017', '-p', tempDir], { from: 'user' });

      const dagPath = path.join(tempDir, 'dag.yml');
      const dagContent = fs.readFileSync(dagPath, 'utf-8');

      // P0 -> 2h, P1 -> 4h, P2 -> no timeout
      expect(dagContent).toContain('timeout: "2h"');
      expect(dagContent).toContain('timeout: "4h"');
    });

    it('should fail gracefully for empty EPIC', async () => {
      fs.mkdirSync(path.join(ticketsDir, 'EPIC-EMPTY'), { recursive: true });

      await expect(
        program.parseAsync(['dag:generate', 'EPIC-EMPTY', '-p', tempDir], { from: 'user' })
      ).rejects.toThrow();

      expect(exitCode).toBe(1);
      expect(getAllOutput()).toContain('No tickets found');
    });

    it('should topologically sort nodes', async () => {
      // Create out-of-order tickets
      createTicket('EPIC-017', 'TASK-003', { dependencies: ['TASK-002'] });
      createTicket('EPIC-017', 'TASK-001');
      createTicket('EPIC-017', 'TASK-002', { dependencies: ['TASK-001'] });

      await program.parseAsync(['dag:generate', 'EPIC-017', '-p', tempDir], { from: 'user' });

      const dagPath = path.join(tempDir, 'dag.yml');
      const dagContent = fs.readFileSync(dagPath, 'utf-8');

      // TASK-001 should appear before TASK-002, which appears before TASK-003
      const pos1 = dagContent.indexOf('TASK-001');
      const pos2 = dagContent.indexOf('TASK-002');
      const pos3 = dagContent.indexOf('TASK-003');

      expect(pos1).toBeLessThan(pos2);
      expect(pos2).toBeLessThan(pos3);
    });
  });

  // ===========================================================================
  // Complexity Threshold Tests
  // ===========================================================================

  describe('complexity thresholds', () => {
    it('should award subtask score when count >= 5', async () => {
      // 5 tasks
      for (let i = 1; i <= 5; i++) {
        createTicket('EPIC-005', `TASK-${String(i).padStart(3, '0')}`);
      }

      await program.parseAsync(['epic:analyze', 'EPIC-005', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.metrics.subtaskCount).toBe(5);
      expect(jsonData.scores.subtaskScore).toBe(2); // Weight = 2
    });

    it('should not award subtask score when count < 5', async () => {
      // 4 tasks
      for (let i = 1; i <= 4; i++) {
        createTicket('EPIC-004', `TASK-${String(i).padStart(3, '0')}`);
      }

      await program.parseAsync(['epic:analyze', 'EPIC-004', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.metrics.subtaskCount).toBe(4);
      expect(jsonData.scores.subtaskScore).toBe(0);
    });

    it('should award dependency depth score when depth >= 3', async () => {
      // Chain: 1 -> 2 -> 3 -> 4 (depth = 4)
      createTicket('EPIC-DEEP', 'TASK-001');
      createTicket('EPIC-DEEP', 'TASK-002', { dependencies: ['TASK-001'] });
      createTicket('EPIC-DEEP', 'TASK-003', { dependencies: ['TASK-002'] });
      createTicket('EPIC-DEEP', 'TASK-004', { dependencies: ['TASK-003'] });

      await program.parseAsync(['epic:analyze', 'EPIC-DEEP', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.metrics.dependencyDepth).toBeGreaterThanOrEqual(3);
      expect(jsonData.scores.depthScore).toBe(3); // Weight = 3
    });

    it('should award blocked_by score when max >= 2', async () => {
      createTicket('EPIC-BLOCKED', 'TASK-001');
      createTicket('EPIC-BLOCKED', 'TASK-002');
      createTicket('EPIC-BLOCKED', 'TASK-003', { dependencies: ['TASK-001', 'TASK-002'] });

      await program.parseAsync(['epic:analyze', 'EPIC-BLOCKED', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.metrics.maxBlockedBy).toBe(2);
      expect(jsonData.scores.blockedByScore).toBe(1); // Weight = 1
    });

    it('should award cross-module score when modules >= 3', async () => {
      createTicket('EPIC-MULTI', 'TASK-001', { module: 'node/src' });
      createTicket('EPIC-MULTI', 'TASK-002', { module: 'rust/crates' });
      createTicket('EPIC-MULTI', 'TASK-003', { module: 'scripts' });

      await program.parseAsync(['epic:analyze', 'EPIC-MULTI', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.metrics.crossModuleCount).toBe(3);
      expect(jsonData.scores.crossModuleScore).toBe(1); // Weight = 1
    });

    it('should calculate total score correctly', async () => {
      // Create EPIC that triggers all thresholds
      // 6 tasks (+2), depth 3 (+3), blocked_by 2 (+1), cross-module 3 (+1) = 7
      createTicket('EPIC-MAX', 'TASK-001', { module: 'node/src' });
      createTicket('EPIC-MAX', 'TASK-002', { dependencies: ['TASK-001'], module: 'rust/crates' });
      createTicket('EPIC-MAX', 'TASK-003', { dependencies: ['TASK-002'], module: 'scripts' });
      createTicket('EPIC-MAX', 'TASK-004', { dependencies: ['TASK-003'] });
      createTicket('EPIC-MAX', 'TASK-005', { dependencies: ['TASK-001', 'TASK-002'] });
      createTicket('EPIC-MAX', 'TASK-006');

      await program.parseAsync(['epic:analyze', 'EPIC-MAX', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));

      // Verify total is sum of individual scores
      const expectedTotal =
        jsonData.scores.subtaskScore +
        jsonData.scores.depthScore +
        jsonData.scores.blockedByScore +
        jsonData.scores.crossModuleScore;

      expect(jsonData.totalScore).toBe(expectedTotal);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('should handle tickets with external dependencies', async () => {
      // Dependencies pointing to tickets outside the EPIC
      createTicket('EPIC-017', 'TASK-001', { dependencies: ['TASK-EXTERNAL-001'] });
      createTicket('EPIC-017', 'TASK-002', { dependencies: ['TASK-001', 'TASK-EXTERNAL-002'] });

      await program.parseAsync(['epic:analyze', 'EPIC-017', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));

      // External deps should be ignored in depth calculation
      expect(jsonData.metrics.subtaskCount).toBe(2);
    });

    it('should handle tickets with cyclic dependencies', async () => {
      // A -> B -> C -> A (cycle)
      createTicket('EPIC-CYCLE', 'TASK-A', { dependencies: ['TASK-C'] });
      createTicket('EPIC-CYCLE', 'TASK-B', { dependencies: ['TASK-A'] });
      createTicket('EPIC-CYCLE', 'TASK-C', { dependencies: ['TASK-B'] });

      // Should not throw, should handle gracefully
      await program.parseAsync(['epic:analyze', 'EPIC-CYCLE', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.metrics.subtaskCount).toBe(3);
    });

    it('should handle single-task EPIC', async () => {
      createTicket('EPIC-SINGLE', 'TASK-001');

      await program.parseAsync(['epic:analyze', 'EPIC-SINGLE', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.metrics.subtaskCount).toBe(1);
      expect(jsonData.metrics.dependencyDepth).toBe(1);
      expect(jsonData.metrics.maxBlockedBy).toBe(0);
      expect(jsonData.suggestDAG).toBe(false);
    });

    it('should handle tickets with various status formats', async () => {
      const epicDir = path.join(ticketsDir, 'EPIC-STATUS');
      fs.mkdirSync(epicDir, { recursive: true });

      // Different status formats
      fs.writeFileSync(path.join(epicDir, 'TASK-001.md'), `# TASK-001
**Status**: ready
`);
      fs.writeFileSync(path.join(epicDir, 'TASK-002.md'), `# TASK-002
**状态**: done
`);
      fs.writeFileSync(path.join(epicDir, 'TASK-003.md'), `# TASK-003
**Status**: \`backlog\`
`);

      await program.parseAsync(['epic:analyze', 'EPIC-STATUS', '-p', tempDir, '--json'], { from: 'user' });

      const jsonData = JSON.parse(consoleOutput.join('\n'));
      expect(jsonData.tasks.length).toBe(3);
    });
  });
});
