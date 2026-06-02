/**
 * DAG-Slaver Bridge (TASK-642)
 *
 * Connects DAG execution events to Master-Slaver coordination:
 * - dag.node.ready → Master dispatches task to idle Slaver
 * - dag.node.done  → Slaver reports completion, DAG advances
 * - dag.node.failed → Master decides retry/skip/abort
 * - dag.run.completed → Master initiates EPIC acceptance
 *
 * Architecture:
 *   DAGExecutor ──(events)──▶ DAGSlaverBridge ──(mailbox)──▶ Slaver
 *                                    ▲
 *                                    │
 *                              (completion)
 *                                    │
 *                              Slaver poll
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  sendTaskAssignment,
  readMailbox,
} from './agent-mailbox.js';
import {
  DAGEvents,
  type DAGRunStartedPayload,
  type DAGRunCompletedPayload,
  type DAGNodeEventPayload,
} from './dag-executor.js';
import {
  EventBus,
  getGlobalEventBus,
  TaskEvents,
  type TicketCompletedPayload,
  TICKET_COMPLETED_EVENT,
} from './event-bus.js';
import { logger } from '../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

/** Slaver assignment status */
export interface SlaverAssignment {
  slaverId: string;
  nodeId: string;
  assignedAt: number;
  status: 'assigned' | 'running' | 'done' | 'failed';
}

/** DAG run progress for heartbeat reporting */
export interface DAGProgress {
  runId: string;
  epicId: string;
  status: 'running' | 'completed' | 'failed' | 'paused';
  totalNodes: number;
  pendingNodes: number;
  runningNodes: number;
  completedNodes: number;
  failedNodes: number;
  skippedNodes: number;
  startedAt: number;
  estimatedCompletion?: number; // estimated ms remaining
  criticalPath?: string[];
  assignments: SlaverAssignment[];
}

/** Bridge configuration */
export interface DAGSlaverBridgeConfig {
  /** Project root directory */
  projectRoot?: string;
  /** Master agent ID */
  masterId?: string;
  /** Maximum concurrent assignments per Slaver */
  maxConcurrentPerSlaver?: number;
  /** Assignment timeout in ms (default: 2h) */
  assignmentTimeoutMs?: number;
  /** EventBus instance (uses global if not provided) */
  eventBus?: EventBus;
}

/** Idle Slaver info from heartbeat files */
export interface IdleSlaver {
  id: string;
  specialty: string;
  lastSeen: number;
  currentLoad: number;
  maxConcurrent: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_CONCURRENT_PER_SLAVER = 1;
const DEFAULT_ASSIGNMENT_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

// DAG node assignment message type
export const DAG_NODE_ASSIGNMENT_TYPE = 'dag_node_assignment';

// ============================================================================
// DAG-Slaver Bridge Class
// ============================================================================

export class DAGSlaverBridge {
  private eventBus: EventBus;
  private config: Required<DAGSlaverBridgeConfig>;

  // Active DAG runs being orchestrated
  private activeRuns: Map<string, DAGProgress> = new Map();

  // Node → Slaver assignments
  private nodeAssignments: Map<string, SlaverAssignment> = new Map();

  // Pending nodes waiting for available Slaver
  private pendingDispatch: Map<string, DAGNodeEventPayload> = new Map();

  constructor(config: DAGSlaverBridgeConfig = {}) {
    this.config = {
      projectRoot: config.projectRoot ?? process.cwd(),
      masterId: config.masterId ?? 'master',
      maxConcurrentPerSlaver: config.maxConcurrentPerSlaver ?? DEFAULT_MAX_CONCURRENT_PER_SLAVER,
      assignmentTimeoutMs: config.assignmentTimeoutMs ?? DEFAULT_ASSIGNMENT_TIMEOUT_MS,
      eventBus: config.eventBus ?? getGlobalEventBus(),
    };

    this.eventBus = this.config.eventBus;

    // Ensure event bus is connected
    if (!this.eventBus.isReady()) {
      this.eventBus.connect();
    }

    this.setupEventHandlers();
  }

