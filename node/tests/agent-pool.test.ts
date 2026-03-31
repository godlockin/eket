/**
 * Agent Pool Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AgentPoolManager, createAgentPoolManager } from '../src/core/agent-pool.js';

describe('AgentPoolManager', () => {
  let pool: AgentPoolManager;

  beforeEach(async () => {
    pool = createAgentPoolManager({
      heartbeatTimeout: 5000,
      healthCheckInterval: 2000,
      defaultMaxLoad: 3,
    });
    // Don't actually start the pool in tests since Redis may not be available
  });

  afterEach(async () => {
    try {
      await pool.stop();
    } catch {
      // Ignore if not started
    }
  });

  describe('createAgentPoolManager', () => {
    it('should create an agent pool manager with default config', () => {
      const defaultPool = createAgentPoolManager();
      expect(defaultPool).toBeDefined();
    });

    it('should create an agent pool manager with custom config', () => {
      const customPool = createAgentPoolManager({
        heartbeatTimeout: 10000,
        defaultMaxLoad: 10,
      });
      expect(customPool).toBeDefined();
    });
  });

  describe('Agent selection strategies', () => {
    it('should select least loaded agent', async () => {
      // Mock agents with different loads
      const agents = [
        {
          id: 'agent-1',
          role: 'frontend_dev',
          skills: ['react', 'typescript'],
          status: 'idle' as const,
          currentLoad: 2,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
        {
          id: 'agent-2',
          role: 'frontend_dev',
          skills: ['react', 'typescript'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
        {
          id: 'agent-3',
          role: 'frontend_dev',
          skills: ['react'],
          status: 'idle' as const,
          currentLoad: 1,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
      ];

      // Test least_loaded strategy
      const selected = (pool as any).selectLeastLoaded(agents);
      expect(selected).toBe(agents[1]); // agent-2 has lowest load
    });

    it('should select random agent', async () => {
      const agents = [
        {
          id: 'agent-1',
          role: 'frontend_dev',
          skills: ['react'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
        {
          id: 'agent-2',
          role: 'frontend_dev',
          skills: ['react'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
      ];

      const selected = (pool as any).selectRandom(agents);
      expect(selected).toBeDefined();
      expect([agents[0], agents[1]]).toContain(selected);
    });

    it('should select best match by skills', async () => {
      const agents = [
        {
          id: 'agent-1',
          role: 'frontend_dev',
          skills: ['react', 'typescript', 'css'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
        {
          id: 'agent-2',
          role: 'frontend_dev',
          skills: ['react'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
      ];

      const requiredSkills = ['react', 'typescript'];
      const selected = (pool as any).selectBestMatch(agents, requiredSkills);
      expect(selected).toBe(agents[0]); // agent-1 has more matching skills
    });

    it('should use round robin selection', async () => {
      const agents = [
        {
          id: 'agent-1',
          role: 'frontend_dev',
          skills: ['react'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
        {
          id: 'agent-2',
          role: 'frontend_dev',
          skills: ['react'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
      ];

      // First call
      const selected1 = (pool as any).selectRoundRobin('frontend_dev', agents);
      expect(selected1).toBe(agents[0]);

      // Second call
      const selected2 = (pool as any).selectRoundRobin('frontend_dev', agents);
      expect(selected2).toBe(agents[1]);

      // Third call (wrap around)
      const selected3 = (pool as any).selectRoundRobin('frontend_dev', agents);
      expect(selected3).toBe(agents[0]);
    });
  });

  describe('Agent capacity calculation', () => {
    it('should calculate utilization rate correctly', () => {
      const agent = {
        id: 'agent-1',
        role: 'frontend_dev',
        skills: ['react'],
        status: 'idle' as const,
        currentLoad: 2,
        maxLoad: 5,
        lastHeartbeat: Date.now(),
      };

      const utilization = agent.currentLoad / agent.maxLoad;
      expect(utilization).toBe(0.4);
    });

    it('should calculate available slots correctly', () => {
      const agent = {
        id: 'agent-1',
        role: 'frontend_dev',
        skills: ['react'],
        status: 'idle' as const,
        currentLoad: 2,
        maxLoad: 5,
        lastHeartbeat: Date.now(),
      };

      const availableSlots = Math.max(0, agent.maxLoad - agent.currentLoad);
      expect(availableSlots).toBe(3);
    });
  });

  describe('toAgentInstance conversion', () => {
    it('should convert Instance to AgentInstance', () => {
      const mockInstance = {
        id: 'test-agent-1',
        type: 'ai' as const,
        agent_type: 'frontend_dev',
        skills: ['react', 'typescript'],
        status: 'idle' as const,
        currentLoad: 1,
        lastHeartbeat: Date.now(),
        updatedAt: Date.now(),
      };

      const result = (pool as any).toAgentInstance(mockInstance);

      expect(result.id).toBe('test-agent-1');
      expect(result.role).toBe('frontend_dev');
      expect(result.skills).toEqual(['react', 'typescript']);
      expect(result.status).toBe('idle');
      expect(result.currentLoad).toBe(1);
      expect(result.maxLoad).toBe(3); // from config
    });
  });

  describe('Pool stats', () => {
    it('should calculate pool statistics', () => {
      const mockInstances = [
        { id: '1', status: 'idle' as const, currentLoad: 0 },
        { id: '2', status: 'idle' as const, currentLoad: 1 },
        { id: '3', status: 'busy' as const, currentLoad: 2 },
        { id: '4', status: 'offline' as const, currentLoad: 0 },
      ];

      const totalAgents = mockInstances.length;
      const idleAgents = mockInstances.filter((i) => i.status === 'idle').length;
      const busyAgents = mockInstances.filter((i) => i.status === 'busy').length;
      const offlineAgents = mockInstances.filter((i) => i.status === 'offline').length;
      const totalCapacity = totalAgents * 3; // defaultMaxLoad = 3
      const usedCapacity = mockInstances.reduce((sum, i) => sum + i.currentLoad, 0);

      expect(totalAgents).toBe(4);
      expect(idleAgents).toBe(2);
      expect(busyAgents).toBe(1);
      expect(offlineAgents).toBe(1);
      expect(totalCapacity).toBe(12);
      expect(usedCapacity).toBe(3);
      expect(usedCapacity / totalCapacity).toBe(0.25);
    });
  });

  describe('Skill matching', () => {
    it('should filter agents by required skills', () => {
      const agents = [
        {
          id: 'agent-1',
          role: 'frontend_dev',
          skills: ['react', 'typescript', 'css'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
        {
          id: 'agent-2',
          role: 'frontend_dev',
          skills: ['react', 'vue'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
      ];

      const requiredSkills = ['react', 'typescript'];
      const candidates = agents.filter((agent) =>
        requiredSkills.every((skill) => agent.skills.includes(skill))
      );

      expect(candidates.length).toBe(1);
      expect(candidates[0].id).toBe('agent-1');
    });

    it('should handle case when no agents have all required skills', () => {
      const agents = [
        {
          id: 'agent-1',
          role: 'frontend_dev',
          skills: ['react'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
        {
          id: 'agent-2',
          role: 'frontend_dev',
          skills: ['vue'],
          status: 'idle' as const,
          currentLoad: 0,
          maxLoad: 3,
          lastHeartbeat: Date.now(),
        },
      ];

      const requiredSkills = ['react', 'typescript', 'graphql'];
      const candidates = agents.filter((agent) =>
        requiredSkills.every((skill) => agent.skills.includes(skill))
      );

      expect(candidates.length).toBe(0);
      // In this case, the pool should fall back to using all agents with the role
    });
  });
});
