/**
 * EKET Framework - Wireframe & Prototype Skill
 * Version: 1.0.0
 *
 * 线框图和原型技能：从信息架构到可测试交互原型
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface WireframePrototypeInput {
  /** 功能/页面名称 */
  featureName: string;
  /** 核心用户流程描述 */
  userFlows?: string[];
  /** 目标平台 */
  platform?: 'web' | 'mobile-ios' | 'mobile-android' | 'desktop' | 'responsive';
  /** 原型工具偏好 */
  tool?: 'figma' | 'sketch' | 'balsamiq' | 'axure';
}

export const wireframePrototypeSkill: Skill = {
  name: 'wireframe-prototype',
  category: SkillCategory.UX,
  description: '线框图与原型：从IA到可用性测试就绪的交互原型',
  version: '1.0.0',

  async execute(input: SkillInput): Promise<SkillOutput> {
    const data = input.data as unknown as WireframePrototypeInput;
    const tool = data.tool ?? 'figma';
    const platform = data.platform ?? 'responsive';

    const start = Date.now();
    return { success: true, data: {
      steps: [
        {
          step: 1,
          title: '信息架构（IA）',
          description: '定义内容组织结构和导航逻辑',
          actions: [
            `功能：${data.featureName}，平台：${platform}`,
            '站点地图：列出所有页面/屏幕及层级关系',
            '导航结构：主导航、次级导航、面包屑、快捷入口',
            '内容清单：每个页面需要展示的信息元素',
            '卡片分类测试（Card Sorting）：验证用户的信息分类直觉',
            '树形测试（Tree Testing）：验证导航结构是否可找到',
          ],
        },
        {
          step: 2,
          title: '低保真线框图',
          description: '快速传达布局和内容优先级',
          actions: [
            '工具：手绘或 Balsamiq（刻意粗糙，避免过早关注视觉）',
            '覆盖所有关键页面：首页、核心功能页、空状态、错误状态',
            `用户流程：${data.userFlows?.join('、') ?? '需定义核心用户流程'}`,
            '标注：功能说明、交互行为、内容占位',
            '原则：关注布局和功能，不关注颜色/字体/精确尺寸',
          ],
        },
        {
          step: 3,
          title: '用户流程图',
          description: '可视化关键路径和决策分支',
          actions: [
            '覆盖：Happy Path（主流程）+ 异常路径（错误/边界情况）',
            '标注决策点（菱形）：用户需要做选择的地方',
            '标注系统状态变化（矩形）：触发条件和结果',
            '识别流程断点：用户可能流失或困惑的节点',
            '与 PM 确认：流程是否覆盖全部业务场景',
          ],
        },
        {
          step: 4,
          title: '中保真原型',
          description: '可点击的交互原型，用于测试',
          actions: [
            `工具：${tool}（推荐 Figma，协作性最强）`,
            '交互：页面跳转、hover 状态、表单交互、模态框',
            '组件复用：建立局部组件库，保证一致性',
            '覆盖所有测试任务所需的流程（端到端可操作）',
            '命名规范：页面/组件按功能命名，不用 Screen1/2/3',
          ],
        },
        {
          step: 5,
          title: '内部评审',
          description: '在用户测试前过滤明显问题',
          actions: [
            '设计自评：对照 Persona 目标和 IA 原则检查',
            'PM 评审：确认功能覆盖完整，业务逻辑正确',
            '同行评审（Peer Review）：其他设计师提供视角',
            '记录 feedback 和修改决策（保留决策痕迹）',
            '输出：评审通过的原型，准备进入用户测试',
          ],
        },
        {
          step: 6,
          title: '可用性测试',
          description: '用真实用户验证设计假设',
          actions: [
            '招募 5 名目标用户（5人足以发现 85% 的可用性问题）',
            '准备测试任务（3-5个，对应核心用户流程）',
            '执行边想边说协议（Think Aloud Protocol）',
            '记录：任务完成率、错误次数、完成时间、困惑点',
            '主持人不引导，观察者记录观察（不参与）',
          ],
        },
        {
          step: 7,
          title: '迭代修改',
          description: '基于测试反馈改进设计',
          actions: [
            '测试后24小时内分析结果（记忆最清晰时）',
            '问题分级：严重（阻断任务完成）/ 中等 / 轻微',
            '修复严重问题，记录所有问题及处理决策',
            '如修改较大，进行第二轮测试验证改进效果',
            '输出：迭代后的原型 + 测试报告（含问题清单和修改说明）',
          ],
        },
      ],
      summary: `线框图与原型完成：「${data.featureName}」，7步流程，${tool} 原型就绪可测试`,
    }, duration: Date.now() - start };
  },
};
