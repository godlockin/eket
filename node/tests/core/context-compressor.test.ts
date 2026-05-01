/**
 * Tests for ContextCompressor (TASK-117)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ContextCompressor } from '../../src/core/context-compressor.js';

describe('ContextCompressor', () => {
  let tmpDir: string;
  let compressor: ContextCompressor;
  const ticketId = 'TASK-TEST-001';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
    // Pass tmpDir directly as projectRoot override
    compressor = new ContextCompressor(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('compressToSummary creates summary file', async () => {
    const sessionLog = '✅ 完成数据库迁移\n选择 TypeScript 因为类型安全\n遗留问题：性能测试';
    const summaryPath = await compressor.compressToSummary(ticketId, sessionLog);

    expect(fs.existsSync(summaryPath)).toBe(true);
    const content = fs.readFileSync(summaryPath, 'utf-8');
    expect(content).toContain(`# Session Summary: ${ticketId}`);
  });

  test('loadSummary returns null when no file exists', async () => {
    const result = await compressor.loadSummary('TASK-NONEXISTENT');
    expect(result).toBeNull();
  });

  test('loadSummary returns content when file exists', async () => {
    const sessionLog = '✅ 完成模块设计\n决定使用 Redis 因为性能';
    await compressor.compressToSummary(ticketId, sessionLog);

    const result = await compressor.loadSummary(ticketId);
    expect(result).not.toBeNull();
    expect(result).toContain(`# Session Summary: ${ticketId}`);
  });

  test('archiveToMemory creates confluence file', async () => {
    const sessionLog = '决定使用 PostgreSQL 因为事务支持\n选择 REST API 因为团队熟悉';
    await compressor.compressToSummary(ticketId, sessionLog);
    await compressor.archiveToMemory(ticketId);

    const archivePath = path.join(tmpDir, 'confluence', 'memory', 'sessions', `${ticketId}.md`);
    expect(fs.existsSync(archivePath)).toBe(true);
    const content = fs.readFileSync(archivePath, 'utf-8');
    expect(content).toContain(`# Session Archive: ${ticketId}`);
  });

  test('summary format contains all three sections', async () => {
    const sessionLog = [
      '✅ 完成需求分析',
      '完成技术方案',
      '决定采用微服务架构因为可扩展性',
      '选择 Docker 因为部署一致性',
      '遗留问题：监控方案待定',
    ].join('\n');

    const summaryPath = await compressor.compressToSummary(ticketId, sessionLog);
    const content = fs.readFileSync(summaryPath, 'utf-8');

    expect(content).toContain('## 已完成步骤');
    expect(content).toContain('## 关键决策');
    expect(content).toContain('## 遗留问题');
  });

  test('archiveToMemory gracefully handles missing summary', async () => {
    // Should not throw even if no summary exists
    await expect(compressor.archiveToMemory('TASK-NO-SUMMARY')).resolves.not.toThrow();
  });
});
