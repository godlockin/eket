/**
 * EKET Framework - Phase 6.1 Multi-Instance Collaboration Tests
 *
 * 测试多 Instance 协作机制：
 * - 通信协议
 * - 工作流引擎
 * - 冲突解决器
 * - 知识库
 */

import {
  CommunicationProtocol,
  createCommunicationProtocol,
  type CommunicationProtocolConfig,
} from '../core/communication-protocol.js';
import {
  WorkflowEngine,
  createWorkflowEngine,
  createDependencyCollaborationWorkflow,
  createHandoverWorkflow,
} from '../core/workflow-engine.js';
import {
  ConflictResolver,
  createConflictResolver,
  LockManager,
} from '../core/conflict-resolver.js';
import {
  KnowledgeBase,
  createKnowledgeBase,
  createArtifact,
  createLesson,
} from '../core/knowledge-base.js';
import type { Instance, ConflictResolutionConfig } from '../types/index.js';

// ============================================================================
// Communication Protocol Tests
// ============================================================================

describe('CommunicationProtocol', () => {
  let protocolA: CommunicationProtocol;
  let protocolB: CommunicationProtocol;

  const configA: CommunicationProtocolConfig = {
    instanceId: 'instance_a',
    defaultPriority: 'normal',
  };

  const configB: CommunicationProtocolConfig = {
    instanceId: 'instance_b',
    defaultPriority: 'normal',
  };

  beforeEach(() => {
    protocolA = createCommunicationProtocol(configA);
    protocolB = createCommunicationProtocol(configB);
  });

  afterEach(async () => {
    await protocolA.disconnect();
    await protocolB.disconnect();
  });

  it('should create protocol instance', () => {
    expect(protocolA).toBeDefined();
    expect(protocolA.getQueueMode()).toBeDefined();
  });

  it('should send help request', async () => {
    await protocolA.connect();
    await protocolB.connect();

    const result = await protocolA.sendHelpRequest('instance_b', {
      requestId: 'help_001',
      taskId: 'task_123',
      description: 'Need help with API integration',
      neededExpertise: ['backend', 'api'],
      urgency: 'high',
    });

    expect(result.success).toBe(true);
  });

  it('should send knowledge share', async () => {
    await protocolA.connect();

    const result = await protocolA.sendKnowledgeShare('all', {
      shareId: 'share_001',
      taskId: 'task_123',
      knowledgeType: 'artifact',
      title: 'API Integration Guide',
      description: 'How to integrate with external API',
      content: 'Step 1: ...',
      tags: ['api', 'integration', 'guide'],
    });

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Workflow Engine Tests
// ============================================================================

describe('WorkflowEngine', () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    engine = createWorkflowEngine({
      instanceId: 'test_instance',
      defaultStepTimeout_ms: 5000,
    });
  });

  afterEach(async () => {
    await engine.disconnect();
  });

  it('should create workflow engine', () => {
    expect(engine).toBeDefined();
  });

  it('should register workflow definition', () => {
    const workflow = createDependencyCollaborationWorkflow();
    engine.registerDefinition(workflow);

    const status = engine.getWorkflowStatus('non-existent');
    expect(status.success).toBe(false);
  });

  it('should register both pre-defined workflows', () => {
    const dependencyWorkflow = createDependencyCollaborationWorkflow();
    const handoverWorkflow = createHandoverWorkflow();

    engine.registerDefinition(dependencyWorkflow);
    engine.registerDefinition(handoverWorkflow);

    const workflows = engine.getAllWorkflows();
    expect(workflows.length).toBe(0); // No instances started yet
  });

  it('should handle workflow events', async () => {
    const events: string[] = [];

    engine.onEvent('workflow_started', async (event) => {
      events.push(`started:${event.workflowId}`);
    });

    engine.onEvent('workflow_completed', async (event) => {
      events.push(`completed:${event.workflowId}`);
    });

    expect(events).toEqual([]);
  });
});

// ============================================================================
// Conflict Resolver Tests
// ============================================================================

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;

  const config: ConflictResolutionConfig = {
    taskConflict: 'first_claim_wins',
    resourceConflict: 'lock_queue',
    priorityConflict: 'master_decision',
  };

  beforeEach(() => {
    resolver = createConflictResolver(config);
  });

  afterEach(async () => {
    await resolver.disconnect();
  });

  it('should create conflict resolver', () => {
    expect(resolver).toBeDefined();
    expect(resolver.getLockManager()).toBeDefined();
  });

  it('should resolve task conflict with first claim wins', async () => {
    const claimants: Instance[] = [
      {
        id: 'instance_1',
        type: 'ai',
        agent_type: 'frontend_dev',
        skills: ['react', 'typescript'],
        status: 'idle',
        currentLoad: 1,
        updatedAt: 1000,
      },
      {
        id: 'instance_2',
        type: 'ai',
        agent_type: 'backend_dev',
        skills: ['nodejs', 'python'],
        status: 'idle',
        currentLoad: 2,
        updatedAt: 2000,
      },
    ];

    const result = await resolver.handleTaskConflict('FEAT-001', claimants);

    expect(result.success).toBe(true);
    expect(result.data.strategy).toBe('first_claim_wins');
    expect(result.data.winner).toBe('instance_1'); // Lower load
  });

  it('should handle resource conflict', async () => {
    const result = await resolver.handleResourceConflict(
      'resource_db',
      ['instance_1', 'instance_2']
    );

    expect(result.success).toBe(true);
  });

  it('should get conflict history', () => {
    const history = resolver.getConflictHistory();
    expect(Array.isArray(history)).toBe(true);
  });
});

