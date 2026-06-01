/**
 * DAG Executor Unit Tests
 * TASK-633: 测试 DAG 执行器核心功能
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';

import {
  DAGExecutor,
  createDAGExecutor,
  Semaphore,
  DAGEvents,
  sanitizeScript,
  type NodeResult,
  type DAGRunStartedPayload,
  type DAGRunCompletedPayload,
  type DAGNodeEventPayload,
} from '../../src/core/dag-executor.js';
import { createEventBus, type EventBus } from '../../src/core/event-bus.js';
import type { DagSchema } from '../../src/schemas/dag.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const createTestDAG = (overrides: Partial<DagSchema> = {}): DagSchema => {
  const base: DagSchema = {
    version: '1.0',
    epic: 'EPIC-001',
    nodes: [
      { id: 'TASK-001', script: 'echo "task 1"', deps: [] },
      { id: 'TASK-002', script: 'echo "task 2"', deps: ['TASK-001'] },
      { id: 'TASK-003', script: 'echo "task 3"', deps: ['TASK-001'] },
      { id: 'TASK-004', script: 'echo "task 4"', deps: ['TASK-002', 'TASK-003'] },
    ],
    settings: {
      max_parallel: 2,
      retry_count: 1,
      timeout_seconds: 60,
      on_failure: 'stop',
    },
  };
  return {
    ...base,
    ...overrides,
    nodes: overrides.nodes ?? base.nodes,
    settings: overrides.settings ?? base.settings,
  };
};

const createParallelDAG = (): DagSchema => ({
  version: '1.0',
  epic: 'EPIC-PARALLEL',
  nodes: [
    { id: 'TASK-001', script: 'echo "a"', deps: [] },
    { id: 'TASK-002', script: 'echo "b"', deps: [] },
    { id: 'TASK-003', script: 'echo "c"', deps: [] },
  ],
  settings: { max_parallel: 3 },
});

// ============================================================================
// Semaphore Tests
// ============================================================================

describe('sanitizeScript (TASK-638)', () => {
  it('should truncate long scripts to maxLength + "..."', () => {
    const longScript = 'a'.repeat(150);
    const result = sanitizeScript(longScript, 100);
    expect(result).toBe('a'.repeat(100) + '...');
  });

  it('should not truncate short scripts', () => {
    const shortScript = 'echo hello';
    const result = sanitizeScript(shortScript, 100);
    expect(result).toBe('echo hello');
  });

  it('should mask API_KEY=value patterns', () => {
    const script = 'curl -H "API_KEY=secret123" http://api.test';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('API_KEY=***');
    expect(result).not.toContain('secret123');
  });

  it('should mask TOKEN=value patterns', () => {
    const script = 'export TOKEN=mytoken123';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('TOKEN=***');
    expect(result).not.toContain('mytoken123');
  });

  it('should mask PASSWORD=value patterns', () => {
    const script = 'mysql -u root PASSWORD=pass123';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('PASSWORD=***');
    expect(result).not.toContain('pass123');
  });

  it('should mask SECRET=value patterns', () => {
    const script = 'aws SECRET=abc123 s3 ls';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('SECRET=***');
    expect(result).not.toContain('abc123');
  });

  it('should mask Bearer tokens', () => {
    const script = 'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9" http://api';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('Bearer ***');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('should mask Basic auth', () => {
    const script = 'curl -H "Authorization: Basic dXNlcjpwYXNz" http://api';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('Basic ***');
    expect(result).not.toContain('dXNlcjpwYXNz');
  });

  it('should mask GitHub PAT tokens', () => {
    const script = 'git clone https://ghp_1234567890abcdefABCDEF@github.com/user/repo';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('***');
    expect(result).not.toContain('ghp_1234567890abcdefABCDEF');
  });

  it('should mask Slack tokens', () => {
    const script = 'curl -H "Authorization: xoxb-123-456-abcdef" slack.com/api';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('***');
    expect(result).not.toContain('xoxb-123-456-abcdef');
  });

  it('should mask multiple sensitive patterns', () => {
    const script = 'API_KEY=key1 TOKEN=tok1 Bearer secret123';
    const result = sanitizeScript(script, 200);
    expect(result).toContain('API_KEY=***');
    expect(result).toContain('TOKEN=***');
    expect(result).toContain('Bearer ***');
    expect(result).not.toContain('key1');
    expect(result).not.toContain('tok1');
    expect(result).not.toContain('secret123');
  });

  it('should mask before truncating', () => {
    // Ensure masking happens first so we don't leak partial secrets
    // "API_KEY=xxx...xxx more" -> "API_KEY=*** more" (masked) -> truncated if > maxLength
    const script = 'API_KEY=' + 'x'.repeat(100) + ' more content after this point needs truncation';
    const result = sanitizeScript(script, 30);
    // After masking: "API_KEY=*** more content after this point needs truncation"
    // Truncate to 30 chars + "..."
    expect(result).toContain('API_KEY=***');
    expect(result).not.toContain('xxxxx');
    expect(result.endsWith('...')).toBe(true);
  });

  it('should be case-insensitive for key patterns', () => {
    const script1 = 'api_key=secret';
    const script2 = 'Api_Key=secret';
    const script3 = 'API_KEY=secret';

    expect(sanitizeScript(script1, 200)).toContain('***');
    expect(sanitizeScript(script2, 200)).toContain('***');
    expect(sanitizeScript(script3, 200)).toContain('***');
  });
});

describe('Semaphore', () => {
  it('should limit concurrent access', async () => {
    const sem = new Semaphore(2);
    const results: number[] = [];
    let activeCount = 0;
    let maxActive = 0;

    const task = async (id: number): Promise<void> => {
      await sem.acquire();
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      results.push(id);
      await new Promise((r) => setTimeout(r, 10));
      activeCount--;
      sem.release();
    };

    await Promise.all([task(1), task(2), task(3), task(4)]);

    expect(results).toHaveLength(4);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('should return available permits', () => {
    const sem = new Semaphore(3);
    expect(sem.getAvailablePermits()).toBe(3);
  });

  it('should track permits correctly through acquire/release', async () => {
    const sem = new Semaphore(2);

    await sem.acquire();
    expect(sem.getAvailablePermits()).toBe(1);

    await sem.acquire();
    expect(sem.getAvailablePermits()).toBe(0);

    sem.release();
    expect(sem.getAvailablePermits()).toBe(1);

    sem.release();
    expect(sem.getAvailablePermits()).toBe(2);
  });
});

// ============================================================================
// DAGExecutor Tests
// ============================================================================

describe('DAGExecutor', () => {
  let executor: DAGExecutor;
  let eventBus: EventBus;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `dag-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });

    eventBus = createEventBus();
    eventBus.connect();

    executor = createDAGExecutor({
      eventBus,
      stateDir: join(tempDir, 'dag-runs'),
    });
  });

  afterEach(async () => {
    executor.disconnect();
    eventBus.disconnect();

    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('load()', () => {
    it('should load valid DAG from YAML', async () => {
      const yamlContent = `
version: "1.0"
epic: EPIC-001
nodes:
  - id: TASK-001
    script: "echo hello"
    deps: []
`;
      const yamlPath = join(tempDir, 'test.yml');
      await writeFile(yamlPath, yamlContent, 'utf-8');

      const dag = await executor.load(yamlPath);

      expect(dag.version).toBe('1.0');
      expect(dag.epic).toBe('EPIC-001');
      expect(dag.nodes).toHaveLength(1);
      expect(dag.nodes[0].id).toBe('TASK-001');
    });

    it('should throw on invalid DAG', async () => {
      const yamlContent = `
version: "1.0"
epic: "INVALID"
nodes: []
`;
      const yamlPath = join(tempDir, 'invalid.yml');
      await writeFile(yamlPath, yamlContent, 'utf-8');

      await expect(executor.load(yamlPath)).rejects.toThrow('Invalid DAG');
    });
  });

  describe('validate()', () => {
    it('should validate correct DAG', () => {
      const dag = createTestDAG();
      const result = executor.validate(dag);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing dependencies', () => {
      const dag = createTestDAG({
        nodes: [
          { id: 'TASK-001', script: 'echo "1"', deps: ['TASK-MISSING'] },
        ],
      });

      const result = executor.validate(dag);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'UNKNOWN_DEP')).toBe(true);
    });

    it('should detect circular dependencies', () => {
      const dag = createTestDAG({
        nodes: [
          { id: 'TASK-001', script: 'echo "1"', deps: ['TASK-002'] },
          { id: 'TASK-002', script: 'echo "2"', deps: ['TASK-001'] },
        ],
      });

      const result = executor.validate(dag);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'CYCLE_DETECTED')).toBe(true);
    });
  });

  describe('execute() - dry-run mode', () => {
    it('should execute DAG in dry-run mode without running scripts', async () => {
      const dag = createTestDAG();
      const nodeStarts: string[] = [];
      const nodeCompletes: string[] = [];

      const result = await executor.execute(dag, {
        dryRun: true,
        onNodeStart: (nodeId) => nodeStarts.push(nodeId),
        onNodeComplete: (nodeId) => nodeCompletes.push(nodeId),
      });

      expect(result.status).toBe('completed');
      expect(result.completedNodes).toBe(4);
      expect(result.failedNodes).toBe(0);
      expect(nodeStarts).toHaveLength(4);
      expect(nodeCompletes).toHaveLength(4);

      // Verify execution order respects dependencies
      const task1Idx = nodeCompletes.indexOf('TASK-001');
      const task2Idx = nodeCompletes.indexOf('TASK-002');
      const task3Idx = nodeCompletes.indexOf('TASK-003');
      const task4Idx = nodeCompletes.indexOf('TASK-004');

      expect(task1Idx).toBeLessThan(task2Idx);
      expect(task1Idx).toBeLessThan(task3Idx);
      expect(task2Idx).toBeLessThan(task4Idx);
      expect(task3Idx).toBeLessThan(task4Idx);
    });

    it('should emit EventBus events during execution', async () => {
      const dag = createTestDAG({
        nodes: [{ id: 'TASK-001', script: 'echo "test"', deps: [] }],
      });

      const events: Array<{ type: string; payload: unknown }> = [];

      eventBus.on<DAGRunStartedPayload>(DAGEvents.RUN_STARTED, (payload) => {
        events.push({ type: 'run_started', payload });
      });
      eventBus.on<DAGNodeEventPayload>(DAGEvents.NODE_RUNNING, (payload) => {
        events.push({ type: 'node_running', payload });
      });
      eventBus.on<DAGNodeEventPayload>(DAGEvents.NODE_DONE, (payload) => {
        events.push({ type: 'node_done', payload });
      });
      eventBus.on<DAGRunCompletedPayload>(DAGEvents.RUN_COMPLETED, (payload) => {
        events.push({ type: 'run_completed', payload });
      });

      await executor.execute(dag, { dryRun: true });

      expect(events.find((e) => e.type === 'run_started')).toBeDefined();
      expect(events.find((e) => e.type === 'node_running')).toBeDefined();
      expect(events.find((e) => e.type === 'node_done')).toBeDefined();
      expect(events.find((e) => e.type === 'run_completed')).toBeDefined();
    });

    it('should respect maxParallel setting', async () => {
      const dag = createParallelDAG();
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      // Override max_parallel to 1
      await executor.execute(dag, {
        dryRun: true,
        maxParallel: 1,
        onNodeStart: () => {
          currentConcurrent++;
          maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        },
        onNodeComplete: () => {
          currentConcurrent--;
        },
      });

      expect(maxConcurrent).toBe(1);
    });
  });

  describe('execute() - real execution', () => {
    it('should execute simple DAG with shell commands', async () => {
      const dag: DagSchema = {
        version: '1.0',
        epic: 'EPIC-SHELL',
        nodes: [
          { id: 'TASK-001', script: 'echo "hello"', deps: [] },
        ],
        settings: { max_parallel: 1 },
      };

      const result = await executor.execute(dag);

      expect(result.status).toBe('completed');
      expect(result.completedNodes).toBe(1);

      const nodeResult = result.nodeResults.get('TASK-001');
      expect(nodeResult?.status).toBe('done');
      expect(nodeResult?.stdout?.trim()).toBe('hello');
    });

    it('should handle command failures', async () => {
      const dag: DagSchema = {
        version: '1.0',
        epic: 'EPIC-FAIL',
        nodes: [
          { id: 'TASK-001', script: 'exit 1', deps: [], retry: 0 },
        ],
        settings: { max_parallel: 1, on_failure: 'stop' },
      };

      const result = await executor.execute(dag);

      expect(result.status).toBe('failed');
      expect(result.failedNodes).toBe(1);

      const nodeResult = result.nodeResults.get('TASK-001');
      expect(nodeResult?.status).toBe('failed');
    });

    it('should skip downstream nodes when dependency fails', async () => {
      const dag: DagSchema = {
        version: '1.0',
        epic: 'EPIC-SKIP',
        nodes: [
          { id: 'TASK-001', script: 'exit 1', deps: [], retry: 0 },
          { id: 'TASK-002', script: 'echo "should skip"', deps: ['TASK-001'] },
        ],
        settings: { max_parallel: 1, on_failure: 'continue' },
      };

      const result = await executor.execute(dag);

      expect(result.failedNodes).toBe(1);
      expect(result.skippedNodes).toBe(1);

      const task2Result = result.nodeResults.get('TASK-002');
      expect(task2Result?.status).toBe('skipped');
    });

    it('should retry failed nodes according to retry setting', async () => {
      // Use a script that fails first time but would succeed on retry
      // For testing, we use a script that always fails
      const dag: DagSchema = {
        version: '1.0',
        epic: 'EPIC-RETRY',
        nodes: [
          { id: 'TASK-001', script: 'exit 1', deps: [], retry: 2 },
        ],
        settings: { max_parallel: 1 },
      };

      const result = await executor.execute(dag);

      const nodeResult = result.nodeResults.get('TASK-001');
      expect(nodeResult?.status).toBe('failed');
      expect(nodeResult?.retryCount).toBe(2); // Final retry count
    });
  });

  describe('state persistence', () => {
    it('should persist run state to disk', async () => {
      const dag = createTestDAG({
        nodes: [{ id: 'TASK-001', script: 'echo "test"', deps: [] }],
      });

      const result = await executor.execute(dag, { dryRun: true });

      // Check state file exists
      const stateFile = join(tempDir, 'dag-runs', `${result.runId}.json`);
      expect(existsSync(stateFile)).toBe(true);
    });

    it('should allow status query by runId', async () => {
      const dag = createTestDAG({
        nodes: [{ id: 'TASK-001', script: 'echo "test"', deps: [] }],
      });

      const result = await executor.execute(dag, { dryRun: true });
      const status = await executor.getStatus(result.runId);

      expect(status).not.toBeNull();
      expect(status?.runId).toBe(result.runId);
      expect(status?.status).toBe('completed');
    });

    it('should return null for unknown runId', async () => {
      const status = await executor.getStatus('nonexistent_run_id');
      expect(status).toBeNull();
    });
  });

  describe('resume()', () => {
    it('should throw for unknown runId', async () => {
      await expect(executor.resume('unknown_run')).rejects.toThrow('not found');
    });

    it('should throw for already completed run', async () => {
      // First, create the YAML file for the DAG
      const yamlContent = `
version: "1.0"
epic: EPIC-001
nodes:
  - id: TASK-001
    script: "echo test"
    deps: []
settings:
  max_parallel: 2
`;
      const yamlPath = join(tempDir, 'resume-test.yml');
      await writeFile(yamlPath, yamlContent, 'utf-8');

      // Create executor that saves dagPath
      const customExecutor = createDAGExecutor({
        eventBus,
        stateDir: join(tempDir, 'dag-runs'),
      });

      const loadedDag = await customExecutor.load(yamlPath);
      // TASK-636: Pass dagPath to enable resume support
      const result = await customExecutor.execute(loadedDag, {
        dryRun: true,
        dagPath: yamlPath,
      });

      // Resume on completed run should throw
      await expect(customExecutor.resume(result.runId)).rejects.toThrow(
        'already completed'
      );

      customExecutor.disconnect();
    });

    it('should persist dagPath and resume from it (TASK-636)', async () => {
      // Create YAML file for DAG with a failing node
      const yamlContent = `
version: "1.0"
epic: EPIC-636
nodes:
  - id: TASK-001
    script: "echo first"
    deps: []
  - id: TASK-002
    script: "echo second"
    deps: ["TASK-001"]
settings:
  max_parallel: 1
  on_failure: continue
`;
      const yamlPath = join(tempDir, 'resume-dagpath-test.yml');
      await writeFile(yamlPath, yamlContent, 'utf-8');

      const customExecutor = createDAGExecutor({
        eventBus,
        stateDir: join(tempDir, 'dag-runs'),
      });

      const loadedDag = await customExecutor.load(yamlPath);

      // Execute with dagPath option
      const result = await customExecutor.execute(loadedDag, {
        dryRun: true,
        dagPath: yamlPath,
      });

      // Verify dagPath was persisted in state file
      const stateFile = join(tempDir, 'dag-runs', `${result.runId}.json`);
      const stateContent = await import('fs/promises').then((fs) =>
        fs.readFile(stateFile, 'utf-8')
      );
      const state = JSON.parse(stateContent);

      expect(state.dagPath).toBe(yamlPath);

      customExecutor.disconnect();
    });

    it('should resume failed run using persisted dagPath (TASK-636)', async () => {
      // Create YAML file with failing node (retry=0)
      const yamlContent = `
version: "1.0"
epic: EPIC-637
nodes:
  - id: TASK-001
    script: "exit 1"
    deps: []
    retry: 0
settings:
  max_parallel: 1
  on_failure: stop
`;
      const yamlPath = join(tempDir, 'resume-fail-test.yml');
      await writeFile(yamlPath, yamlContent, 'utf-8');

      const customExecutor = createDAGExecutor({
        eventBus,
        stateDir: join(tempDir, 'dag-runs'),
      });

      const loadedDag = await customExecutor.load(yamlPath);

      // First execution fails
      const firstResult = await customExecutor.execute(loadedDag, {
        dagPath: yamlPath,
      });

      expect(firstResult.status).toBe('failed');
      expect(firstResult.failedNodes).toBe(1);

      // Modify YAML to make the script succeed (simulating bug fix)
      const fixedYamlContent = `
version: "1.0"
epic: EPIC-637
nodes:
  - id: TASK-001
    script: "echo fixed"
    deps: []
settings:
  max_parallel: 1
`;
      await writeFile(yamlPath, fixedYamlContent, 'utf-8');

      // Resume should use persisted dagPath to reload DAG
      const resumeResult = await customExecutor.resume(firstResult.runId);

      expect(resumeResult.status).toBe('completed');
      expect(resumeResult.completedNodes).toBe(1);
      expect(resumeResult.failedNodes).toBe(0);

      customExecutor.disconnect();
    });
  });

  describe('factory function', () => {
    it('should create executor with default options', () => {
      const exec = createDAGExecutor();
      expect(exec).toBeInstanceOf(DAGExecutor);
      exec.disconnect();
    });

    it('should create executor with custom eventBus', () => {
      const customBus = createEventBus();
      customBus.connect();

      const exec = createDAGExecutor({ eventBus: customBus });
      expect(exec.getEventBus()).toBe(customBus);

      exec.disconnect();
      customBus.disconnect();
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('DAGExecutor Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `dag-integration-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should execute complex DAG with multiple parallel branches', async () => {
    const dag: DagSchema = {
      version: '1.0',
      epic: 'EPIC-COMPLEX',
      nodes: [
        { id: 'TASK-001', script: 'echo "root"', deps: [] },
        { id: 'TASK-002', script: 'echo "branch-a"', deps: ['TASK-001'] },
        { id: 'TASK-003', script: 'echo "branch-b"', deps: ['TASK-001'] },
        { id: 'TASK-004', script: 'echo "branch-c"', deps: ['TASK-001'] },
        { id: 'TASK-005', script: 'echo "merge"', deps: ['TASK-002', 'TASK-003', 'TASK-004'] },
      ],
      settings: { max_parallel: 3 },
    };

    const executor = createDAGExecutor({
      stateDir: join(tempDir, 'dag-runs'),
    });

    const completionOrder: string[] = [];
    const result = await executor.execute(dag, {
      onNodeComplete: (nodeId) => completionOrder.push(nodeId),
    });

    expect(result.status).toBe('completed');
    expect(result.completedNodes).toBe(5);

    // TASK-001 must complete before 002, 003, 004
    const idx001 = completionOrder.indexOf('TASK-001');
    const idx002 = completionOrder.indexOf('TASK-002');
    const idx003 = completionOrder.indexOf('TASK-003');
    const idx004 = completionOrder.indexOf('TASK-004');
    const idx005 = completionOrder.indexOf('TASK-005');

    expect(idx001).toBeLessThan(idx002);
    expect(idx001).toBeLessThan(idx003);
    expect(idx001).toBeLessThan(idx004);
    expect(idx002).toBeLessThan(idx005);
    expect(idx003).toBeLessThan(idx005);
    expect(idx004).toBeLessThan(idx005);

    executor.disconnect();
  });
});

// ============================================================================
// TASK-641: Conditional Branch and Foreach Tests
// ============================================================================

describe('DAG Conditional Branch (TASK-641)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `dag-conditional-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should parse gate node type correctly', async () => {
    const dag: DagSchema = {
      version: '1.0',
      epic: 'EPIC-GATE',
      nodes: [
        { id: 'TASK-001', script: 'echo start', deps: [] },
        { id: 'gate-check', type: 'gate', condition: 'exit 0', deps: ['TASK-001'] },
        { id: 'success-path', script: 'echo success', deps: ['gate-check'], when: 'gate-check.success' },
      ],
      settings: { max_parallel: 2 },
    };

    const executor = createDAGExecutor({
      stateDir: join(tempDir, 'dag-runs'),
    });

    // Should parse without error
    expect(dag.nodes[1].type).toBe('gate');
    expect(dag.nodes[1].condition).toBe('exit 0');
    expect(dag.nodes[2].when).toBe('gate-check.success');

    executor.disconnect();
  });

  it('should parse foreach node type correctly', async () => {
    const dag: DagSchema = {
      version: '1.0',
      epic: 'EPIC-FOREACH',
      nodes: [
        { id: 'TASK-001', script: 'echo start', deps: [] },
        {
          id: 'batch-process',
          type: 'foreach',
          items: ['a', 'b', 'c'],
          script: 'echo processing ${item}',
          deps: ['TASK-001']
        },
        { id: 'TASK-002', script: 'echo done', deps: ['batch-process'] },
      ],
      settings: { max_parallel: 3 },
    };

    expect(dag.nodes[1].type).toBe('foreach');
    expect(dag.nodes[1].items).toEqual(['a', 'b', 'c']);
    expect(dag.nodes[1].script).toBe('echo processing ${item}');
  });
});

describe('DAG Schema Validation (TASK-641)', () => {
  it('should validate gate node requires condition', async () => {
    const { validateDag } = await import('../../src/schemas/dag.js');
    const dag = {
      version: '1.0',
      epic: 'EPIC-001',
      nodes: [
        { id: 'gate-check', type: 'gate', deps: [] }, // Missing condition
      ],
    };

    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('condition'))).toBe(true);
  });

  it('should validate foreach node requires items and script', async () => {
    const { validateDag } = await import('../../src/schemas/dag.js');
    const dag = {
      version: '1.0',
      epic: 'EPIC-001',
      nodes: [
        { id: 'batch', type: 'foreach', deps: [] }, // Missing items and script
      ],
    };

    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path.includes('items') || e.path.includes('script'))).toBe(true);
  });

  it('should validate when condition references existing gate', async () => {
    const { validateDag } = await import('../../src/schemas/dag.js');
    const dag = {
      version: '1.0',
      epic: 'EPIC-001',
      nodes: [
        { id: 'TASK-001', script: 'echo test', when: 'nonexistent-gate.success', deps: [] },
      ],
    };

    const result = validateDag(dag);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'INVALID_WHEN')).toBe(true);
  });

  it('should accept valid conditional DAG', async () => {
    const { validateDag } = await import('../../src/schemas/dag.js');
    const dag = {
      version: '1.0',
      epic: 'EPIC-001',
      nodes: [
        { id: 'TASK-001', script: 'echo start', deps: [] },
        { id: 'gate-check', type: 'gate', condition: 'exit 0', deps: ['TASK-001'] },
        { id: 'success-path', script: 'echo success', deps: ['gate-check'], when: 'gate-check.success' },
        { id: 'failure-path', script: 'echo failure', deps: ['gate-check'], when: 'gate-check.failure' },
      ],
    };

    const result = validateDag(dag);
    expect(result.valid).toBe(true);
  });

  it('should accept valid foreach DAG', async () => {
    const { validateDag } = await import('../../src/schemas/dag.js');
    const dag = {
      version: '1.0',
      epic: 'EPIC-001',
      nodes: [
        { id: 'TASK-001', script: 'echo start', deps: [] },
        {
          id: 'batch-process',
          type: 'foreach',
          items: ['a', 'b', 'c'],
          script: 'echo ${item}',
          deps: ['TASK-001']
        },
      ],
    };

    const result = validateDag(dag);
    expect(result.valid).toBe(true);
  });
});
