/**
 * EKET Framework - User Research Skill
 * Version: 1.0.0
 *
 * 用户调研技能：系统化收集用户洞察，支撑设计决策
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface UserResearchInput {
  /** 调研主题 */
  topic: string;
  /** 调研目标（要验证的假设或回答的问题） */
  objectives?: string[];
  /** 目标用户群描述 */
  targetUsers?: string;
  /** 调研方法偏好 */
  preferredMethod?: 'interview' | 'survey' | 'ab-test' | 'data-analysis' | 'competitive-analysis';
  /** 时间限制（天） */
  timeConstraint?: number;
}

export const userResearchSkill: Skill = {
  name: 'user-research',
  category: SkillCategory.UX,
  description: '系统化用户调研：从目标设定到洞察报告的完整流程',
  version: '1.0.0',

  async execute(input: SkillInput): Promise<SkillOutput> {
    const data = input.data as unknown as UserResearchInput;

    const start = Date.now();
    return { success: true, data: {
      steps: [
        {
          step: 1,
          title: '确定调研目标',
          description: '明确要验证的假设或要回答的问题',
          actions: [
            `主题：${data.topic}`,
            '列出 3-5 个核心调研问题（"我们想了解用户是否..."）',
            '定义成功指标（什么样的数据能证明/证伪假设）',
            ...(data.objectives?.map(o => `目标：${o}`) ?? []),
          ],
        },
        {
          step: 2,
          title: '选择调研方法',
          description: '根据目标和资源选择最合适的方法',
          actions: [
            '定性方法：深度访谈（5-8人，挖掘动机和行为），情境调查（现场观察）',
            '定量方法：问卷调查（100+人，验证规模和频率），A/B测试',
            '次级研究：数据分析（现有日志/埋点），竞品分析',
            data.preferredMethod ? `推荐方法：${data.preferredMethod}` : '建议：定性+定量混合，先访谈再问卷验证',
          ],
        },
        {
          step: 3,
          title: '招募参与者',
          description: '找到符合目标用户画像的参与者',
          actions: [
            `目标用户：${data.targetUsers ?? '需根据产品定义目标用户群'}`,
            '定性：5-8人（饱和点，超过后新信息减少）',
            '定量：100+人（确保统计显著性，细分群体各50+）',
            '筛选标准：使用场景/频率/技术熟练度/人口学特征',
            '招募渠道：现有用户/用户社群/专业招募平台',
          ],
        },
        {
          step: 4,
          title: '设计调研脚本/问卷',
          description: '准备调研工具，避免引导性偏差',
          actions: [
            '访谈脚本：开场（关系建立）→ 背景问题 → 核心问题 → 深挖 → 收尾',
            '使用开放式问题（"你通常如何..."而非"你是否觉得..."）',
            '避免引导性提问（不提及功能名称，不给出选项）',
            '预留追问空间（"能多说一点吗？"/"那是什么感受？"）',
            '问卷：Likert量表 + 开放文本混合，控制在10分钟内完成',
          ],
        },
        {
          step: 5,
          title: '执行调研',
          description: '收集数据，保持客观中立',
          actions: [
            '访谈前：征得录音/录屏同意，测试设备',
            '主持原则：同理心倾听，不打断，不评判，不解释产品',
            '记录方式：录音+笔记（关注行为、引言、情绪）',
            '问题追踪：标注未回答的调研问题',
            data.timeConstraint ? `时间约束：${data.timeConstraint}天内完成` : '建议：2周内完成所有访谈',
          ],
        },
        {
          step: 6,
          title: '数据分析',
          description: '从原始数据中提炼模式和洞察',
          actions: [
            '转录录音（可用AI辅助，人工校对关键引言）',
            '亲和图分析：将观察/引言写便利贴，按主题聚类',
            '主题提炼：识别重复出现的模式和痛点',
            '定量数据：描述性统计、交叉分析、显著性检验',
            '三角验证：多种数据源互相印证',
          ],
        },
        {
          step: 7,
          title: '产出洞察报告',
          description: '将数据转化为可行的设计建议',
          actions: [
            '报告结构：执行摘要 → 方法说明 → 关键发现 → 用户引言 → 设计建议 → 后续步骤',
            '关键发现：3-5个核心洞察，每个有数据支撑',
            '优先级矩阵：按影响力×频率排序问题',
            `报告保存路径：confluence/ux/research-${data.topic.replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().split('T')[0]}.md`,
            '分享给 PM/Design/Dev 三方，对齐设计方向',
          ],
        },
      ],
      summary: `用户调研完成：主题「${data.topic}」，7步完整流程，产出洞察报告`,
    }, duration: Date.now() - start };
  },
};
