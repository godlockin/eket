/**
 * TASK-064: resumeWithFallback 降级策略测试
 */
import { jest } from '@jest/globals';

const mockDeleteCheckpoint = jest.fn().mockResolvedValue({ success: true, data: undefined });
const mockConnect = jest.fn().mockResolvedValue({ success: true, data: undefined });
const mockClose = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/core/sqlite-manager.js', () => ({
  createSQLiteManager: () => ({
    connect: mockConnect,
    close: mockClose,
    deleteCheckpoint: mockDeleteCheckpoint,
  }),
}));

const { resumeWithFallback } = await import('../../src/commands/task-resume.js');

describe('resumeWithFallback', () => {
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('should fall back when sessionId is undefined', async () => {
    await resumeWithFallback({ ticketId: 'TASK-064', slaverId: 'slaver_1', sessionId: undefined });

    expect(warnSpy).toHaveBeenCalledWith('WARN: session resume failed, falling back to fresh session');
    expect(mockDeleteCheckpoint).toHaveBeenCalledWith('TASK-064', 'slaver_1');
  });

  it('should fall back when sessionId is empty string', async () => {
    await resumeWithFallback({ ticketId: 'TASK-064', slaverId: 'slaver_1', sessionId: '' });

    expect(warnSpy).toHaveBeenCalledWith('WARN: session resume failed, falling back to fresh session');
    expect(mockDeleteCheckpoint).toHaveBeenCalledWith('TASK-064', 'slaver_1');
  });

  it('should fall back when attemptResume throws session error', async () => {
    const mockResume = jest.fn().mockRejectedValueOnce(new Error('session expired'));

    await resumeWithFallback(
      { ticketId: 'TASK-064', slaverId: 'slaver_1', sessionId: 'sess_abc123' },
      mockResume
    );

    expect(warnSpy).toHaveBeenCalledWith('WARN: session resume failed, falling back to fresh session');
    expect(mockDeleteCheckpoint).toHaveBeenCalledWith('TASK-064', 'slaver_1');
  });

  it('should fall back when error contains "not found"', async () => {
    const mockResume = jest.fn().mockRejectedValueOnce(new Error('session not found'));

    await resumeWithFallback(
      { ticketId: 'TASK-064', slaverId: 'slaver_2', sessionId: 'sess_xyz' },
      mockResume
    );

    expect(mockDeleteCheckpoint).toHaveBeenCalledWith('TASK-064', 'slaver_2');
  });

  it('should NOT fall back when non-session error thrown — re-throws', async () => {
    const mockResume = jest.fn().mockRejectedValueOnce(new Error('network timeout'));

    await expect(
      resumeWithFallback(
        { ticketId: 'TASK-064', slaverId: 'slaver_1', sessionId: 'sess_abc123' },
        mockResume
      )
    ).rejects.toThrow('network timeout');

    expect(mockDeleteCheckpoint).not.toHaveBeenCalled();
  });
});
