/**
 * EKET Framework - Instance Types
 */

import type { AgentRole } from './common.js';
import type { LevelChange, SkillFeedback } from './skill.js';

// ============================================================================
// Instance Types (Phase 4.1)
// ============================================================================

export interface Instance {
  id: string;
  type: 'human' | 'ai';
  agent_type: AgentRole;
  skills: string[];
  status: 'idle' | 'busy' | 'offline';
  currentTaskId?: string;
  currentLoad: number;
  lastHeartbeat?: number;
  metadata?: Record<string, unknown>;
  updatedAt?: number;
  currentLevel?: 1 | 2 | 3;
  levelChanges?: LevelChange[];
}

export interface InstanceRegistryConfig {
  redisPrefix?: string;
  heartbeatTimeout?: number;
}

// ============================================================================
// SlaveResult & Aggregation (TASK-121)
// ============================================================================

export interface SlaveResult {
  ticketId: string;
  slaverId: string;
  completedAt: number;
  prNumber?: number;
  prUrl?: string;
  filesChanged: string[];
  testsAdded: number;
  testsPassed: number;
  keyDecisions: string[];
  deferredIssues: string[];
  skillFeedback?: SkillFeedback;
}

export interface FileConflict {
  file: string;
  tickets: string[];
}

export interface AggregatedResult {
  tickets: string[];
  allFilesChanged: string[];
  conflicts: FileConflict[];
  totalTestsAdded: number;
  totalTestsPassed: number;
}

// ============================================================================
// Loop Context (TASK-120)
// ============================================================================

export interface LoopContext {
  attempt: number;
  lastFailReason: string;
}

// ============================================================================
// Instance Registry Types (v0.7.2)
// ============================================================================

export type InstanceController = 'ai' | 'human';
export type InstanceRole = 'master' | 'slaver';
export type InstanceStatus = 'initializing' | 'idle' | 'busy' | 'offline';

export interface InstanceConfig {
  controller: InstanceController;
  role: InstanceRole;
  agent_type: string;
  skills: string[];
  auto_mode?: boolean;
}

export interface InstanceInfo {
  id: string;
  controller: InstanceController;
  role: InstanceRole;
  agent_type: string;
  skills: string[];
  status: InstanceStatus;
  currentTask?: string;
  startedAt: number;
  lastHeartbeat: number;
}

export interface InstanceRegistryResult {
  success: boolean;
  instanceId?: string;
  error?: string;
}

export interface InstanceQueryOptions {
  role?: InstanceRole;
  controller?: InstanceController;
  status?: InstanceStatus;
  agent_type?: string;
}

export interface InstanceStatusUpdate {
  status: InstanceStatus;
  currentTask?: string;
  timestamp?: number;
}
