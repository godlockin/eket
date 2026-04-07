/**
 * Tests for type definitions
 */

import type {
  EketClientConfig,
  AgentRegistration,
  Task,
  Message,
} from '../src/types';

describe('Types', () => {
  describe('EketClientConfig', () => {
    it('should accept valid config', () => {
      const config: EketClientConfig = {
        serverUrl: 'http://localhost:8080',
        jwtToken: 'token',
        timeout: 30000,
        enableWebSocket: true,
      };

      expect(config.serverUrl).toBe('http://localhost:8080');
    });

    it('should accept minimal config', () => {
      const config: EketClientConfig = {
        serverUrl: 'http://localhost:8080',
      };

      expect(config.serverUrl).toBe('http://localhost:8080');
    });
  });

  describe('AgentRegistration', () => {
    it('should accept valid registration', () => {
      const registration: AgentRegistration = {
        agent_type: 'claude_code',
        role: 'slaver',
        specialty: 'frontend',
        capabilities: ['react', 'typescript'],
      };

      expect(registration.agent_type).toBe('claude_code');
      expect(registration.role).toBe('slaver');
    });
  });

  describe('Task', () => {
    it('should accept valid task', () => {
      const task: Task = {
        id: 'FEAT-001',
        title: 'Test task',
        type: 'feature',
        priority: 'P1',
        status: 'ready',
        created_at: '2026-04-07T10:00:00Z',
        updated_at: '2026-04-07T10:00:00Z',
      };

      expect(task.id).toBe('FEAT-001');
      expect(task.type).toBe('feature');
    });
  });

  describe('Message', () => {
    it('should accept valid message', () => {
      const message: Message = {
        from: 'slaver_001',
        to: 'master',
        type: 'task_claimed',
        payload: { task_id: 'FEAT-001' },
      };

      expect(message.from).toBe('slaver_001');
      expect(message.type).toBe('task_claimed');
    });
  });
});
