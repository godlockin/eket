/**
 * SQLite Checkpoint Tests
 * Tests for execution_checkpoints table CRUD operations
 */
import { SQLiteClient } from '../../src/core/sqlite-client.js';

describe('SQLiteClient — execution_checkpoints', () => {
  let client: SQLiteClient;
  const TEST_DB = ':memory:';

  beforeEach(() => {
    client = new SQLiteClient(TEST_DB);
    const result = client.connect();
    expect(result.success).toBe(true);
  });

  afterEach(() => {
    client.close();
  });

  describe('saveCheckpoint', () => {
    it('should save a new checkpoint', () => {
      const result = client.saveCheckpoint({
        ticketId: 'TASK-001',
        slaverId: 'slaver_1',
        phase: 'implement',
        stateJson: JSON.stringify({ filesChanged: ['src/foo.ts'] }),
      });
      expect(result.success).toBe(true);
    });

    it('should update existing checkpoint (upsert)', () => {
      client.saveCheckpoint({
        ticketId: 'TASK-001',
        slaverId: 'slaver_1',
        phase: 'implement',
        stateJson: '{"step": 1}',
      });
      const result = client.saveCheckpoint({
        ticketId: 'TASK-001',
        slaverId: 'slaver_1',
        phase: 'test',
        stateJson: '{"step": 2}',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('loadCheckpoint', () => {
    it('should load saved checkpoint', () => {
      client.saveCheckpoint({
        ticketId: 'TASK-002',
        slaverId: 'slaver_2',
        phase: 'analysis',
        stateJson: '{"notes": "analysis done"}',
      });
      const result = client.loadCheckpoint('TASK-002', 'slaver_2');
      expect(result.success).toBe(true);
      const row = result.data as { ticket_id: string; phase: string } | null;
      expect(row).not.toBeNull();
      expect(row?.ticket_id).toBe('TASK-002');
      expect(row?.phase).toBe('analysis');
    });

    it('should return null for non-existent checkpoint', () => {
      const result = client.loadCheckpoint('TASK-999', 'slaver_x');
      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete existing checkpoint', () => {
      client.saveCheckpoint({
        ticketId: 'TASK-003',
        slaverId: 'slaver_3',
        phase: 'pr',
        stateJson: '{}',
      });
      const deleteResult = client.deleteCheckpoint('TASK-003', 'slaver_3');
      expect(deleteResult.success).toBe(true);

      const loadResult = client.loadCheckpoint('TASK-003', 'slaver_3');
      expect(loadResult.success).toBe(true);
      expect(loadResult.data).toBeNull();
    });

    it('should succeed even if checkpoint does not exist', () => {
      const result = client.deleteCheckpoint('TASK-404', 'nobody');
      expect(result.success).toBe(true);
    });
  });
});
