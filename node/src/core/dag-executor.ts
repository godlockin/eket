/**
 * EKET DAG Executor (L2 Node.js Implementation)
 * TASK-633: TypeScript DAG 执行器，支持并发控制 + EventBus 状态广播
 *
 * Features:
 * - YAML DAG 加载与验证
 * - Semaphore 并发控制
 * - EventBus 状态事件广播
 * - --dry-run 模式（只验证不执行）
 * - --resume 断点续传
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { exec } from 'child_process';
import { promisify } from 'util';

import {
  type DagSchema,
  type DagNode,
  type DagSettings,
  type ValidationResult,
  validateDag,
  resolveNodeSettings,
  DEFAULT_SETTINGS,
} from '../schemas/dag.js';
import { EventBus, createEventBus } from './event-bus.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

// ============================================================================
// Script Sanitization (TASK-638: Log Masking)
// ============================================================================

/** Sensitive patterns to mask in logs */
const SENSITIVE_PATTERNS = [
  /(?:API_KEY|TOKEN|PASSWORD|SECRET|PRIVATE_KEY|ACCESS_KEY|AUTH)=\S+/gi,
  /Bearer\s+\S+/g,
  /Basic\s+[A-Za-z0-9+/=]+/g,
  /ghp_[A-Za-z0-9]+/g, // GitHub PAT
  /xoxb-[A-Za-z0-9-]+/g, // Slack bot token
  // TASK-647: Additional sensitive patterns
  /AWS_SECRET_ACCESS_KEY=\S+/gi,
  /AWS_ACCESS_KEY_ID=\S+/gi,
  /GITHUB_TOKEN=\S+/gi,
  /npm_config_\w+=\S+/gi,
  /xoxp-[A-Za-z0-9-]+/g, // Slack user token
  /AKIA[0-9A-Z]{16}/g, // AWS Access Key ID pattern
];

/**
 * Sanitize script content for logging.
 * Truncates to maxLength and masks sensitive patterns.
 */
export function sanitizeScript(script: string, maxLength = 100): string {
  // Mask sensitive patterns first (before truncation)
  let masked = script;
  for (const pattern of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      const eqIdx = match.indexOf('=');
      if (eqIdx !== -1) {
        return match.slice(0, eqIdx + 1) + '***';
      }
      const spaceIdx = match.indexOf(' ');
      if (spaceIdx !== -1) {
        return match.slice(0, spaceIdx + 1) + '***';
      }
      return '***';
    });
  }

  // Truncate
  if (masked.length > maxLength) {
    return masked.slice(0, maxLength) + '...';
  }
  return masked;
}

// ============================================================================
// Types
// ============================================================================

/** Node execution status */
export type NodeStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

/** DAG run status */
export type RunStatus = 'running' | 'completed' | 'failed' | 'paused';

/** Node execution result */
export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  retryCount: number;
}

/** DAG run state (for persistence) */
export interface DAGRunState {
  runId: string;
  epicId: string;
  dagPath: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  nodeResults: Map<string, NodeResult>;
  currentLevel: number; // execution wave level
}

/** Serializable run state for persistence */
interface SerializableRunState {
  runId: string;
  epicId: string;
  dagPath: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  nodeResults: Array<[string, NodeResult]>;
  currentLevel: number;
}

/** Execute options */
export interface ExecuteOptions {
  dryRun?: boolean;
  maxParallel?: number;
  onNodeStart?: (nodeId: string) => void;
  onNodeComplete?: (nodeId: string, result: NodeResult) => void;
  cwd?: string;
  timeout?: number;
  verbose?: boolean; // TASK-638: Show full script content in logs
  /** Path to DAG YAML file (required for resume support) - TASK-636 */
  dagPath?: string;
}

/** DAG run result */
export interface DAGRun {
  runId: string;
  epicId: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  nodeResults: Map<string, NodeResult>;
}

// ============================================================================
// Event Types
// ============================================================================