  /**
   * Setup event handlers for DAG events
   */
  private setupEventHandlers(): void {
    // DAG run lifecycle
    this.eventBus.on<DAGRunStartedPayload>(DAGEvents.RUN_STARTED, (payload) => {
      this.handleRunStarted(payload);
    });

    this.eventBus.on<DAGRunCompletedPayload>(DAGEvents.RUN_COMPLETED, (payload) => {
      this.handleRunCompleted(payload);
    });

    // Node lifecycle - key integration points
    this.eventBus.on<DAGNodeEventPayload>(DAGEvents.NODE_PENDING, (payload) => {
      this.handleNodePending(payload);
    });

    this.eventBus.on<DAGNodeEventPayload>(DAGEvents.NODE_DONE, (payload) => {
      this.handleNodeDone(payload);
    });

    this.eventBus.on<DAGNodeEventPayload>(DAGEvents.NODE_FAILED, (payload) => {
      this.handleNodeFailed(payload);
    });

    this.eventBus.on<DAGNodeEventPayload>(DAGEvents.NODE_SKIPPED, (payload) => {
      this.handleNodeSkipped(payload);
    });

    // Listen for ticket completion events (from Slaver)
    this.eventBus.on<TicketCompletedPayload>(TICKET_COMPLETED_EVENT, (payload) => {
      this.handleTicketCompleted(payload);
    });

    logger.info('dag_slaver_bridge_initialized', {
      masterId: this.config.masterId,
      maxConcurrentPerSlaver: this.config.maxConcurrentPerSlaver,
    });
  }

  /**
   * Handle DAG run started
   */
  private handleRunStarted(payload: DAGRunStartedPayload): void {
    const progress: DAGProgress = {
      runId: payload.runId,
      epicId: payload.epicId,
      status: 'running',
      totalNodes: payload.totalNodes,
      pendingNodes: payload.totalNodes,
      runningNodes: 0,
      completedNodes: 0,
      failedNodes: 0,
      skippedNodes: 0,
      startedAt: Date.now(),
      assignments: [],
    };

    this.activeRuns.set(payload.runId, progress);

    logger.info('dag_slaver_bridge_run_started', {
      runId: payload.runId,
      epicId: payload.epicId,
      totalNodes: payload.totalNodes,
    });
  }

  /**
   * Handle DAG run completed
   */
  private handleRunCompleted(payload: DAGRunCompletedPayload): void {
    const progress = this.activeRuns.get(payload.runId);
    if (!progress) return;

    progress.status = payload.status;

    // Emit EPIC acceptance event
    this.eventBus.emit('dag.epic.acceptance_required', {
      epicId: payload.epicId,
      runId: payload.runId,
      status: payload.status,
      completedNodes: payload.completedNodes,
      failedNodes: payload.failedNodes,
      duration: payload.duration,
    });

    logger.info('dag_slaver_bridge_run_completed', {
      runId: payload.runId,
      epicId: payload.epicId,
      status: payload.status,
      duration: payload.duration,
    });

    // Clean up after delay (allow for late events)
    setTimeout(() => {
      this.activeRuns.delete(payload.runId);
    }, 30000);
  }

  /**
   * Handle node pending (ready for dispatch)
   * This is the key integration point - dispatch to idle Slaver
   */
  private handleNodePending(payload: DAGNodeEventPayload): void {
    const progress = this.activeRuns.get(payload.runId);
    if (progress) {
      progress.pendingNodes = Math.max(0, progress.pendingNodes - 1);
    }

    // Queue for dispatch
    this.pendingDispatch.set(`${payload.runId}:${payload.nodeId}`, payload);

    // Attempt immediate dispatch
    this.tryDispatchPendingNodes();
  }

  /**
   * Handle node done
   */
  private handleNodeDone(payload: DAGNodeEventPayload): void {
    const progress = this.activeRuns.get(payload.runId);
    if (progress) {
      progress.runningNodes = Math.max(0, progress.runningNodes - 1);
      progress.completedNodes++;

      // Update assignment status
      const assignmentKey = `${payload.runId}:${payload.nodeId}`;
      const assignment = this.nodeAssignments.get(assignmentKey);
      if (assignment) {
        assignment.status = 'done';

        // Update progress assignments
        const idx = progress.assignments.findIndex(
          (a) => a.nodeId === payload.nodeId
        );
        if (idx !== -1) {
          progress.assignments[idx] = assignment;
        }
      }
    }

    // Clean up assignment
    const key = `${payload.runId}:${payload.nodeId}`;
    this.nodeAssignments.delete(key);
    this.pendingDispatch.delete(key);

    logger.info('dag_slaver_bridge_node_done', {
      runId: payload.runId,
      nodeId: payload.nodeId,
      duration: payload.duration,
    });
  }

  /**
   * Handle node failed
   */
  private handleNodeFailed(payload: DAGNodeEventPayload): void {
    const progress = this.activeRuns.get(payload.runId);
    if (progress) {
      progress.runningNodes = Math.max(0, progress.runningNodes - 1);
      progress.failedNodes++;

      // Update assignment status
      const assignmentKey = `${payload.runId}:${payload.nodeId}`;
      const assignment = this.nodeAssignments.get(assignmentKey);
      if (assignment) {
        assignment.status = 'failed';
      }
    }

    // Clean up
    const key = `${payload.runId}:${payload.nodeId}`;
    this.nodeAssignments.delete(key);
    this.pendingDispatch.delete(key);

    logger.warn('dag_slaver_bridge_node_failed', {
      runId: payload.runId,
      nodeId: payload.nodeId,
      error: payload.error,
    });
  }

