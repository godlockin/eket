/**
 * Claim Command Tests (TASK-077)
 * Tests for SQLite claimTask() integration in registerClaim
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Command } from 'commander';

// --- SQLiteManager mock ---
const mockClaimTask = jest.fn<() => Promise<{ success: boolean; data?: boolean; error?: Error }>>()
  .mockResolvedValue({ success: true, data: true });
const mockConnect = jest.fn<() => Promise<{ success: boolean }>>()
  .mockResolvedValue({ success: true });
const mockClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/core/sqlite-manager.js', () => ({
  createSQLiteManager: jest.fn(() => ({
    connect: mockConnect,
    claimTask: mockClaimTask,
    close: mockClose,
  })),
}));

// --- Minimal mocks for claim dependencies ---
jest.unstable_mockModule('../../src/utils/process-cleanup.js', () => ({
  findProjectRoot: jest.fn<() => Promise<string>>().mockResolvedValue('/fake/project'),
}));

jest.unstable_mockModule('../../src/core/instance-registry.js', () => ({
  createInstanceRegistry: jest.fn(() => ({
    connect: jest.fn<() => Promise<{ success: boolean }>>().mockResolvedValue({ success: false }),
    disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getAvailableInstances: jest.fn<() => Promise<{ success: boolean; data: unknown[] }>>().mockResolvedValue({ success: false, data: [] }),
  })),
}));

jest.unstable_mockModule('../../src/core/task-assigner.js', () => ({
  createTaskAssigner: jest.fn(() => ({
    assignTicket: jest.fn(() => ({ assigned: false })),
  })),
}));

jest.unstable_mockModule('../../src/core/role-selector.js', () => ({
  selectRole: jest.fn(() => 'feature_dev'),
  getRulesFileName: jest.fn(() => 'feature_dev_rules.md'),
  getRulesPath: jest.fn(() => '/fake/rules/path'),
}));

jest.unstable_mockModule('../../src/utils/execFileNoThrow.js', () => ({
  execFileNoThrow: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// claim-helpers mock
jest.unstable_mockModule('../../src/commands/claim-helpers.js', () => ({
  loadConfig: jest.fn(() => Promise.resolve({ version: '1.0' })),
  getTickets: jest.fn(() => Promise.resolve([
    { id: 'TASK-099', title: 'Test ticket', priority: 'normal', tags: ['feature'], status: 'ready' },
  ])),
  matchRole: jest.fn(() => Promise.resolve('feature_dev')),
  initializeProfile: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  sendClaimMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));

// fs mock to avoid real filesystem
jest.unstable_mockModule('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn(() => false),
    mkdirSync: jest.fn(),
  };
});

const { registerClaim } = await import('../../src/commands/claim.js');

describe('task:claim — SQLite claimTask() integration', () => {
  let program: Command;
  let consoleOutput: string[];
  let originalConsoleLog: typeof console.log;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({ success: true });
    mockClaimTask.mockResolvedValue({ success: true, data: true });
    mockClose.mockResolvedValue(undefined);

    program = new Command();
    program.exitOverride();
    registerClaim(program);

    consoleOutput = [];
    originalConsoleLog = console.log;
    console.log = (...args: unknown[]) => {
      consoleOutput.push(args.join(' '));
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
  });

  it('should call claimTask when SQLite is available', async () => {
    await program.parseAsync(['node', 'test', 'task:claim', 'TASK-099']);
    expect(mockClaimTask).toHaveBeenCalledWith('TASK-099', expect.any(String));
  });

  it('should abort with error when ticket is already claimed (data=false)', async () => {
    mockClaimTask.mockResolvedValue({ success: true, data: false });

    // process.exit would normally be called; exitOverride handles that
    // We just verify the output contains error indication
    const consoleError: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => { consoleError.push(args.join(' ')); };

    await program.parseAsync(['node', 'test', 'task:claim', 'TASK-099']);

    console.error = origError;

    const allOutput = [...consoleOutput, ...consoleError].join('\n');
    expect(allOutput).toMatch(/抢占|TASK_ALREADY_CLAIMED|already claimed/i);
  });

  it('should fallback gracefully when SQLite connect fails', async () => {
    mockConnect.mockResolvedValue({ success: false });

    // Should not throw, just proceed with filesystem mode
    await expect(
      program.parseAsync(['node', 'test', 'task:claim', 'TASK-099'])
    ).resolves.not.toThrow();

    expect(mockClaimTask).not.toHaveBeenCalled();
  });
});
