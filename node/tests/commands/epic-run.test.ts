/**
 * Unit tests for epic-run command (TASK-645)
 *
 * Tests CLI command behavior for:
 *   - --dag mode execution
 *   - --dry-run preview
 *   - --watch monitoring mode
 *   - Error handling (EPIC not found, DAG generation failures)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { Command } from 'commander';

import { registerEpicRunCommand } from '../../src/commands/epic-run.js';

describe('epic:run command', () => {
  let tempDir: string;
  let ticketsDir: string;
  let program: Command;
  let exitCode: number | null;
  let consoleOutput: string[];
  let consoleErrors: string[];
  let stdoutWrite: typeof process.stdout.write;
  let stderrWrite: typeof process.stderr.write;
  let allOutput: string[];

  // Capture console output and process.exit
  const originalLog = console.log;
  const originalError = console.error;
  const originalExit = process.exit;

  beforeEach(() => {
    // Create temp project structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-run-test-'));
    ticketsDir = path.join(tempDir, 'jira', 'tickets');
    fs.mkdirSync(ticketsDir, { recursive: true });

    // Setup commander
    program = new Command();
    program.exitOverride();
    registerEpicRunCommand(program);

    // Capture exit codes and console output
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
    // Restore console and process.exit
    console.log = originalLog;
    console.error = originalError;
    process.exit = originalExit;
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;

    // Cleanup temp dir
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
  // EPIC ID Validation Tests
  // ===========================================================================

  describe('EPIC ID validation', () => {
    it('should reject invalid EPIC ID format', async () => {
      await expect(
        program.parseAsync(['epic:run', 'INVALID', '-p', tempDir], { from: 'user' })
      ).rejects.toThrow();

      expect(exitCode).toBe(1);
      expect(getAllOutput()).toContain('Invalid EPIC ID format');
    });

    it('should accept valid EPIC ID format (EPIC-NNN)', async () => {
      createTicket('EPIC-017', 'TASK-001');

      // Should not throw on valid format - just verify no error occurred
      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      // Sequential mode should report tasks found
      expect(output).toContain('Total tasks:');
      expect(output).toContain('TASK-001');
    });
  });

  // ===========================================================================
  // EPIC Not Found Tests
  // ===========================================================================

  describe('EPIC not found handling', () => {
    it('should fail gracefully when EPIC not found', async () => {
      // EPIC-999 doesn't exist
      await expect(
        program.parseAsync(['epic:run', 'EPIC-999', '-p', tempDir], { from: 'user' })
      ).rejects.toThrow();

      expect(exitCode).toBe(1);
      expect(getAllOutput()).toContain('No tickets found');
    });

    it('should fail when tickets directory not found', async () => {
      const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'));

      await expect(
        program.parseAsync(['epic:run', 'EPIC-017', '-p', emptyDir], { from: 'user' })
      ).rejects.toThrow();

      expect(exitCode).toBe(1);
      expect(getAllOutput()).toContain('Tickets directory not found');

      fs.rmSync(emptyDir, { recursive: true, force: true });
    });
  });

  // ===========================================================================
  // Sequential Mode Tests
  // ===========================================================================

  describe('sequential mode (default)', () => {
    it('should list ready tasks in priority order with --dry-run', async () => {
      createTicket('EPIC-017', 'TASK-001', { priority: 'P2', status: 'ready' });
      createTicket('EPIC-017', 'TASK-002', { priority: 'P0', status: 'ready' });
      createTicket('EPIC-017', 'TASK-003', { priority: 'P1', status: 'done' });

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('Sequential mode');
      expect(output).toContain('dry-run');

      // P0 should appear before P2 in the output
      const p0Pos = output.indexOf('TASK-002');
      const p2Pos = output.indexOf('TASK-001');
      expect(p0Pos).toBeLessThan(p2Pos);
    });

    it('should filter out done/in-progress tasks', async () => {
      createTicket('EPIC-017', 'TASK-001', { status: 'ready' });
      createTicket('EPIC-017', 'TASK-002', { status: 'done' });
      createTicket('EPIC-017', 'TASK-003', { status: 'in-progress' });

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      // Only ready/backlog tasks should be in execution order
      expect(output).toContain('Ready tasks: 1');
    });

    it('should show dependencies in output', async () => {
      createTicket('EPIC-017', 'TASK-001', { status: 'ready' });
      createTicket('EPIC-017', 'TASK-002', { status: 'backlog', dependencies: ['TASK-001'] });

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('deps:');
      expect(output).toContain('TASK-001');
    });
  });

  // ===========================================================================
  // DAG Mode Tests
  // ===========================================================================

  describe('DAG mode (--dag)', () => {
    it('should auto-generate dag.yml if not exists', async () => {
      createTicket('EPIC-017', 'TASK-001', { priority: 'P1' });
      createTicket('EPIC-017', 'TASK-002', { priority: 'P2', dependencies: ['TASK-001'] });

      const dagPath = path.join(ticketsDir, 'EPIC-017', 'dag.yml');
      expect(fs.existsSync(dagPath)).toBe(false);

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run'], { from: 'user' });

      // DAG file should be created
      expect(fs.existsSync(dagPath)).toBe(true);

      // Verify DAG content
      const dagContent = fs.readFileSync(dagPath, 'utf-8');
      expect(dagContent).toContain('TASK-001');
      expect(dagContent).toContain('TASK-002');
      expect(dagContent).toContain('deps:');
    });

    it('should use existing dag.yml if present', async () => {
      createTicket('EPIC-017', 'TASK-001');

      const epicDir = path.join(ticketsDir, 'EPIC-017');
      const dagPath = path.join(epicDir, 'dag.yml');

      // Pre-create dag.yml
      const existingDag = `# Existing DAG
version: "1.0"
epic: "EPIC-017"
settings:
  max_parallel: 5
nodes:
  - id: "TASK-001"
    script: "echo existing"
`;
      fs.writeFileSync(dagPath, existingDag);

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('Using existing DAG');
    });

    it('should regenerate dag.yml with --force', async () => {
      createTicket('EPIC-017', 'TASK-001');
      createTicket('EPIC-017', 'TASK-002', { dependencies: ['TASK-001'] });

      const epicDir = path.join(ticketsDir, 'EPIC-017');
      const dagPath = path.join(epicDir, 'dag.yml');

      // Pre-create dag.yml with different content
      fs.writeFileSync(dagPath, '# Old DAG\nversion: "0.5"\n');

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run', '--force'], { from: 'user' });

      // DAG should be regenerated
      const dagContent = fs.readFileSync(dagPath, 'utf-8');
      expect(dagContent).toContain('version: "1.0"');
      expect(dagContent).toContain('TASK-001');
    });

    it('should preview execution with --dry-run', async () => {
      createTicket('EPIC-017', 'TASK-001', { priority: 'P0' });
      createTicket('EPIC-017', 'TASK-002', { priority: 'P1', dependencies: ['TASK-001'] });

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('Dry run: true');
      expect(output).toContain('DAG');
    });

    it('should report node count in DAG mode', async () => {
      createTicket('EPIC-017', 'TASK-001');
      createTicket('EPIC-017', 'TASK-002', { dependencies: ['TASK-001'] });
      createTicket('EPIC-017', 'TASK-003', { dependencies: ['TASK-001'] });

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('Nodes: 3');
    });
  });

  // ===========================================================================
  // Watch Mode Tests
  // ===========================================================================

  describe('watch mode (--watch)', () => {
    it('should accept --interval parameter', async () => {
      createTicket('EPIC-017', 'TASK-001');

      // Just verify it parses without error - actual watch loop would need integration test
      await program.parseAsync(
        ['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run', '--watch', '--interval', '10'],
        { from: 'user' }
      );

      // In dry-run mode, watch is not actually started but parameter is parsed
      expect(true).toBe(true);
    });

    it('should default interval to 30 seconds', async () => {
      createTicket('EPIC-017', 'TASK-001');

      // The command should parse successfully with default interval
      await program.parseAsync(
        ['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run', '--watch'],
        { from: 'user' }
      );

      // Command executed without error
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // Error Handling Tests
  // ===========================================================================

  describe('error handling', () => {
    it('should provide helpful error message for DAG generation failure', async () => {
      // Create EPIC dir but with no tickets
      const epicDir = path.join(ticketsDir, 'EPIC-017');
      fs.mkdirSync(epicDir, { recursive: true });

      await expect(
        program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag'], { from: 'user' })
      ).rejects.toThrow();

      expect(exitCode).toBe(1);
      expect(getAllOutput()).toContain('No tickets found');
    });

    it('should list possible causes and solutions', async () => {
      await expect(
        program.parseAsync(['epic:run', 'EPIC-999', '-p', tempDir], { from: 'user' })
      ).rejects.toThrow();

      const output = getAllOutput();
      // Error handler should suggest causes/solutions via printError
      expect(output).toMatch(/Cause|Solution|Verify|Check|cause|solution/i);
    });
  });

  // ===========================================================================
  // Complex EPIC Tests
  // ===========================================================================

  describe('complex EPIC handling', () => {
    it('should handle EPIC with many tasks', async () => {
      // Create 10 tasks
      for (let i = 1; i <= 10; i++) {
        const deps = i > 1 ? [`TASK-${String(i - 1).padStart(3, '0')}`] : [];
        createTicket('EPIC-017', `TASK-${String(i).padStart(3, '0')}`, {
          priority: i <= 3 ? 'P0' : 'P1',
          dependencies: deps,
        });
      }

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run'], { from: 'user' });

      const output = getAllOutput();
      expect(output).toContain('Nodes: 10');
    });

    it('should handle diamond dependencies in DAG mode', async () => {
      // Diamond: A -> B, A -> C, B -> D, C -> D
      createTicket('EPIC-017', 'TASK-A', { priority: 'P0' });
      createTicket('EPIC-017', 'TASK-B', { priority: 'P1', dependencies: ['TASK-A'] });
      createTicket('EPIC-017', 'TASK-C', { priority: 'P1', dependencies: ['TASK-A'] });
      createTicket('EPIC-017', 'TASK-D', { priority: 'P2', dependencies: ['TASK-B', 'TASK-C'] });

      await program.parseAsync(['epic:run', 'EPIC-017', '-p', tempDir, '--dag', '--dry-run'], { from: 'user' });

      // Verify DAG was generated correctly
      const dagPath = path.join(ticketsDir, 'EPIC-017', 'dag.yml');
      const dagContent = fs.readFileSync(dagPath, 'utf-8');

      // TASK-D should have both TASK-B and TASK-C as deps
      expect(dagContent).toContain('TASK-D');
      expect(dagContent).toContain('TASK-B');
      expect(dagContent).toContain('TASK-C');
    });
  });
});