export const DAGEvents = {
  RUN_STARTED: 'dag.run.started',
  RUN_COMPLETED: 'dag.run.completed',
  NODE_PENDING: 'dag.node.pending',
  NODE_RUNNING: 'dag.node.running',
  NODE_DONE: 'dag.node.done',
  NODE_FAILED: 'dag.node.failed',
  NODE_SKIPPED: 'dag.node.skipped',
} as const;

export interface DAGRunStartedPayload {
  runId: string;
  epicId: string;
  totalNodes: number;
  dagPath: string;
}

export interface DAGRunCompletedPayload {
  runId: string;
  epicId: string;
  status: RunStatus;
  duration: number;
  completedNodes: number;
  failedNodes: number;
}

export interface DAGNodeEventPayload {
  runId: string;
  nodeId: string;
  startedAt?: number;
  duration?: number;
  error?: string;
  exitCode?: number;
}

// ============================================================================
// Semaphore for Concurrency Control
// ============================================================================

export class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    const next = this.waitQueue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  getAvailablePermits(): number {
    return this.permits;
  }
}

// ============================================================================
// DAG Executor Class
// ============================================================================

export class DAGExecutor {
  private eventBus: EventBus;
  private stateDir: string;

  constructor(options?: { eventBus?: EventBus; stateDir?: string }) {
    this.eventBus = options?.eventBus ?? createEventBus();
    this.stateDir = options?.stateDir ?? '.eket/dag-runs';

    if (!this.eventBus.isReady()) {
      this.eventBus.connect();
    }
  }

  /**
   * Load DAG from YAML file
   */
  async load(yamlPath: string): Promise<DagSchema> {
    const content = await readFile(yamlPath, 'utf-8');
    const dag = parseYaml(content) as unknown;

    // Validate before returning
    const validation = validateDag(dag);
    if (!validation.valid) {
      throw new Error(
        `Invalid DAG: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`
      );
    }

    return dag as DagSchema;
  }

  /**
   * Validate DAG structure
   */
  validate(dag: DagSchema): ValidationResult {
    return validateDag(dag);
  }

  /**
   * Execute DAG with concurrency control
   */
  async execute(dag: DagSchema, options: ExecuteOptions = {}): Promise<DAGRun> {
    const runId = this.generateRunId();
    const settings = { ...DEFAULT_SETTINGS, ...dag.settings };
    const maxParallel = options.maxParallel ?? settings.max_parallel;
    const semaphore = new Semaphore(maxParallel);

    // Initialize run state
    const runState: DAGRunState = {
      runId,
      epicId: dag.epic,
      dagPath: options.dagPath ?? '', // TASK-636: Store dagPath for resume support
      status: 'running',
      startedAt: Date.now(),
      nodeResults: new Map(),
      currentLevel: 0,
    };

    // Initialize all nodes as pending
    for (const node of dag.nodes) {
      runState.nodeResults.set(node.id, {
        nodeId: node.id,
        status: 'pending',
        retryCount: 0,
      });
    }

    // Emit run started event
    this.eventBus.emit<DAGRunStartedPayload>(DAGEvents.RUN_STARTED, {
      runId,
      epicId: dag.epic,
      totalNodes: dag.nodes.length,
      dagPath: runState.dagPath,
    });

    logger.info('dag_run_started', {
      runId,
      epicId: dag.epic,
      totalNodes: dag.nodes.length,
      maxParallel,
      dryRun: options.dryRun ?? false,
    });

    try {
      // Execute in waves (topological order)
      await this.executeWaves(
        dag.nodes,
        runState,
        semaphore,
        settings,
        options
      );

      // Determine final status
      const failedCount = [...runState.nodeResults.values()].filter(
        (r) => r.status === 'failed'
      ).length;
      runState.status = failedCount > 0 ? 'failed' : 'completed';
      runState.completedAt = Date.now();

      // Persist final state
      await this.persistState(runState);
    } catch (err) {
      runState.status = 'failed';
      runState.completedAt = Date.now();
      await this.persistState(runState);
      throw err;
    }

    const result = this.buildRunResult(runState);

    // Emit run completed event
    this.eventBus.emit<DAGRunCompletedPayload>(DAGEvents.RUN_COMPLETED, {
      runId,
      epicId: dag.epic,
      status: result.status,
      duration: result.duration ?? 0,
      completedNodes: result.completedNodes,
      failedNodes: result.failedNodes,
    });

    logger.info('dag_run_completed', {
      runId,
      epicId: dag.epic,
      status: result.status,
      duration: result.duration,
      completed: result.completedNodes,
      failed: result.failedNodes,
    });

    return result;
  }

