/**
 * Fact-Forcing Gate 单元测试
 *
 * 测试覆盖：
 * - SessionTracker 会话追踪
 * - 写操作前读取检查
 * - 删除操作前 grep 检查
 * - 环境变量禁用
 * - 路径规范化
 * - 命令模式识别
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  SessionTracker,
  SESSION_TTL_MS,
  checkFactForcing,
  extractFilePath,
  isDeleteCommand,
  isGrepCommand,
  extractDeleteTarget,
  extractGrepPattern,
  createFactForcingNode,
  type FactForcingConfig,
  type FactForcingState,
} from '../../../src/hooks/pre-tool-use/fact-forcing-gate.js';

describe('Fact-Forcing Gate', () => {
  let tracker: SessionTracker;
  let config: Required<FactForcingConfig>;
  const sessionId = 'test-session-001';

  beforeEach(() => {
    tracker = new SessionTracker();
    config = {
      enabled: true,
      writeTools: ['Edit', 'Write', 'NotebookEdit'],
      deleteTools: ['Bash'],
      readTools: ['Read'],
      grepTools: ['Bash'],
    };
    // 确保环境变量未设置
    delete process.env.EKET_FACT_FORCING;
  });

  afterEach(() => {
    delete process.env.EKET_FACT_FORCING;
  });

  describe('SessionTracker', () => {
    it('should record and check file reads', () => {
      tracker.recordRead(sessionId, '/path/to/file.ts');

      expect(tracker.hasRead(sessionId, '/path/to/file.ts')).toBe(true);
      expect(tracker.hasRead(sessionId, '/path/to/other.ts')).toBe(false);
    });

    it('should normalize paths with leading ./', () => {
      tracker.recordRead(sessionId, './src/index.ts');

      expect(tracker.hasRead(sessionId, 'src/index.ts')).toBe(true);
      expect(tracker.hasRead(sessionId, './src/index.ts')).toBe(true);
    });

    it('should normalize Windows path separators', () => {
      tracker.recordRead(sessionId, 'src\\utils\\helper.ts');

      expect(tracker.hasRead(sessionId, 'src/utils/helper.ts')).toBe(true);
    });

    it('should record and check grep patterns', () => {
      tracker.recordGrep(sessionId, 'functionName');

      expect(tracker.hasGrepped(sessionId)).toBe(true);
    });

    it('should return false for hasGrepped when no grep recorded', () => {
      expect(tracker.hasGrepped(sessionId)).toBe(false);
    });

    it('should return list of read files', () => {
      tracker.recordRead(sessionId, 'file1.ts');
      tracker.recordRead(sessionId, 'file2.ts');

      const files = tracker.getReadFiles(sessionId);
      expect(files).toContain('file1.ts');
      expect(files).toContain('file2.ts');
      expect(files).toHaveLength(2);
    });

    it('should return list of grep patterns', () => {
      tracker.recordGrep(sessionId, 'pattern1');
      tracker.recordGrep(sessionId, 'pattern2');

      const patterns = tracker.getGrepPatterns(sessionId);
      expect(patterns).toContain('pattern1');
      expect(patterns).toContain('pattern2');
      expect(patterns).toHaveLength(2);
    });

    it('should clear session data', () => {
      tracker.recordRead(sessionId, 'file.ts');
      tracker.recordGrep(sessionId, 'pattern');
      tracker.clearSession(sessionId);

      expect(tracker.hasRead(sessionId, 'file.ts')).toBe(false);
      expect(tracker.hasGrepped(sessionId)).toBe(false);
    });

    it('should isolate sessions', () => {
      tracker.recordRead('session-1', 'file1.ts');
      tracker.recordRead('session-2', 'file2.ts');

      expect(tracker.hasRead('session-1', 'file1.ts')).toBe(true);
      expect(tracker.hasRead('session-1', 'file2.ts')).toBe(false);
      expect(tracker.hasRead('session-2', 'file2.ts')).toBe(true);
      expect(tracker.hasRead('session-2', 'file1.ts')).toBe(false);
    });

    describe('TTL and memory management', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should have default TTL of 30 minutes', () => {
        expect(SESSION_TTL_MS).toBe(30 * 60 * 1000);
      });

      it('should accept custom TTL via constructor', () => {
        const shortTtlTracker = new SessionTracker(1000); // 1 second
        shortTtlTracker.recordRead('session', 'file.ts');
        expect(shortTtlTracker.hasRead('session', 'file.ts')).toBe(true);

        jest.advanceTimersByTime(1001);
        // Next access triggers cleanup
        expect(shortTtlTracker.hasRead('session', 'file.ts')).toBe(false);
      });

      it('should cleanup expired sessions on access', () => {
        const shortTtlTracker = new SessionTracker(100); // 100ms
        shortTtlTracker.recordRead('old-session', 'old-file.ts');

        expect(shortTtlTracker.getSessionCount()).toBe(1);

        jest.advanceTimersByTime(150); // Exceed TTL
        // Access creates new session and triggers cleanup
        shortTtlTracker.recordRead('new-session', 'new-file.ts');

        expect(shortTtlTracker.getSessionCount()).toBe(1);
        expect(shortTtlTracker.hasRead('old-session', 'old-file.ts')).toBe(false);
        expect(shortTtlTracker.hasRead('new-session', 'new-file.ts')).toBe(true);
      });

      it('should refresh lastAccess on each access', () => {
        const shortTtlTracker = new SessionTracker(100);
        shortTtlTracker.recordRead('session', 'file1.ts');

        jest.advanceTimersByTime(50); // 50ms elapsed
        // Access refreshes lastAccess
        shortTtlTracker.recordRead('session', 'file2.ts');

        jest.advanceTimersByTime(60); // 60ms more (110ms total from start, but only 60ms from last access)
        // Should still be valid because lastAccess was refreshed
        expect(shortTtlTracker.hasRead('session', 'file1.ts')).toBe(true);
        expect(shortTtlTracker.hasRead('session', 'file2.ts')).toBe(true);
      });

      it('should return correct session count', () => {
        tracker.recordRead('session-1', 'file.ts');
        tracker.recordRead('session-2', 'file.ts');
        tracker.recordRead('session-3', 'file.ts');

        expect(tracker.getSessionCount()).toBe(3);
      });

      it('should clear all sessions', () => {
        tracker.recordRead('session-1', 'file.ts');
        tracker.recordRead('session-2', 'file.ts');
        expect(tracker.getSessionCount()).toBe(2);

        tracker.clearAllSessions();
        expect(tracker.getSessionCount()).toBe(0);
        expect(tracker.hasRead('session-1', 'file.ts')).toBe(false);
        expect(tracker.hasRead('session-2', 'file.ts')).toBe(false);
      });

      it('should not expire active sessions', () => {
        const shortTtlTracker = new SessionTracker(100);
        shortTtlTracker.recordRead('active', 'file.ts');
        shortTtlTracker.recordRead('inactive', 'file.ts');

        jest.advanceTimersByTime(80); // Not expired yet
        // Keep 'active' alive
        shortTtlTracker.hasRead('active', 'file.ts');

        jest.advanceTimersByTime(50); // 130ms total - inactive should expire

        // Trigger cleanup
        shortTtlTracker.recordRead('new', 'file.ts');

        expect(shortTtlTracker.hasRead('active', 'file.ts')).toBe(true);
        // inactive expired (130ms since last access > 100ms TTL)
        // Note: We need another session to check inactive
        expect(shortTtlTracker.getSessionCount()).toBe(2); // active + new
      });
    });

    describe('path normalization edge cases', () => {
      it('should normalize paths with ../', () => {
        tracker.recordRead(sessionId, 'src/../src/utils/helper.ts');
        expect(tracker.hasRead(sessionId, 'src/utils/helper.ts')).toBe(true);
      });

      it('should normalize paths with double slashes', () => {
        tracker.recordRead(sessionId, 'src//utils//helper.ts');
        expect(tracker.hasRead(sessionId, 'src/utils/helper.ts')).toBe(true);
      });

      it('should normalize paths with trailing slash', () => {
        tracker.recordRead(sessionId, 'src/utils/');
        expect(tracker.hasRead(sessionId, 'src/utils')).toBe(true);
      });

      it('should normalize complex paths', () => {
        tracker.recordRead(sessionId, './foo/../bar//baz/');
        expect(tracker.hasRead(sessionId, 'bar/baz')).toBe(true);
      });
    });
  });

  describe('extractFilePath', () => {
    it('should extract file_path', () => {
      expect(extractFilePath({ file_path: '/path/to/file.ts' })).toBe('/path/to/file.ts');
    });

    it('should extract filePath (camelCase)', () => {
      expect(extractFilePath({ filePath: '/path/to/file.ts' })).toBe('/path/to/file.ts');
    });

    it('should extract path', () => {
      expect(extractFilePath({ path: '/path/to/file.ts' })).toBe('/path/to/file.ts');
    });

    it('should extract notebook_path', () => {
      expect(extractFilePath({ notebook_path: '/path/to/notebook.ipynb' })).toBe(
        '/path/to/notebook.ipynb'
      );
    });

    it('should return null for missing path', () => {
      expect(extractFilePath({ command: 'ls' })).toBeNull();
    });

    it('should return null for empty path', () => {
      expect(extractFilePath({ file_path: '' })).toBeNull();
    });
  });

  describe('isDeleteCommand', () => {
    it('should detect rm command', () => {
      expect(isDeleteCommand('rm file.txt')).toBe(true);
      expect(isDeleteCommand('rm -f file.txt')).toBe(true);
      expect(isDeleteCommand('rm -rf /path/to/dir')).toBe(true);
    });

    it('should detect unlink command', () => {
      expect(isDeleteCommand('unlink file.txt')).toBe(true);
    });

    it('should detect rmdir command', () => {
      expect(isDeleteCommand('rmdir empty-dir')).toBe(true);
    });

    it('should not detect non-delete commands', () => {
      expect(isDeleteCommand('ls -la')).toBe(false);
      expect(isDeleteCommand('cat file.txt')).toBe(false);
      expect(isDeleteCommand('echo "rm test"')).toBe(false); // rm inside quotes shouldn't match
    });
  });

  describe('isGrepCommand', () => {
    it('should detect grep command', () => {
      expect(isGrepCommand('grep pattern file.txt')).toBe(true);
      expect(isGrepCommand('grep -r pattern .')).toBe(true);
    });

    it('should detect rg (ripgrep) command', () => {
      expect(isGrepCommand('rg pattern')).toBe(true);
    });

    it('should detect ag (silver searcher) command', () => {
      expect(isGrepCommand('ag pattern')).toBe(true);
    });

    it('should detect ack command', () => {
      expect(isGrepCommand('ack pattern')).toBe(true);
    });

    it('should detect find with grep', () => {
      expect(isGrepCommand('find . -name "*.ts"')).toBe(true);
      expect(isGrepCommand('find . -exec grep pattern {} \\;')).toBe(true);
    });

    it('should not detect non-grep commands', () => {
      expect(isGrepCommand('cat file.txt')).toBe(false);
      expect(isGrepCommand('echo "grep test"')).toBe(false);
    });
  });

  describe('extractDeleteTarget', () => {
    it('should extract target from rm command', () => {
      expect(extractDeleteTarget('rm file.txt')).toBe('file.txt');
      expect(extractDeleteTarget('rm -f file.txt')).toBe('file.txt');
      expect(extractDeleteTarget('rm -rf /path/to/dir')).toBe('/path/to/dir');
    });

    it('should extract target from unlink command', () => {
      expect(extractDeleteTarget('unlink file.txt')).toBe('file.txt');
    });

    it('should return null for non-delete commands', () => {
      expect(extractDeleteTarget('ls -la')).toBeNull();
    });
  });

  describe('extractGrepPattern', () => {
    it('should extract pattern from grep command', () => {
      expect(extractGrepPattern('grep pattern file.txt')).toBe('pattern');
      expect(extractGrepPattern('grep -r "pattern" .')).toBe('pattern');
    });

    it('should extract pattern from rg command', () => {
      expect(extractGrepPattern('rg pattern')).toBe('pattern');
    });

    it('should return null for non-grep commands', () => {
      expect(extractGrepPattern('ls -la')).toBeNull();
    });
  });

  describe('checkFactForcing', () => {
    describe('Read operations', () => {
      it('should record reads and always pass', () => {
        const result = checkFactForcing(
          'Read',
          { file_path: '/path/to/file.ts' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(true);
        expect(tracker.hasRead(sessionId, '/path/to/file.ts')).toBe(true);
      });
    });

    describe('Write operations', () => {
      it('should block Edit without prior Read', () => {
        const result = checkFactForcing(
          'Edit',
          { file_path: '/path/to/file.ts', old_string: 'a', new_string: 'b' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Cannot Edit file');
        expect(result.requiredAction).toContain('Use Read tool');
      });

      it('should allow Edit after Read', () => {
        // First read the file
        checkFactForcing('Read', { file_path: '/path/to/file.ts' }, sessionId, tracker, config);

        // Then edit should pass
        const result = checkFactForcing(
          'Edit',
          { file_path: '/path/to/file.ts', old_string: 'a', new_string: 'b' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(true);
      });

      it('should block Write without prior Read', () => {
        const result = checkFactForcing(
          'Write',
          { file_path: '/path/to/file.ts', content: 'new content' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Cannot Write file');
      });

      it('should allow Write after Read', () => {
        checkFactForcing('Read', { file_path: '/path/to/file.ts' }, sessionId, tracker, config);

        const result = checkFactForcing(
          'Write',
          { file_path: '/path/to/file.ts', content: 'new content' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(true);
      });

      it('should block NotebookEdit without prior Read', () => {
        const result = checkFactForcing(
          'NotebookEdit',
          { notebook_path: '/path/to/notebook.ipynb', new_source: 'code' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(false);
      });
    });

    describe('Delete operations', () => {
      it('should block rm without prior grep', () => {
        const result = checkFactForcing(
          'Bash',
          { command: 'rm -rf /path/to/file.ts' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(false);
        expect(result.reason).toContain('Cannot delete');
        expect(result.requiredAction).toContain('grep');
      });

      it('should allow rm after grep', () => {
        // First grep
        checkFactForcing(
          'Bash',
          { command: 'grep -r "pattern" .' },
          sessionId,
          tracker,
          config
        );

        // Then delete should pass
        const result = checkFactForcing(
          'Bash',
          { command: 'rm -rf /path/to/file.ts' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(true);
      });

      it('should allow non-delete Bash commands without grep', () => {
        const result = checkFactForcing(
          'Bash',
          { command: 'ls -la' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(true);
      });
    });

    describe('Environment variable disable', () => {
      it('should bypass checks when EKET_FACT_FORCING=off', () => {
        process.env.EKET_FACT_FORCING = 'off';

        // Edit without read should pass when disabled
        const result = checkFactForcing(
          'Edit',
          { file_path: '/path/to/file.ts' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(true);
      });

      it('should enforce checks when EKET_FACT_FORCING is not off', () => {
        process.env.EKET_FACT_FORCING = 'on';

        const result = checkFactForcing(
          'Edit',
          { file_path: '/path/to/file.ts' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(false);
      });
    });

    describe('Config enabled flag', () => {
      it('should bypass checks when config.enabled=false', () => {
        config.enabled = false;

        const result = checkFactForcing(
          'Edit',
          { file_path: '/path/to/file.ts' },
          sessionId,
          tracker,
          config
        );

        expect(result.passed).toBe(true);
      });
    });
  });

  describe('createFactForcingNode', () => {
    it('should create a middleware node', () => {
      const node = createFactForcingNode();

      expect(node.id).toBe('FactForcingGate');
      expect(node.deps).toEqual([]);
      expect(node.parallel).toBe(true);
      expect(node.failBehavior).toBe('block');
      expect(typeof node.handle).toBe('function');
    });

    it('should handle state and return gateResult', async () => {
      const node = createFactForcingNode();

      const initialState: FactForcingState = {
        toolName: 'Read',
        toolInput: { file_path: '/path/to/file.ts' },
        sessionId: 'test-node-session',
      };

      const result = await node.handle(initialState);

      expect(result.gateResult?.passed).toBe(true);
    });

    it('should return deny response when check fails', async () => {
      const node = createFactForcingNode();

      const initialState: FactForcingState = {
        toolName: 'Edit',
        toolInput: { file_path: '/path/to/file.ts' },
        sessionId: 'test-node-session-2',
      };

      const result = await node.handle(initialState);

      expect(result.gateResult?.passed).toBe(false);
      expect((result as { response?: { action: string } }).response?.action).toBe('deny');
    });

    it('should accept custom config', async () => {
      const node = createFactForcingNode({ enabled: false });

      const initialState: FactForcingState = {
        toolName: 'Edit',
        toolInput: { file_path: '/path/to/file.ts' },
        sessionId: 'test-node-session-3',
      };

      const result = await node.handle(initialState);

      expect(result.gateResult?.passed).toBe(true);
    });
  });
});
