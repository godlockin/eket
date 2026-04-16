/**
 * EKET Framework - Usability Testing Skill
 * Version: 1.0.0
 *
 * 可用性测试技能：系统化验证设计方案的用户体验质量
 */

import type { Skill, SkillInput, SkillOutput } from '../types.js';
import { SkillCategory } from '../types.js';

export interface UsabilityTestingInput {
  /** 测试对象（产品/功能名称） */
  testTarget: string;
  /** 原型链接或版本 */
  prototypeUrl?: string;
  /** 测试任务列表 */
  tasks?: string[];
  /** 参与者数量 */
  participantCount?: number;
  /** 测试类型 */
  testType?: 'moderated' | 'unmoderated' | 'remote' | 'in-person';
}

export const usabilityTestingSkill: Skill = {
  name: 'usability-testing',
  category: SkillCategory.UX,
  description: '可用性测试：从任务设计到优先级排序的完整测试流程',
  version: '1.0.0',

  async execute(input: SkillInput): Promise<SkillOutput> {
    const data = input as unknown as UsabilityTestingInput;
    const participants = data.participantCount ?? 5;
    const testType = data.testType ?? 'moderated';

    const start = Date.now();
    return { success: true, data: {
      steps: [
        {
          step: 1,
          title: '定义测试目标和任务场景',
          description: '明确要验证什么，设计真实任务',
          actions: [
            `测试对象：${data.testTarget}，测试类型：${testType}`,
            '测试目标：要验证的设计假设或待答的可用性问题',
            '任务设计原则：基于真实用户场景，不提及 UI 元素名称',
            `任务列表（3-5个）：${data.tasks?.map((t, i) => `\n  Task${i + 1}: ${t}`).join('') ?? '\n  ⚠️ 需定义核心用户任务'}`,
            '成功标准：每个任务明确完成/失败判定标准',
            data.prototypeUrl ? `原型链接：${data.prototypeUrl}` : '⚠️ 需提供原型链接或测试版本',
          ],
        },
        {
          step: 2,
          title: '招募参与者',
          description: '找到真实目标用户',
          actions: [
            `目标人数：${participants} 人（定性测试，5人可发现 85% 可用性问题）`,
            '筛选标准：符合主要 Persona 特征（使用频率/职业/技术水平）',
            '排除标准：产品团队成员、设计/UX 从业者（专业偏差）',
            '招募渠道：现有用户池、用户社群、专业招募平台（UserTesting/Lookback）',
            '激励：合理报酬（礼品卡/代金券），确保参与动机纯粹',
            '时间安排：每次 45-60 分钟，预留缓冲时间',
          ],
        },
        {
          step: 3,
          title: '准备测试环境',
          description: '确保技术环境不干扰测试结果',
          actions: [
            '录屏工具：Lookback / Maze / UserZoom / OBS（线下）',
            '摄像头：记录面部表情和反应（需征得同意）',
            '备用设备：原型崩溃时的备用方案',
            '观察者席位：PM/Dev 静默旁观（或远程观察房间）',
            '测试清单：设备检查 → 录制测试 → 正式开始',
            '预约确认邮件：测试时间/链接/注意事项',
          ],
        },
        {
          step: 4,
          title: '执行测试',
          description: '收集真实用户行为数据',
          actions: [
            '开场白：介绍目的（测试设计，不测试用户）、无正确答案',
            '边想边说协议（Think Aloud）：请用户实时说出思考过程',
            '主持人守则：不引导、不解释、不回答"这个怎么用"',
            '允许沉默：沉默时等待，适时追问（"你现在在想什么？"）',
            '任务完成/放弃判定：超时或用户明确表示无法完成即记录失败',
            '测试后访谈：整体印象、困惑点、与期望的差距',
          ],
        },
        {
          step: 5,
          title: '记录观察',
          description: '系统化捕获测试数据',
          actions: [
            '量化数据：每个任务的完成/失败、完成时间、错误次数',
            '质化数据：用户困惑点、语言反馈、情绪变化',
            '关键引言：逐字记录代表性的用户言论（保留原话）',
            '观察节点标注：截图/时间戳 + 问题描述',
            '不同观察者同步：测试结束后15分钟内同步观察（记忆衰减快）',
          ],
        },
        {
          step: 6,
          title: '数据分析',
          description: '将观察转化为可量化的洞察',
          actions: [
            `任务完成率：${participants}人中完成每个任务的比例`,
            '错误率：每个任务的平均错误次数',
            '平均完成时间：对比预期完成时间',
            'SUS 量表（System Usability Scale）：10题问卷，0-100分，基准分 68',
            '问题频率分析：每个问题被多少用户触发',
            '主题聚类：将分散观察归类为设计问题模式',
          ],
        },
        {
          step: 7,
          title: '问题优先级排序与改进建议',
          description: '决定修复顺序和方案',
          actions: [
            '严重程度分级：严重（阻断任务）/ 中等（显著影响）/ 轻微（轻微摩擦）',
            '优先级矩阵：严重程度 × 出现频率，右上角优先修复',
            '改进建议：每个问题对应 1-2 个具体设计改进方向',
            '输出测试报告：执行摘要 + 方法 + 关键发现 + 问题清单 + 建议',
            '分享给团队：同步测试结果，对齐修复优先级',
            '跟踪修复：将高优先级问题转化为 design ticket，验证修复效果',
          ],
        },
      ],
      summary: `可用性测试完成：「${data.testTarget}」，${participants}名参与者，7步流程，产出优先级问题清单`,
    }, duration: Date.now() - start };
  },
};