  /**
   * Resume a paused or failed run
   */
  async resume(runId: string): Promise<DAGRun> {
    const state = await this.loadState(runId);
    if (!state) {
      throw new Error(`Run ${runId} not found`);
    }

    if (state.status === 'completed') {
      throw new Error(`Run ${runId} already completed`);
    }

    // Reload DAG
    const dag = await this.load(state.dagPath);
    const settings = { ...DEFAULT_SETTINGS, ...dag.settings };
    const semaphore = new Semaphore(settings.max_parallel);

    // Reset failed nodes to pending for retry
    for (const [nodeId, result] of state.nodeResults) {
      if (result.status === 'failed') {
        state.nodeResults.set(nodeId, {
          ...result,
          status: 'pending',
          retryCount: result.retryCount,
        });
      }
    }

    state.status = 'running';

    // Continue execution
    await this.executeWaves(
      dag.nodes,
      state,
      semaphore,
      settings,
      {}
    );

    // Determine final status
    const failedCount = [...state.nodeResults.values()].filter(
      (r) => r.status === 'failed'
    ).length;
    state.status = failedCount > 0 ? 'failed' : 'completed';
    state.completedAt = Date.now();

    await this.persistState(state);

    return this.buildRunResult(state);
  }

  /**
   * Get run status
   */
  async getStatus(runId: string): Promise<DAGRun | null> {
    const state = await this.loadState(runId);
    if (!state) return null;
    return this.buildRunResult(state);
  }

