/**
 * TASK-268: syncToSqlite 单元测试
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import Database from 'better-sqlite3';

import { parseTicketMdForSync, syncToSqlite } from '../../src/commands/ticket-index.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'eket-test-'));
}

function writeTicket(dir: string, filename: string, content: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
}

// ── parseTicketMdForSync ───────────────────────────────────────────────────

describe('parseTicketMdForSync', () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('解析中文字段格式（**状态**: done）', () => {
    const content = `# TASK-001: 测试任务

## 元数据

- **Ticket ID**: TASK-001
- **标题**: 实现功能 A
- **状态**: done
- **优先级**: P1
- **类型**: feature
`;
    writeTicket(tmp, 'TASK-001.md', content);
    const result = parseTicketMdForSync(path.join(tmp, 'TASK-001.md'));
    expect(result).not.toBeNull();
    expect(result!.id).toBe('TASK-001');
    expect(result!.status).toBe('done');
    expect(result!.title).toBe('实现功能 A');
    expect(result!.priority).toBe('P1');
    expect(result!.ticketType).toBe('feature');
  });

  it('解析 frontmatter 格式（status: in_progress）', () => {
    const content = `---
status: in_progress
priority: P2
type: bugfix
---
# TASK-002: 修复 Bug B
`;
    writeTicket(tmp, 'TASK-002.md', content);
    const result = parseTicketMdForSync(path.join(tmp, 'TASK-002.md'));
    expect(result).not.toBeNull();
    expect(result!.id).toBe('TASK-002');
    expect(result!.status).toBe('in_progress');
    expect(result!.priority).toBe('P2');
    expect(result!.ticketType).toBe('bugfix');
  });

  it('中文字段优先于 frontmatter', () => {
    const content = `---
status: todo
---
- **状态**: done
- **标题**: 标题优先测试
- **优先级**: P0
`;
    writeTicket(tmp, 'TASK-003.md', content);
    const result = parseTicketMdForSync(path.join(tmp, 'TASK-003.md'));
    expect(result!.status).toBe('done');
  });

  it('非 TASK- 文件名返回 null', () => {
    writeTicket(tmp, 'README.md', '# readme');
    const result = parseTicketMdForSync(path.join(tmp, 'README.md'));
    expect(result).toBeNull();
  });

  it('status 别名归一化（完成 → done）', () => {
    const content = `- **状态**: 完成\n- **标题**: 别名测试\n`;
    writeTicket(tmp, 'TASK-004.md', content);
    const result = parseTicketMdForSync(path.join(tmp, 'TASK-004.md'));
    expect(result!.status).toBe('done');
  });
});

// ── syncToSqlite ───────────────────────────────────────────────────────────

describe('syncToSqlite', () => {
  let tmpProject: string;
  let jiraDir: string;
  let ticketsDir: string;
  let dbPath: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpProject = makeTmpDir();
    jiraDir = path.join(tmpProject, 'jira');
    ticketsDir = path.join(jiraDir, 'tickets');
    dbPath = path.join(tmpProject, '.eket', 'eket.db');
    fs.mkdirSync(ticketsDir, { recursive: true });
    // Set cwd so syncToSqlite resolves .eket/eket.db correctly
    process.chdir(tmpProject);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tmpProject, { recursive: true, force: true });
  });

  it('写入多条 ticket 到 ticket_index 表', async () => {
    writeTicket(ticketsDir, 'TASK-100.md', `- **Ticket ID**: TASK-100\n- **标题**: T100\n- **状态**: done\n- **优先级**: P1\n- **类型**: task\n`);
    writeTicket(ticketsDir, 'TASK-101.md', `- **Ticket ID**: TASK-101\n- **标题**: T101\n- **状态**: todo\n- **优先级**: P2\n`);

    const result = await syncToSqlite(jiraDir);
    expect(result.success).toBe(true);

    const db = new Database(dbPath);
    const rows = db.prepare('SELECT * FROM ticket_index ORDER BY id').all() as Array<{
      id: string; status: string; title: string; priority: string; ticket_type: string | null;
    }>;
    db.close();

    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe('TASK-100');
    expect(rows[0].status).toBe('done');
    expect(rows[0].title).toBe('T100');
    expect(rows[0].priority).toBe('P1');
    expect(rows[0].ticket_type).toBe('task');
    expect(rows[1].id).toBe('TASK-101');
    expect(rows[1].status).toBe('todo');
  });

  it('排除 archive 子目录下的文件', async () => {
    writeTicket(ticketsDir, 'TASK-200.md', `- **Ticket ID**: TASK-200\n- **标题**: 正常\n- **状态**: done\n`);
    const archiveDir = path.join(ticketsDir, 'archive');
    writeTicket(archiveDir, 'TASK-999.md', `- **Ticket ID**: TASK-999\n- **标题**: 归档\n- **状态**: done\n`);

    const result = await syncToSqlite(jiraDir);
    expect(result.success).toBe(true);

    const db = new Database(dbPath);
    const rows = db.prepare('SELECT id FROM ticket_index').all() as Array<{ id: string }>;
    db.close();

    const ids = rows.map(r => r.id);
    expect(ids).toContain('TASK-200');
    expect(ids).not.toContain('TASK-999');
  });

  it('INSERT OR REPLACE 更新已有记录', async () => {
    writeTicket(ticketsDir, 'TASK-300.md', `- **标题**: 初始\n- **状态**: todo\n- **优先级**: P2\n`);
    await syncToSqlite(jiraDir);

    // 更新文件内容
    writeTicket(ticketsDir, 'TASK-300.md', `- **标题**: 更新后\n- **状态**: done\n- **优先级**: P1\n`);
    const result = await syncToSqlite(jiraDir);
    expect(result.success).toBe(true);

    const db = new Database(dbPath);
    const row = db.prepare('SELECT * FROM ticket_index WHERE id = ?').get('TASK-300') as {
      status: string; title: string;
    } | undefined;
    db.close();

    expect(row).toBeDefined();
    expect(row!.status).toBe('done');
    expect(row!.title).toBe('更新后');
  });

  it('jira/tickets 不存在时返回 failure', async () => {
    fs.rmSync(ticketsDir, { recursive: true, force: true });
    const result = await syncToSqlite(jiraDir);
    expect(result.success).toBe(false);
  });
});
