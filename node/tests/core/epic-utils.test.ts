/**
 * Unit tests for epic-utils.ts (TASK-644)
 *
 * Tests shared EPIC utility functions:
 *   - findEpicTickets()
 *   - parseTicketFile()
 *   - topologicalSort()
 *   - generateDagYaml()
 *   - analyzeComplexity()
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import {
  findEpicTickets,
  parseTicketFile,
  topologicalSort,
  generateDagYaml,
  analyzeComplexity,
  generateDAGConfig,
  dagConfigToYaml,
  formatComplexityReport,
  THRESHOLDS,
  WEIGHTS,
  DAG_THRESHOLD,
  type EpicTicket,
} from '../../src/core/epic-utils.js';

describe('epic-utils', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'epic-utils-test-'));
    fs.mkdirSync(path.join(tempDir, 'jira', 'tickets'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ===========================================================================
  // parseTicketFile tests
  // ===========================================================================

  describe('parseTicketFile', () => {
    it('should parse a valid ticket file', () => {
      const ticketPath = path.join(tempDir, 'TASK-001.md');
      fs.writeFileSync(ticketPath, `# TASK-001: Test Task

**Status**: ready
**Priority**: P1
**Blocked By**: TASK-002, TASK-003
**EPIC**: EPIC-017

## Description
Test description
`);

      const ticket = parseTicketFile(ticketPath);

      expect(ticket).not.toBeNull();
      expect(ticket?.id).toBe('TASK-001');
      expect(ticket?.title).toBe('Test Task');
      expect(ticket?.status).toBe('ready');
      expect(ticket?.priority).toBe('P1');
      expect(ticket?.dependencies).toEqual(['TASK-002', 'TASK-003']);
    });

    it('should handle Chinese status and priority', () => {
      const ticketPath = path.join(tempDir, 'TASK-002.md');
      fs.writeFileSync(ticketPath, `# TASK-002: Chinese Test

**状态**: backlog
**优先级**: P0
**依赖**: TASK-001

## 描述
中文描述
`);

      const ticket = parseTicketFile(ticketPath);

      expect(ticket).not.toBeNull();
      expect(ticket?.status).toBe('backlog');
      expect(ticket?.priority).toBe('P0');
      expect(ticket?.dependencies).toEqual(['TASK-001']);
    });

    it('should extract relativeModule from content', () => {
      const ticketPath = path.join(tempDir, 'TASK-003.md');
      fs.writeFileSync(ticketPath, `# TASK-003: Module Test

**Status**: done

## Files
- node/src/core/test.ts
`);

      const ticket = parseTicketFile(ticketPath);

      expect(ticket).not.toBeNull();
      expect(ticket?.relativeModule).toBe('node/src');
    });

    it('should return null for non-existent file', () => {
      const ticket = parseTicketFile('/nonexistent/TASK-999.md');
      expect(ticket).toBeNull();
    });

    it('should handle backticks in status', () => {
      const ticketPath = path.join(tempDir, 'TASK-004.md');
      fs.writeFileSync(ticketPath, `# TASK-004

**Status**: \`done\`
**Priority**: \`P2\`
`);

      const ticket = parseTicketFile(ticketPath);

      expect(ticket?.status).toBe('done');
      expect(ticket?.priority).toBe('P2');
    });
  });

  // ===========================================================================
  // findEpicTickets tests
  // ===========================================================================

  describe('findEpicTickets', () => {
    it('should find tickets in EPIC folder', async () => {
      const epicDir = path.join(tempDir, 'jira', 'tickets', 'EPIC-017');
      fs.mkdirSync(epicDir, { recursive: true });

      fs.writeFileSync(path.join(epicDir, 'TASK-001.md'), `# TASK-001
**Status**: ready
**Priority**: P1
`);
      fs.writeFileSync(path.join(epicDir, 'TASK-002.md'), `# TASK-002
**Status**: backlog
**Priority**: P2
`);

      const tickets = await findEpicTickets('EPIC-017', tempDir);

      expect(tickets.length).toBe(2);
      expect(tickets.map(t => t.id).sort()).toEqual(['TASK-001', 'TASK-002']);
    });

    it('should find tickets in root with EPIC reference', async () => {
      const ticketsDir = path.join(tempDir, 'jira', 'tickets');

      fs.writeFileSync(path.join(ticketsDir, 'TASK-010.md'), `# TASK-010
**Status**: ready
**EPIC**: EPIC-007
`);
      fs.writeFileSync(path.join(ticketsDir, 'TASK-011.md'), `# TASK-011
**Status**: ready
**EPIC**: EPIC-008
`);

      const tickets = await findEpicTickets('EPIC-007', tempDir);

      expect(tickets.length).toBe(1);
      expect(tickets[0].id).toBe('TASK-010');
    });

    it('should return empty array for non-existent EPIC', async () => {
      const tickets = await findEpicTickets('EPIC-999', tempDir);
      expect(tickets.length).toBe(0);
    });

    it('should dedupe tickets found in multiple locations', async () => {
      const ticketsDir = path.join(tempDir, 'jira', 'tickets');
      const epicDir = path.join(ticketsDir, 'EPIC-020');
      fs.mkdirSync(epicDir, { recursive: true });

      // Same ticket in both EPIC folder and mentioned in root
      fs.writeFileSync(path.join(epicDir, 'TASK-100.md'), `# TASK-100
**Status**: ready
**EPIC**: EPIC-020
`);

      const tickets = await findEpicTickets('EPIC-020', tempDir);

      expect(tickets.length).toBe(1);
    });
  });

  // ===========================================================================
  // topologicalSort tests
  // ===========================================================================

  describe('topologicalSort', () => {
    it('should sort tasks with no dependencies', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-003', title: 'C', status: 'ready', priority: 'P2', dependencies: [], filePath: '' },
        { id: 'TASK-001', title: 'A', status: 'ready', priority: 'P1', dependencies: [], filePath: '' },
        { id: 'TASK-002', title: 'B', status: 'ready', priority: 'P2', dependencies: [], filePath: '' },
      ];

      const sorted = topologicalSort(tickets);

      expect(sorted.length).toBe(3);
      // All have 0 in-degree, order preserved
      expect(sorted.map(t => t.id)).toEqual(['TASK-003', 'TASK-001', 'TASK-002']);
    });

    it('should sort tasks with linear dependencies', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-003', title: 'C', status: 'ready', priority: 'P2', dependencies: ['TASK-002'], filePath: '' },
        { id: 'TASK-001', title: 'A', status: 'ready', priority: 'P1', dependencies: [], filePath: '' },
        { id: 'TASK-002', title: 'B', status: 'ready', priority: 'P2', dependencies: ['TASK-001'], filePath: '' },
      ];

      const sorted = topologicalSort(tickets);

      expect(sorted.map(t => t.id)).toEqual(['TASK-001', 'TASK-002', 'TASK-003']);
    });

    it('should handle diamond dependencies', () => {
      //     A
      //    / \
      //   B   C
      //    \ /
      //     D
      const tickets: EpicTicket[] = [
        { id: 'TASK-D', title: 'D', status: 'ready', priority: 'P2', dependencies: ['TASK-B', 'TASK-C'], filePath: '' },
        { id: 'TASK-B', title: 'B', status: 'ready', priority: 'P2', dependencies: ['TASK-A'], filePath: '' },
        { id: 'TASK-A', title: 'A', status: 'ready', priority: 'P1', dependencies: [], filePath: '' },
        { id: 'TASK-C', title: 'C', status: 'ready', priority: 'P2', dependencies: ['TASK-A'], filePath: '' },
      ];

      const sorted = topologicalSort(tickets);

      // A must come first, D must come last
      expect(sorted[0].id).toBe('TASK-A');
      expect(sorted[sorted.length - 1].id).toBe('TASK-D');
    });

    it('should handle cyclic dependencies by appending at end', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-A', title: 'A', status: 'ready', priority: 'P1', dependencies: ['TASK-C'], filePath: '' },
        { id: 'TASK-B', title: 'B', status: 'ready', priority: 'P2', dependencies: ['TASK-A'], filePath: '' },
        { id: 'TASK-C', title: 'C', status: 'ready', priority: 'P2', dependencies: ['TASK-B'], filePath: '' },
      ];

      const sorted = topologicalSort(tickets);

      // Should still return all tasks (cycle detected, append remaining)
      expect(sorted.length).toBe(3);
    });

    it('should ignore dependencies not in the ticket set', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-001', title: 'A', status: 'ready', priority: 'P1', dependencies: ['TASK-EXTERNAL'], filePath: '' },
        { id: 'TASK-002', title: 'B', status: 'ready', priority: 'P2', dependencies: ['TASK-001'], filePath: '' },
      ];

      const sorted = topologicalSort(tickets);

      // TASK-EXTERNAL not in set, so TASK-001 has no deps
      expect(sorted.map(t => t.id)).toEqual(['TASK-001', 'TASK-002']);
    });
  });

  // ===========================================================================
  // analyzeComplexity tests
  // ===========================================================================

  describe('analyzeComplexity', () => {
    it('should calculate metrics for simple EPIC', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-001', title: 'A', status: 'ready', priority: 'P1', dependencies: [], filePath: '' },
        { id: 'TASK-002', title: 'B', status: 'ready', priority: 'P2', dependencies: [], filePath: '' },
      ];

      const result = analyzeComplexity(tickets, 'EPIC-001');

      expect(result.epicId).toBe('EPIC-001');
      expect(result.metrics.subtaskCount).toBe(2);
      expect(result.metrics.dependencyDepth).toBe(1);
      expect(result.metrics.maxBlockedBy).toBe(0);
      expect(result.totalScore).toBe(0);
      expect(result.suggestDAG).toBe(false);
    });

    it('should suggest DAG for complex EPIC', () => {
      const tickets: EpicTicket[] = [];
      for (let i = 1; i <= 6; i++) {
        tickets.push({
          id: `TASK-${i}`,
          title: `Task ${i}`,
          status: 'ready',
          priority: 'P1',
          dependencies: i > 1 ? [`TASK-${i - 1}`] : [],
          filePath: '',
          relativeModule: ['node/src', 'rust/crates', 'scripts'][i % 3],
        });
      }
      // Add more dependencies to increase blocked_by
      tickets[5].dependencies = ['TASK-1', 'TASK-2', 'TASK-3'];

      const result = analyzeComplexity(tickets, 'EPIC-COMPLEX');

      expect(result.metrics.subtaskCount).toBe(6);
      expect(result.metrics.subtaskCount).toBeGreaterThanOrEqual(THRESHOLDS.SUBTASK_COUNT);
      expect(result.scores.subtaskScore).toBe(WEIGHTS.SUBTASK_COUNT);
      expect(result.metrics.maxBlockedBy).toBe(3);
      expect(result.metrics.maxBlockedBy).toBeGreaterThanOrEqual(THRESHOLDS.BLOCKED_BY);
      expect(result.scores.blockedByScore).toBe(WEIGHTS.BLOCKED_BY);
      expect(result.totalScore).toBeGreaterThanOrEqual(DAG_THRESHOLD);
      expect(result.suggestDAG).toBe(true);
    });

    it('should calculate cross-module count', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-001', title: 'A', status: 'ready', priority: 'P1', dependencies: [], filePath: '', relativeModule: 'node/src' },
        { id: 'TASK-002', title: 'B', status: 'ready', priority: 'P2', dependencies: [], filePath: '', relativeModule: 'rust/crates' },
        { id: 'TASK-003', title: 'C', status: 'ready', priority: 'P2', dependencies: [], filePath: '', relativeModule: 'scripts' },
        { id: 'TASK-004', title: 'D', status: 'ready', priority: 'P2', dependencies: [], filePath: '', relativeModule: 'node/src' },
      ];

      const result = analyzeComplexity(tickets, 'EPIC-MULTI');

      expect(result.metrics.crossModuleCount).toBe(3);
      expect(result.metrics.crossModuleCount).toBeGreaterThanOrEqual(THRESHOLDS.CROSS_MODULE);
      expect(result.scores.crossModuleScore).toBe(WEIGHTS.CROSS_MODULE);
    });
  });

  // ===========================================================================
  // generateDAGConfig and dagConfigToYaml tests
  // ===========================================================================

  describe('generateDAGConfig', () => {
    it('should generate valid DAG config', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-001', title: 'A', status: 'ready', priority: 'P0', dependencies: [], filePath: '' },
        { id: 'TASK-002', title: 'B', status: 'ready', priority: 'P1', dependencies: ['TASK-001'], filePath: '' },
        { id: 'TASK-003', title: 'C', status: 'ready', priority: 'P2', dependencies: ['TASK-001'], filePath: '' },
      ];

      const config = generateDAGConfig('EPIC-017', tickets);

      expect(config.version).toBe('1.0');
      expect(config.epic).toBe('EPIC-017');
      expect(config.settings.max_parallel).toBe(3);
      expect(config.settings.retry_on_failure).toBe(true);
      expect(config.nodes.length).toBe(3);

      // Check first node (no deps, P0 timeout)
      const node1 = config.nodes.find(n => n.id === 'TASK-001');
      expect(node1?.deps).toBeUndefined();
      expect(node1?.timeout).toBe('2h');

      // Check second node (deps, P1 timeout)
      const node2 = config.nodes.find(n => n.id === 'TASK-002');
      expect(node2?.deps).toEqual(['TASK-001']);
      expect(node2?.timeout).toBe('4h');

      // Check third node (deps, no timeout for P2)
      const node3 = config.nodes.find(n => n.id === 'TASK-003');
      expect(node3?.deps).toEqual(['TASK-001']);
      expect(node3?.timeout).toBeUndefined();
    });
  });

  describe('dagConfigToYaml', () => {
    it('should generate valid YAML string', () => {
      const config = {
        version: '1.0',
        epic: 'EPIC-017',
        settings: { max_parallel: 3, retry_on_failure: true },
        nodes: [
          { id: 'TASK-001', script: 'echo 1' },
          { id: 'TASK-002', script: 'echo 2', deps: ['TASK-001'], timeout: '2h' },
        ],
      };

      const yaml = dagConfigToYaml(config);

      expect(yaml).toContain('version: "1.0"');
      expect(yaml).toContain('epic: "EPIC-017"');
      expect(yaml).toContain('max_parallel: 3');
      expect(yaml).toContain('retry_on_failure: true');
      expect(yaml).toContain('- id: "TASK-001"');
      expect(yaml).toContain('- id: "TASK-002"');
      expect(yaml).toContain('- "TASK-001"');
      expect(yaml).toContain('timeout: "2h"');
    });
  });

  describe('generateDagYaml', () => {
    it('should generate YAML from tickets directly', () => {
      const tickets: EpicTicket[] = [
        { id: 'TASK-001', title: 'A', status: 'ready', priority: 'P1', dependencies: [], filePath: '' },
      ];

      const yaml = generateDagYaml('EPIC-001', tickets);

      expect(yaml).toContain('epic: "EPIC-001"');
      expect(yaml).toContain('- id: "TASK-001"');
    });
  });

  // ===========================================================================
  // formatComplexityReport tests
  // ===========================================================================

  describe('formatComplexityReport', () => {
    it('should format report with DAG suggestion', () => {
      const result = {
        epicId: 'EPIC-017',
        metrics: { subtaskCount: 10, dependencyDepth: 4, maxBlockedBy: 3, crossModuleCount: 3 },
        scores: { subtaskScore: 2, depthScore: 3, blockedByScore: 1, crossModuleScore: 1 },
        totalScore: 7,
        suggestDAG: true,
        tasks: [],
      };

      const report = formatComplexityReport(result);

      expect(report).toContain('EPIC-017');
      expect(report).toContain('Sub-tasks:');
      expect(report).toContain('10');
      expect(report).toContain('Total:');
      expect(report).toContain('7');
      expect(report).toContain('DAG mode');
    });

    it('should format report without DAG suggestion', () => {
      const result = {
        epicId: 'EPIC-001',
        metrics: { subtaskCount: 2, dependencyDepth: 1, maxBlockedBy: 0, crossModuleCount: 1 },
        scores: { subtaskScore: 0, depthScore: 0, blockedByScore: 0, crossModuleScore: 0 },
        totalScore: 0,
        suggestDAG: false,
        tasks: [],
      };

      const report = formatComplexityReport(result);

      expect(report).toContain('EPIC-001');
      expect(report).toContain('manageable');
    });
  });

  // ===========================================================================
  // Constants tests
  // ===========================================================================

  describe('constants', () => {
    it('should export correct thresholds', () => {
      expect(THRESHOLDS.SUBTASK_COUNT).toBe(5);
      expect(THRESHOLDS.DEPENDENCY_DEPTH).toBe(3);
      expect(THRESHOLDS.BLOCKED_BY).toBe(2);
      expect(THRESHOLDS.CROSS_MODULE).toBe(3);
    });

    it('should export correct weights', () => {
      expect(WEIGHTS.SUBTASK_COUNT).toBe(2);
      expect(WEIGHTS.DEPENDENCY_DEPTH).toBe(3);
      expect(WEIGHTS.BLOCKED_BY).toBe(1);
      expect(WEIGHTS.CROSS_MODULE).toBe(1);
    });

    it('should export DAG threshold', () => {
      expect(DAG_THRESHOLD).toBe(4);
    });
  });
});
