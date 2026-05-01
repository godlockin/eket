/**
 * Tests for DAG API endpoint parser logic
 */

import { parseTicketFile, parseTicketsDag } from '../../src/core/ticket-dag-parser.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('parseTicketFile', () => {
  it('parses full ticket correctly', () => {
    const content = `# TASK-001: My Feature Title

**Ticket ID**: TASK-001
**状态**: in_progress
**负责人**: backend_dev

**依赖关系**:
- blocks: []
- blocked_by: [TASK-002, TASK-003]
`;
    const { node, blockedBy } = parseTicketFile(content, 'TASK-001');
    expect(node.id).toBe('TASK-001');
    expect(node.label).toBe('My Feature Title');
    expect(node.status).toBe('in_progress');
    expect(node.assignee).toBe('backend_dev');
    expect(blockedBy).toEqual(['TASK-002', 'TASK-003']);
  });

  it('handles empty blocked_by', () => {
    const content = `# TASK-070: YAML DAG 工作流引擎

**状态**: done
**负责人**: slaver_01

**依赖关系**:
- blocked_by: []
`;
    const { node, blockedBy } = parseTicketFile(content, 'TASK-070');
    expect(node.status).toBe('done');
    expect(blockedBy).toEqual([]);
  });

  it('handles 待认领 assignee as undefined', () => {
    const content = `# TASK-073: DAG Dashboard

**状态**: ready
**负责人**: 待认领

- blocked_by: []
`;
    const { node } = parseTicketFile(content, 'TASK-073');
    expect(node.assignee).toBeUndefined();
  });

  it('parses status correctly for all states', () => {
    const states = ['ready', 'in_progress', 'done', 'blocked', 'failed'];
    for (const s of states) {
      const content = `# TASK-X: T\n**状态**: ${s}\n- blocked_by: []\n`;
      const { node } = parseTicketFile(content, 'TASK-X');
      expect(node.status).toBe(s);
    }
  });
});

describe('parseTicketsDag', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eket-dag-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('builds nodes and edges from two tickets', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'TASK-010.md'),
      `# TASK-010: Alpha\n**状态**: done\n**负责人**: dev_a\n- blocked_by: []\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'TASK-011.md'),
      `# TASK-011: Beta\n**状态**: in_progress\n**负责人**: dev_b\n- blocked_by: [TASK-010]\n`
    );

    const dag = parseTicketsDag(tmpDir);

    expect(dag.nodes).toHaveLength(2);
    const ids = dag.nodes.map((n) => n.id);
    expect(ids).toContain('TASK-010');
    expect(ids).toContain('TASK-011');

    expect(dag.edges).toHaveLength(1);
    expect(dag.edges[0]).toEqual({ source: 'TASK-011', target: 'TASK-010' });
  });

  it('ignores non-TASK files', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# readme');
    fs.writeFileSync(path.join(tmpDir, 'TASK-020.md'), `# TASK-020: X\n**状态**: ready\n- blocked_by: []\n`);

    const dag = parseTicketsDag(tmpDir);
    expect(dag.nodes).toHaveLength(1);
    expect(dag.nodes[0].id).toBe('TASK-020');
  });

  it('returns empty dag for empty dir', () => {
    const dag = parseTicketsDag(tmpDir);
    expect(dag.nodes).toHaveLength(0);
    expect(dag.edges).toHaveLength(0);
  });

  it('nodes are sorted by id', () => {
    fs.writeFileSync(path.join(tmpDir, 'TASK-030.md'), `# TASK-030: C\n**状态**: ready\n- blocked_by: []\n`);
    fs.writeFileSync(path.join(tmpDir, 'TASK-020.md'), `# TASK-020: A\n**状态**: done\n- blocked_by: []\n`);
    fs.writeFileSync(path.join(tmpDir, 'TASK-025.md'), `# TASK-025: B\n**状态**: in_progress\n- blocked_by: []\n`);

    const dag = parseTicketsDag(tmpDir);
    expect(dag.nodes.map((n) => n.id)).toEqual(['TASK-020', 'TASK-025', 'TASK-030']);
  });
});
