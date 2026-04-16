/**
 * Slaver Hard Rules — TASK-039
 * 进度上报 mini-rules 自检 checklist 规则常量
 */

export interface SlaverHardRule {
  id: string;
  desc: string;
}

export const SLAVER_HARD_RULES: SlaverHardRule[] = [
  { id: 'SR-01', desc: '不得修改验收标准/优先级/依赖关系' },
  { id: 'SR-02', desc: '不得审查自己的 PR' },
  { id: 'SR-03', desc: '连续读5+文件无代码产出 → 立即写或报 BLOCKED' },
  { id: 'SR-04', desc: '架构类变更必须上报 Master，禁止自行决定' },
  { id: 'SR-05', desc: 'PR 必须包含真实命令输出，不得仅描述或截图' },
];