  /**
   * Handle node skipped
   */
  private handleNodeSkipped(payload: DAGNodeEventPayload): void {
    const progress = this.activeRuns.get(payload.runId);
    if (progress) {
      progress.skippedNodes++;
    }

    // Clean up
    const key = `${payload.runId}:${payload.nodeId}`;
    this.pendingDispatch.delete(key);

    logger.info('dag_slaver_bridge_node_skipped', {
      runId: payload.runId,
      nodeId: payload.nodeId,
    });
  }

  /**
   * Handle ticket completed event from Slaver
   * Maps ticket completion back to DAG node completion
   */
  private handleTicketCompleted(payload: TicketCompletedPayload): void {
    // Find the assignment for this ticket
    for (const [key, assignment] of this.nodeAssignments.entries()) {
      if (assignment.nodeId === payload.ticketId) {
        const [runId] = key.split(':');

        logger.info('dag_slaver_bridge_ticket_completed', {
          ticketId: payload.ticketId,
          slaverId: payload.assignedTo,
          runId,
        });

        // The DAGExecutor will emit NODE_DONE which we handle above
        break;
      }
    }
  }

  /**
   * Try to dispatch pending nodes to idle Slavers
   */
  private tryDispatchPendingNodes(): void {
    if (this.pendingDispatch.size === 0) return;

    // Get available Slavers
    const idleSlavers = this.findIdleSlavers();
    if (idleSlavers.length === 0) {
      logger.debug('dag_slaver_bridge_no_idle_slavers');
      return;
    }

    // Dispatch nodes to available Slavers (round-robin)
    let slaverIdx = 0;
    for (const [key, payload] of this.pendingDispatch.entries()) {
      if (slaverIdx >= idleSlavers.length) break;

      const slaver = idleSlavers[slaverIdx];

      // Check Slaver capacity
      const currentAssignments = [...this.nodeAssignments.values()].filter(
        (a) => a.slaverId === slaver.id && a.status === 'assigned'
      ).length;

      if (currentAssignments >= this.config.maxConcurrentPerSlaver) {
        slaverIdx++;
        continue;
      }

      // Dispatch to this Slaver
      void this.dispatchNodeToSlaver(payload, slaver);
      this.pendingDispatch.delete(key);
      slaverIdx++;
    }
  }

