/**
 * EKET Framework - Persona Design Skill
 * Version: 1.0.0
 *
 * Persona 建模技能：基于调研数据构建用户画像和旅程地图
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface PersonaDesignInput {
  /** 产品/功能名称 */
  productName: string;
  /** 已完成的调研数据摘要 */
  researchSummary?: string;
  /** 预期用户细分数量 */
  segmentCount?: number;
}

export const personaDesignSkill: Skill = {
  name: 'persona-design',
  category: SkillCategory.UX,
  description: 'Persona 建模：从调研数据到用户画像和旅程地图',
  version: '1.0.0',

  async execute(input: SkillInput): Promise<SkillOutput> {
    const data = input as unknown as PersonaDesignInput;
    const segments = data.segmentCount ?? 2;

    const start = Date.now();
    return { success: true, data: {
      steps: [
        {
          step: 1,
          title: '用户群体聚类',
          description: '基于调研数据识别不同用户细分',
          actions: [
            '维度：行为模式、核心目标、主要痛点、技术熟练度',
            '方法：K-means聚类（定量）或亲和图聚类（定性）',
            `产品「${data.productName}」预期 ${segments} 个细分群体`,
            data.researchSummary ? `基于调研：${data.researchSummary}` : '⚠️ 警告：缺少调研数据，禁止凭空创建 Persona',
            '输出：细分群体清单，每个群体的核心特征描述',
          ],
        },
        {
          step: 2,
          title: '建立 Persona 档案',
          description: '为每个细分群体创建具象化的用户代表',
          actions: [
            'Persona 必填字段：姓名（虚构）、年龄、职业、教育背景',
            '目标：主要目标（使用产品想达成什么）、生活目标（更大愿景）',
            '痛点：当前方案的3个核心痛点（有数据支撑）',
            '行为习惯：设备偏好、使用场景、信息获取渠道',
            '代表性引言（来自真实访谈，概括该群体心声）',
            `档案保存：confluence/ux/persona-{segment-name}.md`,
          ],
        },
        {
          step: 3,
          title: '用户旅程地图',
          description: '可视化用户与产品的完整交互过程',
          actions: [
            '旅程阶段：感知 → 考虑 → 首次使用 → 持续使用 → 推荐',
            '每阶段记录：触点（用户接触产品的渠道）、行动（用户做什么）',
            '思考（用户想什么/期望）、情绪（情感曲线，高峰/低谷）',
            '机会点：情绪低谷处标注设计改进空间',
            '每个主要 Persona 建立独立旅程地图',
          ],
        },
        {
          step: 4,
          title: '确定 Persona 优先级',
          description: '避免设计试图同时满足所有人',
          actions: [
            '主要 Persona（Primary）：设计的核心服务对象，1-2个',
            '次要 Persona（Secondary）：兼顾但不为其牺牲主要体验，1-2个',
            '反面 Persona（Anti-persona）：明确排除的用户群，不为其设计',
            '决策原则：当主要/次要 Persona 需求冲突时，主要 Persona 优先',
          ],
        },
        {
          step: 5,
          title: '团队对齐',
          description: '让所有相关方对用户达成共识',
          actions: [
            '组织 Persona 发布会（PM + Design + Dev + 业务方）',
            '展示：每个 Persona 5分钟介绍 + Q&A',
            '活动：让团队用 Persona 视角讨论一个真实需求',
            '输出：团队认可的主要 Persona 清单，贴在工作区显眼位置',
            '共识文档：记录决策依据和优先级排序',
          ],
        },
        {
          step: 6,
          title: '定期校准',
          description: '保持 Persona 与真实用户同步',
          actions: [
            '每季度 review：对比新调研数据，检验 Persona 是否仍准确',
            '重大产品变化时：重新验证目标用户群是否改变',
            '数据驱动更新：用定量数据验证 Persona 属性的代表性',
            '版本管理：标注更新日期和变更原因',
          ],
        },
      ],
      summary: `Persona 建模完成：产品「${data.productName}」，${segments} 个用户细分，含旅程地图`,
    }, duration: Date.now() - start };
  },
};
