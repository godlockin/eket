/**
 * TASK-067: task_messages 表 CRUD 测试
 */
import { SQLiteClient } from '../../src/core/sqlite-client.js';

describe('SQLiteClient — task_messages', () => {
  let client: SQLiteClient;

  beforeEach(() => {
    client = new SQLiteClient(':memory:');
    const r = client.connect();
    expect(r.success).toBe(true);
  });

  afterEach(() => {
    client.close();
  });

  it('should append 5 messages and read back in seq order', () => {
    const taskId = 'TASK-067';
    const types = ['text', 'tool_use', 'tool_result', 'thinking', 'error'] as const;

    for (let i = 0; i < 5; i++) {
      const r = client.appendTaskMessage(taskId, {
        task_id: taskId,
        seq: i,
        type: types[i],
        content: `message ${i}`,
      });
      expect(r.success).toBe(true);
    }

    const r = client.getTaskMessages(taskId);
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(5);

    // verify order
    for (let i = 0; i < 5; i++) {
      expect(r.data![i].seq).toBe(i);
      expect(r.data![i].type).toBe(types[i]);
      expect(r.data![i].content).toBe(`message ${i}`);
    }
  });

  it('should enforce UNIQUE(task_id, seq) constraint', () => {
    const taskId = 'TASK-067-unique';
    client.appendTaskMessage(taskId, { task_id: taskId, seq: 0, type: 'text', content: 'first' });
    const r = client.appendTaskMessage(taskId, { task_id: taskId, seq: 0, type: 'text', content: 'duplicate' });
    expect(r.success).toBe(false);
    expect(r.error?.message).toMatch(/UNIQUE/i);
  });

  it('should auto-increment seq when using seq=0 start for different messages', () => {
    const taskId = 'TASK-067-auto';
    // Insert 3 with explicit seqs 0,1,2
    [0, 1, 2].forEach((seq) => {
      client.appendTaskMessage(taskId, { task_id: taskId, seq, type: 'text', content: `msg ${seq}` });
    });
    const r = client.getTaskMessages(taskId);
    expect(r.data?.map((m) => m.seq)).toEqual([0, 1, 2]);
  });

  it('should return empty array for unknown task_id', () => {
    const r = client.getTaskMessages('NONEXISTENT');
    expect(r.success).toBe(true);
    expect(r.data).toHaveLength(0);
  });
});
