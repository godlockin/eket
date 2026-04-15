/**
 * Task Resume Command Tests
 * Tests for registerTaskResume
 *
 * Mocks SQLiteManager to avoid real DB dependency.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Command } from 'commander';

// Must set up mocks before dynamic imports in ESM
const mockGet = jest.fn<() => Promise<{ success: boolean; data: unknown }>>().mockResolvedValue({
  success: true,
  data: null,
});
const mockConnect = jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({
  success: true,
});
const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/core/sqlite-manager.js', () => ({
  createSQLiteManager: jest.fn(() => ({
    connect: mockConnect,
    get: mockGet,
    close: mockClose,
  })),
}));

// Mock process-cleanup to avoid fs scanning real filesystem
jest.unstable_mockModule('../../src/utils/process-cleanup.js', () => ({
  findProjectRoot: jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
}));

// Dynamic import AFTER mock setup
const { registerTaskResume } = await import('../../src/commands/task-resume.js');

describe('task:resume command', () => {
  let program: Command;
  let consoleOutput: string[];
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({ success: true });
    mockGet.mockResolvedValue({ success: true, data: null });
    mockClose.mockResolvedValue(undefined);

    program = new Command();
    program.exitOverride(); // Prevent process.exit in tests

    registerTaskResume(program);

    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.join(' '));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  describe('when no checkpoint found', () => {
    it('should suggest task:claim when no checkpoint exists', async () => {
      mockGet.mockResolvedValue({ success: true, data: null });

      await program.parseAsync(['node', 'test', 'task:resume', '--slaver', 'slaver_1']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('task:claim');
    });

    it('should mention the slaver ID in output', async () => {
      mockGet.mockResolvedValue({ success: true, data: null });

      await program.parseAsync(['node', 'test', 'task:resume', '--slaver', 'my_slaver_42']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('my_slaver_42');
    });
  });

  describe('when checkpoint found', () => {
    const mockCheckpoint = {
      ticket_id: 'TASK-028',
      slaver_id: 'slaver_1',
      phase: 'implement',
      state_json: JSON.stringify({
        filesChanged: ['src/foo.ts', 'src/bar.ts'],
        lastAction: 'wrote function',
        notes: 'halfway done',
        savedAt: '2026-04-15T10:00:00Z',
      }),
      created_at: '2026-04-15T10:00:00Z',
    };

    it('should display ticket and phase from checkpoint', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockCheckpoint });

      await program.parseAsync(['node', 'test', 'task:resume', '--slaver', 'slaver_1']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('TASK-028');
      expect(output).toContain('implement');
    });

    it('should include resume action suggestion', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockCheckpoint });

      await program.parseAsync(['node', 'test', 'task:resume', '--slaver', 'slaver_1']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('TASK-028');
      // Should suggest resuming from the phase
      expect(output).toContain('implement');
    });

    it('should display files changed from state_json', async () => {
      mockGet.mockResolvedValue({ success: true, data: mockCheckpoint });

      await program.parseAsync(['node', 'test', 'task:resume', '--slaver', 'slaver_1']);

      const output = consoleOutput.join('\n');
      expect(output).toContain('src/foo.ts');
    });
  });

  describe('when SQLite unavailable', () => {
    it('should handle SQLite connect failure gracefully', async () => {
      mockConnect.mockResolvedValue({ success: false, error: new Error('DB unavailable') });

      // Should not throw
      await expect(
        program.parseAsync(['node', 'test', 'task:resume', '--slaver', 'slaver_x'])
      ).resolves.not.toThrow();

      const output = consoleOutput.join('\n');
      expect(output).toContain('task:claim');
    });
  });
});