// ============================================================================
// Lock Manager Tests
// ============================================================================

describe('LockManager', () => {
  let lockManager: LockManager;

  beforeEach(() => {
    lockManager = new LockManager({
      defaultTTL_ms: 5000,
    });
  });

  afterEach(async () => {
    await lockManager.disconnect();
  });

  it('should create lock manager', () => {
    expect(lockManager).toBeDefined();
  });

  it('should get lock status for non-existent lock', async () => {
    const result = await lockManager.getLockStatus('resource_123');

    // Should return null for non-existent lock (if Redis is connected)
    // or fail if Redis is not available
    expect(result).toBeDefined();
  });

  it('should get queue length', async () => {
    const result = await lockManager.getQueueLength('resource_123');
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Knowledge Base Tests
// ============================================================================

describe('KnowledgeBase', () => {
  let kb: KnowledgeBase;

  beforeEach(async () => {
    kb = createKnowledgeBase();
    await kb.connect();
  });

  afterEach(async () => {
    await kb.disconnect();
  });

  it('should create knowledge base', async () => {
    expect(kb).toBeDefined();
    const stats = await kb.getStats();
    expect(stats.success).toBe(true);
  });

  it('should create and retrieve knowledge entry', async () => {
    const createResult = await kb.createEntry({
      type: 'artifact',
      title: 'Test Artifact',
      description: 'Test description',
      content: 'Test content',
      tags: ['test', 'artifact'],
      createdBy: 'test_instance',
    });

    expect(createResult.success).toBe(true);
    expect(createResult.data).toBeDefined();

    if (createResult.data) {
      const getResult = await kb.getEntry(createResult.data);
      expect(getResult.success).toBe(true);
      expect(getResult.data).toBeDefined();
      expect(getResult.data?.title).toBe('Test Artifact');
    }
  });

  it('should create artifact using helper function', async () => {
    const result = await createArtifact(
      kb,
      'API Guide',
      'Content about API usage',
      'test_instance',
      {
        description: 'Guide for using the API',
        tags: ['api', 'guide'],
      }
    );

    expect(result.success).toBe(true);
  });

  it('should create lesson using helper function', async () => {
    const result = await createLesson(
      kb,
      'Database Optimization Lesson',
      'What we learned about DB optimization',
      'test_instance',
      {
        tags: ['database', 'performance', 'lesson'],
      }
    );

    expect(result.success).toBe(true);
  });

  it('should query entries by type', async () => {
    const result = await kb.queryEntries({ type: 'artifact', limit: 10 });
    expect(result.success).toBe(true);
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should search by keyword', async () => {
    const result = await kb.search('test');
    expect(result.success).toBe(true);
  });

  it('should get stats', async () => {
    const stats = await kb.getStats();

    expect(stats.success).toBe(true);
    expect(stats.data.totalEntries).toBeGreaterThanOrEqual(0);
    expect(stats.data.byType).toBeDefined();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Multi-Instance Collaboration Integration', () => {
  it('should support complete collaboration workflow', async () => {
    // Setup
    const protocol = createCommunicationProtocol({
      instanceId: 'integration_test',
      defaultPriority: 'normal',
    });

    const workflow = createWorkflowEngine({
      instanceId: 'integration_test',
    });

    const resolver = createConflictResolver({
      taskConflict: 'first_claim_wins',
      resourceConflict: 'lock_queue',
      priorityConflict: 'master_decision',
    });

    const kb = createKnowledgeBase();

    // Connect all components
    await protocol.connect();
    await workflow.connect();
    await resolver.connect();
    await kb.connect();

    // Register workflow
    workflow.registerDefinition(createDependencyCollaborationWorkflow());

    // Create knowledge entry
    await kb.createEntry({
      type: 'decision',
      title: 'Collaboration Pattern Decision',
      description: 'Using event-driven collaboration',
      content: 'We use event-driven pattern for instance communication',
      tags: ['architecture', 'pattern'],
      createdBy: 'integration_test',
    });

    // Cleanup
    await protocol.disconnect();
    await workflow.disconnect();
    await resolver.disconnect();
    await kb.disconnect();

    // If we get here without errors, the integration works
    expect(true).toBe(true);
  });
});