  /**
   * Execute nodes in topological waves
   */
  private async executeWaves(
    nodes: DagNode[],
    runState: DAGRunState,
    semaphore: Semaphore,
    settings: DagSettings,
    options: ExecuteOptions
  ): Promise<void> {
    const completed = new Set<string>();

    // Mark already completed nodes
    for (const [nodeId, result] of runState.nodeResults) {
      if (result.status === 'done') {
        completed.add(nodeId);
      }
    }

    // Get nodes ready to execute (all deps done)
    const getReadyNodes = (): DagNode[] => {
      return nodes.filter((node) => {
        // Skip if already processed
        const result = runState.nodeResults.get(node.id);
        if (!result || result.status !== 'pending') return false;

        // Check all dependencies are completed
        const deps = node.deps ?? [];
        return deps.every((depId) => {
          const depResult = runState.nodeResults.get(depId);
          return depResult?.status === 'done';
        });
      });
    };

    // Check for failed dependencies
    const hasFailedDeps = (node: DagNode): boolean => {
      const deps = node.deps ?? [];
      return deps.some((depId) => {
        const depResult = runState.nodeResults.get(depId);
        return depResult?.status === 'failed' || depResult?.status === 'skipped';
      });
    };

    // Execute until all nodes processed
    while (true) {
      // Check for nodes with failed dependencies → skip them
      for (const node of nodes) {
        const result = runState.nodeResults.get(node.id);
        if (result?.status === 'pending' && hasFailedDeps(node)) {
          result.status = 'skipped';
          this.eventBus.emit<DAGNodeEventPayload>(DAGEvents.NODE_SKIPPED, {
            runId: runState.runId,
            nodeId: node.id,
          });
          logger.warn('dag_node_skipped', {
            runId: runState.runId,
            nodeId: node.id,
            reason: 'dependency_failed',
          });
        }
      }

      const ready = getReadyNodes();
      if (ready.length === 0) {
        // Check if we're done or stuck
        const pending = [...runState.nodeResults.values()].filter(
          (r) => r.status === 'pending'
        );
        if (pending.length === 0) break; // All done

        // Check for cycle (shouldn't happen if validateDag passed)
        throw new Error(
          `Execution stuck: ${pending.map((p) => p.nodeId).join(', ')} cannot proceed`
        );
      }

      // Execute ready nodes in parallel (limited by semaphore)
      await Promise.all(
        ready.map((node) =>
          this.executeNode(node, runState, semaphore, settings, options)
        )
      );

      // Persist state after each wave
      await this.persistState(runState);

      // Check on_failure policy
      const failedResults = [...runState.nodeResults.values()].filter(
        (r) => r.status === 'failed'
      );
      if (failedResults.length > 0 && settings.on_failure === 'stop') {
        logger.info('dag_run_stopping', {
          runId: runState.runId,
          reason: 'node_failed_with_stop_policy',
          failedNodes: failedResults.map((r) => r.nodeId),
        });
        break;
      }
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(
    node: DagNode,
    runState: DAGRunState,
    semaphore: Semaphore,
    settings: DagSettings,
    options: ExecuteOptions
  ): Promise<void> {
    const result = runState.nodeResults.get(node.id)!;
    const nodeSettings = resolveNodeSettings(node, settings);

    // Emit pending event
    this.eventBus.emit<DAGNodeEventPayload>(DAGEvents.NODE_PENDING, {
      runId: runState.runId,
      nodeId: node.id,
    });

    await semaphore.acquire();

    try {
      result.status = 'running';
      result.startedAt = Date.now();

      // Emit running event
      this.eventBus.emit<DAGNodeEventPayload>(DAGEvents.NODE_RUNNING, {
        runId: runState.runId,
        nodeId: node.id,
        startedAt: result.startedAt,
      });

      options.onNodeStart?.(node.id);

      // Get script to execute (fallback to empty for gate nodes)
      const script = node.script ?? '';

      logger.info('dag_node_started', {
        runId: runState.runId,
        nodeId: node.id,
        script: options.verbose ? script : sanitizeScript(script),
        retry: result.retryCount,
      });

      // Dry run: skip actual execution
      if (options.dryRun) {
        await this.simulateExecution(node);
        result.status = 'done';
        result.completedAt = Date.now();
        result.duration = result.completedAt - result.startedAt;
        result.exitCode = 0;
        result.stdout = `[dry-run] Would execute: ${options.verbose ? script : sanitizeScript(script)}`;

        this.eventBus.emit<DAGNodeEventPayload>(DAGEvents.NODE_DONE, {
          runId: runState.runId,
          nodeId: node.id,
          duration: result.duration,
        });

        logger.info('dag_node_completed', {
          runId: runState.runId,
          nodeId: node.id,
          duration: result.duration,
          dryRun: true,
        });

        options.onNodeComplete?.(node.id, result);
        return;
      }

      // Execute with retry logic
      let lastError: Error | undefined;
      for (let attempt = 0; attempt <= nodeSettings.retry; attempt++) {
        result.retryCount = attempt;

        try {
          const execResult = await this.runScript(
            script,
            options.cwd,
            nodeSettings.timeout * 1000
          );

          result.status = 'done';
          result.completedAt = Date.now();
          result.duration = result.completedAt - result.startedAt;
          result.exitCode = 0;
          result.stdout = execResult.stdout;
          result.stderr = execResult.stderr;

          this.eventBus.emit<DAGNodeEventPayload>(DAGEvents.NODE_DONE, {
            runId: runState.runId,
            nodeId: node.id,
            duration: result.duration,
            exitCode: 0,
          });

          logger.info('dag_node_completed', {
            runId: runState.runId,
            nodeId: node.id,
            duration: result.duration,
            attempt,
          });

          options.onNodeComplete?.(node.id, result);
          return;
        } catch (err) {
          lastError = err as Error;
          if (attempt < nodeSettings.retry) {
            logger.warn('dag_node_retry', {
              runId: runState.runId,
              nodeId: node.id,
              attempt: attempt + 1,
              maxRetry: nodeSettings.retry,
              error: lastError.message,
            });
          }
        }
      }

      // All retries exhausted
      result.status = 'failed';
      result.completedAt = Date.now();
      result.duration = result.completedAt - result.startedAt;
      result.error = lastError?.message;

      this.eventBus.emit<DAGNodeEventPayload>(DAGEvents.NODE_FAILED, {
        runId: runState.runId,
        nodeId: node.id,
        duration: result.duration,
        error: result.error,
      });

      logger.error('dag_node_failed', {
        runId: runState.runId,
        nodeId: node.id,
        duration: result.duration,
        error: result.error,
      });

      options.onNodeComplete?.(node.id, result);
    } finally {
      semaphore.release();
    }
  }

  /**
   * Run shell script with timeout
   */
  private async runScript(
    script: string,
    cwd?: string,
    timeoutMs: number = 3600000
  ): Promise<{ stdout: string; stderr: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { stdout, stderr } = await execAsync(script, {
        cwd,
        signal: controller.signal,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      return { stdout, stderr };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Simulate execution for dry-run mode
   */
  private async simulateExecution(node: DagNode): Promise<void> {
    // Simulate some processing time (50-200ms)
    const delay = 50 + Math.random() * 150;
    await new Promise((resolve) => setTimeout(resolve, delay));
    logger.debug('dag_node_simulated', { nodeId: node.id, delay });
  }

  /**
   * Persist run state to disk
   */
  private async persistState(state: DAGRunState): Promise<void> {
    const stateFile = join(this.stateDir, `${state.runId}.json`);

    // Ensure directory exists
    if (!existsSync(this.stateDir)) {
      await mkdir(this.stateDir, { recursive: true });
    }

    const serializable: SerializableRunState = {
      ...state,
      nodeResults: [...state.nodeResults.entries()],
    };

    await writeFile(stateFile, JSON.stringify(serializable, null, 2), 'utf-8');
  }

  /**
   * Load run state from disk
   */
  private async loadState(runId: string): Promise<DAGRunState | null> {
    const stateFile = join(this.stateDir, `${runId}.json`);

    if (!existsSync(stateFile)) {
      return null;
    }

    const content = await readFile(stateFile, 'utf-8');
    const serializable = JSON.parse(content) as SerializableRunState;

    return {
      ...serializable,
      nodeResults: new Map(serializable.nodeResults),
    };
  }

  /**
   * Build DAGRun result from state
   */
  private buildRunResult(state: DAGRunState): DAGRun {
    const results = [...state.nodeResults.values()];
    const completedNodes = results.filter((r) => r.status === 'done').length;
    const failedNodes = results.filter((r) => r.status === 'failed').length;
    const skippedNodes = results.filter((r) => r.status === 'skipped').length;

    return {
      runId: state.runId,
      epicId: state.epicId,
      status: state.status,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
      duration: state.completedAt
        ? state.completedAt - state.startedAt
        : undefined,
      totalNodes: results.length,
      completedNodes,
      failedNodes,
      skippedNodes,
      nodeResults: state.nodeResults,
    };
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `dag_${timestamp}_${random}`;
  }

  /**
   * Get event bus instance (for testing/integration)
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }

  /**
   * Cleanup resources
   */
  disconnect(): void {
    this.eventBus.disconnect();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create DAG executor instance
 */
export function createDAGExecutor(options?: {
  eventBus?: EventBus;
  stateDir?: string;
}): DAGExecutor {
  return new DAGExecutor(options);
}
