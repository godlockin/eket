/**
 * TASK-068: agent_skills 表 + Skills API 路由测试
 */

import { SQLiteClient } from '../../src/core/sqlite-client.js';

describe('agent_skills — SQLiteClient', () => {
  let client: SQLiteClient;

  beforeEach(() => {
    client = new SQLiteClient(':memory:');
    client.connect();
  });

  afterEach(() => {
    client.close();
  });

  it('setAgentSkills — 写入绑定关系', () => {
    const result = client.setAgentSkills('agent_1', ['skill_a', 'skill_b', 'skill_c']);
    expect(result.success).toBe(true);
  });

  it('getAgentSkills — 读取绑定关系', () => {
    client.setAgentSkills('agent_1', ['skill_a', 'skill_b']);
    const result = client.getAgentSkills('agent_1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual(['skill_a', 'skill_b']);
  });

  it('setAgentSkills — 全量替换（第二次 set 覆盖第一次）', () => {
    client.setAgentSkills('agent_1', ['skill_a', 'skill_b']);
    client.setAgentSkills('agent_1', ['skill_c']);
    const result = client.getAgentSkills('agent_1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual(['skill_c']);
  });

  it('getAgentSkills — 未知 agent 返回空数组', () => {
    const result = client.getAgentSkills('no_such_agent');
    expect(result.success).toBe(true);
    expect(result.data).toEqual([]);
  });

  it('setAgentSkills — 重复 skillId 只写一次（IGNORE)', () => {
    client.setAgentSkills('agent_1', ['skill_a', 'skill_a']);
    const result = client.getAgentSkills('agent_1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual(['skill_a']);
  });
});
