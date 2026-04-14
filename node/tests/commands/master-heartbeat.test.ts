/**
 * Tests for master:heartbeat command
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// We test the exported helpers via the module internals; since the module
// is an ES Module transpiled via ts-jest we import directly.
// The command registration is tested by ensuring no build errors occur.

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eket-heartbeat-test-'));
}

function writeFile(dir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(dir, name), content, 'utf-8');
}

function setupProject(root: string): void {
  fs.mkdirSync(path.join(root, 'jira', 'tickets'), { recursive: true });
  fs.mkdirSync(path.join(root, 'inbox', 'human_feedback'), { recursive: true });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('master:heartbeat', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
    setupProject(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Module imports cleanly ─────────────────────────────────────────────────
  it('registers without errors', async () => {
    const mod = await import('../../src/commands/master-heartbeat.js');
    expect(typeof mod.registerMasterHeartbeat).toBe('function');
  });

  // ── No tickets ────────────────────────────────────────────────────────────
  it('handles empty tickets dir', async () => {
    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    // Remove tickets dir to test missing dir
    fs.rmdirSync(path.join(tmpDir, 'jira', 'tickets'));
    const report = generateReport(tmpDir);
    expect(report.taskQueue.total).toBe(0);
    expect(report.progress.doneCount).toBe(0);
    expect(report.health).toBe('GREEN');
  });

  // ── Single P0 ticket ──────────────────────────────────────────────────────
  it('detects P0 ticket in queue', async () => {
    writeFile(
      path.join(tmpDir, 'jira', 'tickets'),
      'TASK-001.md',
      `# TASK-001: 紧急修复

**优先级**: P0
**状态**: ready
**负责人**: 待领取

## 验收标准

- 修复完成且测试通过
`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.taskQueue.p0.length).toBe(1);
    expect(report.taskQueue.p0[0]!.id).toBe('TASK-001');
    expect(report.health).toBe('YELLOW'); // P0 ticket → YELLOW
  });

  // ── Inbox P0 detection ────────────────────────────────────────────────────
  it('detects P0 inbox instruction → RED health', async () => {
    writeFile(
      path.join(tmpDir, 'inbox'),
      'human_input.md',
      `[P0-旨意] 停止所有开发，项目方向调整`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.inbox.p0Instructions.length).toBe(1);
    expect(report.health).toBe('RED');
    expect(report.blockedIssues.requiresImmediateAttention).toBe(true);
  });

  // ── Stale slaver detection ─────────────────────────────────────────────────
  it('detects stale slaver (old mtime)', async () => {
    const ticketPath = path.join(tmpDir, 'jira', 'tickets', 'TASK-002.md');
    writeFile(
      path.join(tmpDir, 'jira', 'tickets'),
      'TASK-002.md',
      `# TASK-002: 开发任务

**优先级**: P1
**状态**: in_progress
**负责人**: slaver_abc

## 验收标准

- 功能实现完整
`
    );

    // Set mtime to 60 minutes ago
    const oldTime = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(ticketPath, oldTime, oldTime);

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.slaverStatus.stale.length).toBe(1);
    expect(report.slaverStatus.stale[0]!.ticketId).toBe('TASK-002');
    expect(report.health).not.toBe('GREEN'); // stale → at least YELLOW
  });

  // ── pr_review waiting ─────────────────────────────────────────────────────
  it('detects tickets waiting on master (pr_review)', async () => {
    writeFile(
      path.join(tmpDir, 'jira', 'tickets'),
      'TASK-003.md',
      `# TASK-003: PR 等待合并

**优先级**: P1
**状态**: pr_review
**负责人**: slaver_xyz

## 验收标准

- PR 通过 CI 检查
`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.slaverStatus.waitingOnMaster.length).toBe(1);
    expect(report.slaverStatus.waitingOnMaster[0]!.id).toBe('TASK-003');
  });

  // ── Blocked ticket (blocked_by) ────────────────────────────────────────────
  it('detects blocked ticket with blocked_by field', async () => {
    writeFile(
      path.join(tmpDir, 'jira', 'tickets'),
      'TASK-004.md',
      `# TASK-004: 依赖任务

**优先级**: P2
**状态**: ready
**负责人**: 待领取

blocked_by:
  - TASK-001
  - TASK-002

## 验收标准

- 功能实现
`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.progress.blockedCount).toBe(1);
    expect(report.blockedIssues.items.length).toBeGreaterThan(0);
    expect(report.blockedIssues.items[0]!.ticketId).toBe('TASK-004');
  });

  // ── Done ticket counted ────────────────────────────────────────────────────
  it('counts done/completed tickets in progress', async () => {
    writeFile(
      path.join(tmpDir, 'jira', 'tickets'),
      'TASK-005.md',
      `# TASK-005: 已完成任务

**优先级**: P1
**状态**: done
**负责人**: slaver_done

## 验收标准

- 完成
`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.progress.doneCount).toBe(1);
  });

  // ── JSON output structure ──────────────────────────────────────────────────
  it('report has required top-level keys', async () => {
    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    const requiredKeys = [
      'timestamp', 'projectRoot', 'taskQueue', 'slaverStatus',
      'progress', 'blockedIssues', 'inbox', 'health',
      'healthReasons', 'recommendations',
    ];
    for (const key of requiredKeys) {
      expect(report).toHaveProperty(key);
    }
  });

  // ── Completion rate ────────────────────────────────────────────────────────
  it('calculates completion rate correctly', async () => {
    const ticketsDir = path.join(tmpDir, 'jira', 'tickets');
    writeFile(ticketsDir, 'T1.md', '# T-001: A\n**状态**: done\n**优先级**: P1\n## 验收标准\n- ok\n');
    writeFile(ticketsDir, 'T2.md', '# T-002: B\n**状态**: done\n**优先级**: P1\n## 验收标准\n- ok\n');
    writeFile(ticketsDir, 'T3.md', '# T-003: C\n**状态**: in_progress\n**优先级**: P1\n## 验收标准\n- ok\n');
    writeFile(ticketsDir, 'T4.md', '# T-004: D\n**状态**: ready\n**优先级**: P1\n## 验收标准\n- ok\n');

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.progress.doneCount).toBe(2);
    expect(report.progress.completionRate).toBe(50); // 2/4 = 50%
  });

  // ── 慢任务检测 ────────────────────────────────────────────────────────────
  it('detects slow task (started > 120 min ago)', async () => {
    const startedAt = new Date(Date.now() - 180 * 60 * 1000).toISOString(); // 3小时前
    writeFile(
      path.join(tmpDir, 'jira', 'tickets'),
      'TASK-SLOW.md',
      `# TASK-SLOW: 慢任务\n\n**优先级**: P1\n**状态**: in_progress\n**负责人**: slaver_x\n**started_at**: ${startedAt}\n\n## 验收标准\n\n- ok\n`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.progress.slowTasks.length).toBe(1);
    expect(report.health).not.toBe('GREEN');
  });

  // ── 平均执行时长 ──────────────────────────────────────────────────────────
  it('calculates avgExecutionMinutes from done tickets', async () => {
    const ticketsDir = path.join(tmpDir, 'jira', 'tickets');
    const start1 = new Date(Date.now() - 60 * 60 * 1000).toISOString();   // 1小时前
    const end1 = new Date().toISOString();                                  // 现在 → 60min
    const start2 = new Date(Date.now() - 120 * 60 * 1000).toISOString();  // 2小时前
    const end2 = new Date().toISOString();                                  // 现在 → 120min
    writeFile(ticketsDir, 'DONE-1.md',
      `# DONE-1: A\n\n**优先级**: P1\n**状态**: done\n**负责人**: slaver_a\n**started_at**: ${start1}\n**completed_at**: ${end1}\n\n## 验收标准\n\n- ok\n`
    );
    writeFile(ticketsDir, 'DONE-2.md',
      `# DONE-2: B\n\n**优先级**: P1\n**状态**: done\n**负责人**: slaver_b\n**started_at**: ${start2}\n**completed_at**: ${end2}\n\n## 验收标准\n\n- ok\n`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.progress.avgExecutionMinutes).not.toBeNull();
    expect(report.progress.avgExecutionMinutes!).toBeCloseTo(90, 0); // avg of 60 and 120
  });

  // ── 缺少时间戳不 crash ─────────────────────────────────────────────────────
  it('handles missing started_at without crashing', async () => {
    writeFile(
      path.join(tmpDir, 'jira', 'tickets'),
      'TASK-NOTIME.md',
      `# TASK-NOTIME: 无时间戳\n\n**优先级**: P2\n**状态**: in_progress\n**负责人**: slaver_z\n\n## 验收标准\n\n- ok\n`
    );

    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    expect(() => generateReport(tmpDir)).not.toThrow();
    const report = generateReport(tmpDir);
    expect(report.progress.slowTasks.length).toBe(0); // 没有 started_at 不算慢任务
  });
});
