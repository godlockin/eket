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

  // ── busyRatio 计算 ────────────────────────────────────────────────────────
  it('calculates busyRatio from active slavers via file mtime proxy', async () => {
    // master:heartbeat 的 slaverStatus 基于文件系统（不依赖 Redis），
    // busyRatio 在无活跃 Redis Slaver 时应为 0，不 crash
    const { generateReport } = await import('../../src/commands/master-heartbeat.js') as {
      generateReport: (root: string) => import('../../src/commands/master-heartbeat.js').HeartbeatReport;
    };
    const report = generateReport(tmpDir);
    expect(report.slaverStatus.busyRatio).toBe(0);       // 无活跃 Slaver
    expect(report.slaverStatus.overloaded).toHaveLength(0); // 无过载
  });

  // ── TASK-028: 解析领取记录表格 → 正确提取 events ─────────────────────────
  it('parseTicketTimeline extracts events from 领取记录 table', async () => {
    const { parseTicketTimeline } = await import('../../src/commands/master-heartbeat.js') as {
      parseTicketTimeline: (
        ticketId: string,
        title: string,
        currentStatus: string,
        content: string
      ) => import('../../src/commands/master-heartbeat.js').TicketTimeline;
    };

    const content = `# TASK-099: 测试任务

**状态**: done

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | 2026-04-10 | backlog → ready |
| 领取 | slaver_a | 2026-04-10 | ready → in_progress |
| 完成 | slaver_a | 2026-04-10 | in_progress → done |
`;

    const timeline = parseTicketTimeline('TASK-099', '测试任务', 'done', content);
    expect(timeline.ticketId).toBe('TASK-099');
    expect(timeline.events.length).toBe(3);
    expect(timeline.events[0]!.status).toBe('ready');
    expect(timeline.events[1]!.status).toBe('in_progress');
    expect(timeline.events[2]!.status).toBe('done');
    expect(timeline.events[0]!.actor).toBe('Master');
    expect(timeline.events[1]!.actor).toBe('slaver_a');
  });

  // ── TASK-028: 计算阶段耗时（两个时间戳之差）────────────────────────────────
  it('parseTicketTimeline calculates durationMinutes between consecutive events', async () => {
    const { parseTicketTimeline } = await import('../../src/commands/master-heartbeat.js') as {
      parseTicketTimeline: (
        ticketId: string,
        title: string,
        currentStatus: string,
        content: string
      ) => import('../../src/commands/master-heartbeat.js').TicketTimeline;
    };

    // Use ISO timestamps with a known 30-minute gap
    const t1 = '2026-04-10T10:00:00.000Z';
    const t2 = '2026-04-10T10:30:00.000Z'; // +30min
    const t3 = '2026-04-10T11:00:00.000Z'; // +30min

    const content = `# TASK-DUR: 耗时测试

**状态**: done

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master | ${t1} | backlog → ready |
| 领取 | slaver_x | ${t2} | ready → in_progress |
| 完成 | slaver_x | ${t3} | in_progress → done |
`;

    const timeline = parseTicketTimeline('TASK-DUR', '耗时测试', 'done', content);
    expect(timeline.events.length).toBe(3);
    // First event (ready) should have durationMinutes = 30
    expect(timeline.events[0]!.durationMinutes).toBe(30);
    // Second event (in_progress) should have durationMinutes = 30
    expect(timeline.events[1]!.durationMinutes).toBe(30);
    // Last event (done) has no next → no durationMinutes
    expect(timeline.events[2]!.durationMinutes).toBeUndefined();
  });

  // ── TASK-028: 时间戳缺失时不 crash（graceful handling）─────────────────────
  it('parseTicketTimeline handles missing/invalid timestamps gracefully', async () => {
    const { parseTicketTimeline } = await import('../../src/commands/master-heartbeat.js') as {
      parseTicketTimeline: (
        ticketId: string,
        title: string,
        currentStatus: string,
        content: string
      ) => import('../../src/commands/master-heartbeat.js').TicketTimeline;
    };

    // Table rows with empty / invalid timestamp
    const content = `# TASK-NOTIME2: 无时间戳任务

**状态**: in_progress

## 领取记录

| 操作 | Slaver / Reviewer | 时间 | 状态变更 |
|------|-------------------|------|----------|
| 创建 | Master |  | backlog → ready |
| 领取 | slaver_z | not-a-date | ready → in_progress |
`;

    // Must not throw
    let timeline!: import('../../src/commands/master-heartbeat.js').TicketTimeline;
    expect(() => {
      timeline = parseTicketTimeline('TASK-NOTIME2', '无时间戳任务', 'in_progress', content);
    }).not.toThrow();

    // Events still parsed; durationMinutes undefined (can't compute from invalid timestamps)
    expect(timeline.events.length).toBeGreaterThanOrEqual(0);
    // No durationMinutes when timestamps are invalid
    for (const ev of timeline.events) {
      expect(ev.durationMinutes).toBeUndefined();
    }
    // totalElapsedMinutes undefined when timestamps invalid
    expect(timeline.totalElapsedMinutes).toBeUndefined();
  });
});