  /**
   * Dispatch a DAG node to a Slaver via mailbox
   */
  private async dispatchNodeToSlaver(
    payload: DAGNodeEventPayload,
    slaver: IdleSlaver
  ): Promise<void> {
    const progress = this.activeRuns.get(payload.runId);

    // Create assignment record
    const assignment: SlaverAssignment = {
      slaverId: slaver.id,
      nodeId: payload.nodeId,
      assignedAt: Date.now(),
      status: 'assigned',
    };

    const key = `${payload.runId}:${payload.nodeId}`;
    this.nodeAssignments.set(key, assignment);

    if (progress) {
      progress.runningNodes++;
      progress.assignments.push(assignment);
    }

    // Send task assignment to Slaver mailbox
    const result = await sendTaskAssignment(slaver.id, {
      taskId: payload.nodeId,
      subject: `[DAG] ${payload.nodeId}`,
      description: `DAG Node Assignment\n\nRun ID: ${payload.runId}\nNode ID: ${payload.nodeId}\n\nExecute: eket task:claim ${payload.nodeId}`,
      assignedBy: this.config.masterId,
      priority: 'high',
      tags: ['dag', `run:${payload.runId}`],
    });

    if (result.success) {
      logger.info('dag_slaver_bridge_dispatched', {
        runId: payload.runId,
        nodeId: payload.nodeId,
        slaverId: slaver.id,
      });

      // Emit task assigned event
      this.eventBus.emit(TaskEvents.TASK_ASSIGNED, {
        taskId: payload.nodeId,
        assignee: slaver.id,
        assignedBy: this.config.masterId,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error('dag_slaver_bridge_dispatch_failed', {
        runId: payload.runId,
        nodeId: payload.nodeId,
        slaverId: slaver.id,
        error: result.error?.message,
      });

      // Requeue for retry
      this.pendingDispatch.set(key, payload);
      this.nodeAssignments.delete(key);
    }
  }

  /**
   * Find idle Slavers from heartbeat files
   */
  private findIdleSlavers(): IdleSlaver[] {
    const idleSlavers: IdleSlaver[] = [];
    const stateDir = path.join(this.config.projectRoot, '.eket', 'state');

    if (!fs.existsSync(stateDir)) {
      return idleSlavers;
    }

    try {
      const files = fs.readdirSync(stateDir);
      const heartbeatFiles = files.filter(
        (f) => f.startsWith('slaver_') && f.endsWith('_heartbeat.yml')
      );

      const now = Date.now();
      const staleThreshold = 5 * 60 * 1000; // 5 minutes

      for (const file of heartbeatFiles) {
        const filePath = path.join(stateDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const stat = fs.statSync(filePath);

        // Skip stale heartbeats
        if (now - stat.mtimeMs > staleThreshold) continue;

        // Parse heartbeat YAML (simple key: value format)
        const idMatch = content.match(/instance_id:\s*(\S+)/);
        const statusMatch = content.match(/status:\s*(\S+)/);
        const specialtyMatch = content.match(/specialty:\s*(\S+)/);

        if (!idMatch) continue;

        const status = statusMatch?.[1] ?? 'unknown';
        if (status !== 'idle') continue;

        idleSlavers.push({
          id: idMatch[1],
          specialty: specialtyMatch?.[1] ?? 'fullstack',
          lastSeen: stat.mtimeMs,
          currentLoad: 0,
          maxConcurrent: this.config.maxConcurrentPerSlaver,
        });
      }
    } catch (err) {
      logger.warn('dag_slaver_bridge_heartbeat_scan_failed', {
        error: (err as Error).message,
      });
    }

    // Also check agent pool inbox for idle notifications
    // This is a simpler approach using existing mailbox infrastructure
    void this.scanMailboxForIdleNotifications(idleSlavers);

    return idleSlavers;
  }

  /**
   * Scan Master mailbox for idle notifications from Slavers
   */
  private async scanMailboxForIdleNotifications(slavers: IdleSlaver[]): Promise<void> {
    try {
      const messages = await readMailbox(this.config.masterId);
      const knownIds = new Set(slavers.map((s) => s.id));

      for (const msg of messages) {
        if (msg.read) continue;

        try {
          const parsed = JSON.parse(msg.text) as Record<string, unknown>;
          if (parsed.type === 'idle_notification' && parsed.from) {
            const slaverId = parsed.from as string;
            if (!knownIds.has(slaverId)) {
              slavers.push({
                id: slaverId,
                specialty: 'fullstack',
                lastSeen: new Date(msg.timestamp).getTime(),
                currentLoad: 0,
                maxConcurrent: this.config.maxConcurrentPerSlaver,
              });
              knownIds.add(slaverId);
            }
          }
        } catch {
          // Ignore non-JSON messages
        }
      }
    } catch (err) {
      logger.debug('dag_slaver_bridge_mailbox_scan_failed', {
        error: (err as Error).message,
      });
    }
  }

  /**
   * Get progress for all active DAG runs
   */
  getActiveRunProgress(): DAGProgress[] {
    return [...this.activeRuns.values()];
  }

  /**
   * Get progress for a specific run
   */
  getRunProgress(runId: string): DAGProgress | undefined {
    return this.activeRuns.get(runId);
  }

  /**
   * Manually trigger dispatch check (for testing/debugging)
   */
  checkPendingDispatch(): void {
    this.tryDispatchPendingNodes();
  }

  /**
   * Get pending dispatch count
   */
  getPendingDispatchCount(): number {
    return this.pendingDispatch.size;
  }

  /**
   * Cleanup resources
   */
  disconnect(): void {
    // Clear all handlers
    this.eventBus.offAll(DAGEvents.RUN_STARTED);
    this.eventBus.offAll(DAGEvents.RUN_COMPLETED);
    this.eventBus.offAll(DAGEvents.NODE_PENDING);
    this.eventBus.offAll(DAGEvents.NODE_DONE);
    this.eventBus.offAll(DAGEvents.NODE_FAILED);
    this.eventBus.offAll(DAGEvents.NODE_SKIPPED);
    this.eventBus.offAll(TICKET_COMPLETED_EVENT);

    this.activeRuns.clear();
    this.nodeAssignments.clear();
    this.pendingDispatch.clear();

    logger.info('dag_slaver_bridge_disconnected');
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create DAG-Slaver bridge instance
 */
export function createDAGSlaverBridge(
  config?: DAGSlaverBridgeConfig
): DAGSlaverBridge {
  return new DAGSlaverBridge(config);
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalBridge: DAGSlaverBridge | null = null;

/**
 * Get global DAG-Slaver bridge instance
 */
export function getGlobalDAGSlaverBridge(): DAGSlaverBridge {
  if (!globalBridge) {
    globalBridge = createDAGSlaverBridge();
  }
  return globalBridge;
}

/**
 * Reset global bridge (for testing)
 */
export function resetGlobalDAGSlaverBridge(): void {
  if (globalBridge) {
    globalBridge.disconnect();
    globalBridge = null;
  }
}
